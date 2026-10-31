import { Env } from "../../src/env";
import { complete } from "../../src/providers";
import { checkRateLimit } from "../../src/ratelimit";
import { trackUsage } from "../../src/usage";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const ip = context.request.headers.get("cf-connecting-ip") || "unknown";
  await checkRateLimit(context.env, ip);

  const body: { text: string } = await context.request.json();
  const { text } = body;

  if (!text || typeof text !== "string" || text.length > 4000) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "text erforderlich, max 4000 Zeichen" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const model = "gemini-3.5-flash-lite";
  const system = "Erstelle einen kurzen Titel (maximal 6 Wörter, Deutsch, keine Anführungszeichen) für den folgenden Text.";

  const result = await complete(context.env, {
    model,
    system,
    messages: [{ role: "user", content: text }],
    maxTokens: 20,
    private: context.request.headers.get("x-jeffa-private") === "1",
  });

  await trackUsage(context.env, "google-ai-studio", model, result.usage?.promptTokens || 0, result.usage?.outputTokens || 0, 0);

  return new Response(JSON.stringify({ title: result.reply.replace(/^["']|["']$/g, "").trim() }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
