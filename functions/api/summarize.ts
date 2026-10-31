import { Env, intVar } from "../../src/env";
import { ChatMessage, callModel } from "../../src/providers";
import { checkRateLimit } from "../../src/ratelimit";

interface SummarizeBody {
  messages: ChatMessage[];
  previousSummary?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const ip = context.request.headers.get("cf-connecting-ip") || "unknown";
  await checkRateLimit(context.env, ip);

  const body: SummarizeBody = await context.request.json();
  const { messages, previousSummary } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "messages erforderlich" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const summaryModel = "gemini-3.5-flash-lite";
  const systemPrompt = "Fasse die folgenden Nachrichten in maximal 150 Wörtern zusammen. Behalte wichtige Details.";
  const content = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
  const userMsg = previousSummary ? `Bisherige Zusammenfassung:\n${previousSummary}\n\nNeue Nachrichten:\n${content}` : content;

  const result = await callModel(context.env, {
    model: summaryModel,
    system: systemPrompt,
    messages: [{ role: "user", content: userMsg }],
    maxTokens: intVar(context.env.MAX_OUTPUT_TOKENS, 1024),
  });

  return new Response(JSON.stringify({ summary: result.reply, usage: result.usage }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
