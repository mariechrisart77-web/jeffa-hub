import { Env } from "../../../src/env";
import { complete } from "../../../src/providers";
import { checkRateLimit } from "../../../src/ratelimit";
import { trackUsage } from "../../../src/usage";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const ip = context.request.headers.get("cf-connecting-ip") || "unknown";
  await checkRateLimit(context.env, ip);

  const body: { notes: string[]; existing: string[] } = await context.request.json();
  const { notes, existing } = body;

  if (!Array.isArray(notes) || notes.length === 0) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "notes erforderlich" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const model = "gemini-3.5-flash-lite";
  const system = "Fasse die folgenden Feedback-Notizen zusammen und dedupliziere sie. Maximal 5 Punkte, jeweils maximal 15 Wörter. Ausgabe als JSON-Array von Strings.";
  const content = `Bestehend:\n${(existing || []).map((n) => `- ${n}`).join("\n")}\n\nNeu:\n${notes.map((n) => `- ${n}`).join("\n")}`;

  const result = await complete(context.env, {
    model,
    system,
    messages: [{ role: "user", content }],
    maxTokens: 150,
    private: context.request.headers.get("x-jeffa-private") === "1",
  });

  await trackUsage(context.env, "google-ai-studio", model, result.usage?.promptTokens || 0, result.usage?.outputTokens || 0, 0);

  let parsed: string[] = [];
  try {
    const cleaned = result.reply.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) parsed = [];
  } catch {
    parsed = result.reply.split("\n").filter((l) => l.trim().startsWith("-")).map((l) => l.trim().slice(1).trim());
  }

  return new Response(JSON.stringify({ notes: parsed.slice(0, 5) }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
