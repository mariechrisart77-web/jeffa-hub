import { Env } from "../../src/env";
import { complete } from "../../src/providers";
import { checkRateLimit } from "../../src/ratelimit";
import { trackUsage } from "../../src/usage";
import { getKey } from "../../src/keys";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const ip = context.request.headers.get("cf-connecting-ip") || "unknown";
  await checkRateLimit(context.env, ip);

  const body: { profile: any; adult: boolean } = await context.request.json();
  const { profile, adult } = body;

  if (!profile || typeof profile !== "object") {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "profile erforderlich" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  let model = "gemini-3.5-flash-lite";
  let useVenice = false;

  if (adult) {
    const veniceKey = await getKey(context.env, "venice");
    if (veniceKey) {
      model = "venice-uncensored";
      useVenice = true;
    }
  }

  const genderRaw = String((profile && (profile.gender || profile.persona?.gender)) || "").trim().toLowerCase();
  const genderWord = genderRaw === "m" || genderRaw === "male" || genderRaw === "mann" ? "männlich" : genderRaw === "d" || genderRaw === "divers" ? "divers" : genderRaw === "w" || genderRaw === "female" || genderRaw === "frau" ? "weiblich" : "";
  const system = "Erstelle basierend auf den folgenden Einstellungen einen kompakten deutschen System-Prompt (maximal 180 Wörter) für einen Charakter-Chat. Keine expliziten sexuellen Inhalte. Alle Charaktere sind erwachsen (18+)." + (genderWord ? ` Die Figur ist ${genderWord}; nutze durchgehend die passende grammatische Form.` : "");
  const content = JSON.stringify(profile, null, 2);

  const result = await complete(context.env, {
    model,
    system,
    messages: [{ role: "user", content }],
    maxTokens: 300,
    private: context.request.headers.get("x-jeffa-private") === "1",
  });

  const provider = useVenice ? "venice" : "google-ai-studio";
  await trackUsage(context.env, provider, model, result.usage?.promptTokens || 0, result.usage?.outputTokens || 0, 0);

  return new Response(JSON.stringify({ systemPrompt: result.reply }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
