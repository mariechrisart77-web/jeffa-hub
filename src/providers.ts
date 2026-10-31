import { Env, intVar } from "./env";
import { getKey } from "./keys";
import { upstreamUrl } from "./model-allow.js";

export type Role = "user" | "assistant";
export interface ChatMessage {
  role: Role;
  content: string;
  images?: Array<{ mimeType: string; data: string }>;
  video?: { mimeType: string; data: string };
}

export interface ChatRequest {
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  stream?: boolean;
  noThinkingConfig?: boolean;
  private?: boolean;
}

export interface Usage {
  promptTokens: number;
  outputTokens: number;
}

export class ProviderError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

interface Provider {
  id: string;
  keyProvider: string;
  matches(model: string): boolean;
  path(model: string, stream?: boolean): string;
  headers(key: string): Record<string, string>;
  bodyStream(req: ChatRequest): unknown;
  bodyNonStream(req: ChatRequest): unknown;
  parseStream(line: string): { delta?: string; done?: boolean; usage?: Usage } | null;
  parseNonStream(data: any): { reply: string; usage?: Usage };
}

const googleAiStudio: Provider = {
  id: "google-ai-studio",
  keyProvider: "gemini",
  matches: (m) => m.startsWith("gemini"),
  path: (m, stream) => `v1beta/models/${encodeURIComponent(m)}:${stream === false ? "generateContent" : "streamGenerateContent?alt=sse"}`,
  headers: (key) => ({ "x-goog-api-key": key }),
  bodyStream: (r) => {
    const contents = r.messages.map((m) => {
      const parts: any[] = [{ text: m.content }];
      if (m.images) {
        parts.push(...m.images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })));
      }
      if (m.video) {
        parts.push({ inlineData: { mimeType: m.video.mimeType, data: m.video.data } });
      }
      return { role: m.role === "assistant" ? "model" : "user", parts };
    });

    return {
      systemInstruction: { parts: [{ text: r.system }] },
      contents,
      generationConfig: {
        maxOutputTokens: r.maxTokens,
        ...(r.noThinkingConfig ? {} : { thinkingConfig: { thinkingLevel: r.model.includes("lite") ? "minimal" : "low" } }),
      },
    };
  },
  bodyNonStream(r) {
    return this.bodyStream(r);
  },
  parseStream: (line) => {
    if (!line.startsWith("data: ")) return null;
    const json = line.slice(6).trim();
    if (!json || json === "[DONE]") return null;
    try {
      const d = JSON.parse(json);
      if (d.error) throw new ProviderError(502, "upstream_error", d.error.message || "Upstream-Fehler");
      const parts = d?.candidates?.[0]?.content?.parts ?? [];
      const textParts = parts.filter((p: any) => typeof p.text === "string" && !p.thought);
      const delta = textParts.map((p: any) => p.text).join("");
      const usage = d.usageMetadata ? { promptTokens: d.usageMetadata.promptTokenCount || 0, outputTokens: d.usageMetadata.candidatesTokenCount || 0 } : undefined;
      if (d?.candidates?.[0]?.finishReason) return { done: true, usage };
      return delta ? { delta } : null;
    } catch (e) {
      return null;
    }
  },
  parseNonStream: (d) => {
    const parts = (d?.candidates?.[0]?.content?.parts ?? []).filter((p: any) => typeof p.text === "string" && !p.thought);
    const reply = parts.map((p: any) => p.text ?? "").join("");
    const usage = d.usageMetadata ? { promptTokens: d.usageMetadata.promptTokenCount || 0, outputTokens: d.usageMetadata.candidatesTokenCount || 0 } : undefined;
    return { reply, usage };
  },
};

const openRouter: Provider = {
  id: "openrouter",
  keyProvider: "openrouter",
  matches: (m) => m.includes("/"),
  path: () => "v1/chat/completions",
  headers: (key) => ({ authorization: `Bearer ${key}` }),
  bodyStream: (r) => ({
    model: r.model,
    // reasoning models (e.g. Nemotron) spend output tokens on thinking first: give them room for the answer,
    // keep thinking short and don't stream it (answer only). Free models cost nothing extra.
    max_tokens: r.model.endsWith(":free") || /nemotron|reason|think|r1\b|qwq/i.test(r.model) ? Math.max(r.maxTokens, 4096) : r.maxTokens,
    reasoning: { effort: "low", exclude: true },
    stream: true,
    messages: [{ role: "system", content: r.system }, ...r.messages.map((m) => ({ role: m.role, content: m.content }))],
  }),
  bodyNonStream(r) {
    const body = this.bodyStream(r) as Record<string, unknown>;
    return { ...body, stream: false };
  },
  parseStream: (line) => {
    if (!line.startsWith("data: ")) return null;
    const json = line.slice(6).trim();
    if (!json || json === "[DONE]") return { done: true };
    try {
      const d = JSON.parse(json);
      if (d.error) throw new ProviderError(502, "upstream_error", d.error.message || "Upstream-Fehler");
      const delta = d?.choices?.[0]?.delta?.content;
      const usage = d.usage ? { promptTokens: d.usage.prompt_tokens || 0, outputTokens: d.usage.completion_tokens || 0 } : undefined;
      if (d?.choices?.[0]?.finish_reason) return { done: true, usage };
      return delta ? { delta } : null;
    } catch (e) {
      return null;
    }
  },
  parseNonStream: (d) => {
    const reply = d?.choices?.[0]?.message?.content ?? "";
    const usage = d.usage ? { promptTokens: d.usage.prompt_tokens || 0, outputTokens: d.usage.completion_tokens || 0 } : undefined;
    return { reply, usage };
  },
};

const grok: Provider = {
  id: "grok",
  keyProvider: "xai",
  matches: (m) => m.startsWith("grok"),
  path: () => "v1/chat/completions",
  headers: (key) => ({ authorization: `Bearer ${key}` }),
  bodyStream: (r) => ({
    model: r.model,
    max_tokens: r.maxTokens,
    stream: true,
    ...(r.model.includes("mini") ? { reasoning_effort: "low" } : {}),
    messages: [{ role: "system", content: r.system }, ...r.messages.map((m) => ({ role: m.role, content: m.content }))],
  }),
  bodyNonStream(r) {
    const body = this.bodyStream(r) as Record<string, unknown>;
    return { ...body, stream: false };
  },
  parseStream: (line) => {
    if (!line.startsWith("data: ")) return null;
    const json = line.slice(6).trim();
    if (!json || json === "[DONE]") return { done: true };
    try {
      const d = JSON.parse(json);
      if (d.error) throw new ProviderError(502, "upstream_error", d.error.message || "Upstream-Fehler");
      const delta = d?.choices?.[0]?.delta?.content;
      const usage = d.usage ? { promptTokens: d.usage.prompt_tokens || 0, outputTokens: d.usage.completion_tokens || 0 } : undefined;
      if (d?.choices?.[0]?.finish_reason) return { done: true, usage };
      return delta ? { delta } : null;
    } catch (e) {
      return null;
    }
  },
  parseNonStream: (d) => {
    const reply = d?.choices?.[0]?.message?.content ?? "";
    const usage = d.usage ? { promptTokens: d.usage.prompt_tokens || 0, outputTokens: d.usage.completion_tokens || 0 } : undefined;
    return { reply, usage };
  },
};

function openAICompat(id: string, keyProvider: string, prefix: string, root: string): Provider {
  return {
    id,
    keyProvider,
    matches: (m) => m.startsWith(prefix),
    path: () => 'v1/chat/completions',
    headers: (key) => ({ authorization: `Bearer ${key}` }),
    bodyStream: (r) => ({
      model: r.model.replace(new RegExp(`^${prefix}`), ''),
      max_tokens: r.maxTokens,
      stream: true,
      messages: [{ role: 'system', content: r.system }, ...r.messages.map((m) => ({ role: m.role, content: m.content }))],
    }),
    bodyNonStream(r) {
      const body = this.bodyStream(r) as Record<string, unknown>;
      return { ...body, stream: false };
    },
    parseStream: (line) => {
      if (!line.startsWith('data: ')) return null;
      const json = line.slice(6).trim();
      if (!json || json === '[DONE]') return { done: true };
      try {
        const d = JSON.parse(json);
        if (d.error) throw new ProviderError(502, 'upstream_error', d.error.message || 'Upstream-Fehler');
        const delta = d?.choices?.[0]?.delta?.content;
        const usage = d.usage ? { promptTokens: d.usage.prompt_tokens || 0, outputTokens: d.usage.completion_tokens || 0 } : undefined;
        if (d?.choices?.[0]?.finish_reason) return { done: true, usage };
        return delta ? { delta } : null;
      } catch (e) {
        return null;
      }
    },
    parseNonStream: (d) => {
      const reply = d?.choices?.[0]?.message?.content ?? '';
      const usage = d.usage ? { promptTokens: d.usage.prompt_tokens || 0, outputTokens: d.usage.completion_tokens || 0 } : undefined;
      return { reply, usage };
    },
  };
}

const groq = openAICompat('groq', 'groq', 'groq:', 'https://api.groq.com/openai');
const mistral = openAICompat('mistral', 'mistral', 'mistral:', 'https://api.mistral.ai');

const venice: Provider = {
  id: "venice",
  keyProvider: "venice",
  matches: (m) => m.startsWith("venice-") || m.startsWith("venice:"),
  path: () => "v1/chat/completions",
  headers: (key) => ({ authorization: `Bearer ${key}` }),
  bodyStream: (r) => ({
    model: r.model.replace(/^venice:/, ""),
    venice_parameters: { include_venice_system_prompt: false },
    max_tokens: r.maxTokens,
    stream: true,
    messages: [{ role: "system", content: r.system }, ...r.messages.map((m) => ({ role: m.role, content: m.content }))],
  }),
  bodyNonStream(r) {
    const body = this.bodyStream(r) as Record<string, unknown>;
    return { ...body, stream: false };
  },
  parseStream: (line) => {
    if (!line.startsWith("data: ")) return null;
    const json = line.slice(6).trim();
    if (!json || json === "[DONE]") return { done: true };
    try {
      const d = JSON.parse(json);
      if (d.error) throw new ProviderError(502, "upstream_error", d.error.message || "Upstream-Fehler");
      const delta = d?.choices?.[0]?.delta?.content;
      if (d?.choices?.[0]?.finish_reason) return { done: true };
      return delta ? { delta } : null;
    } catch (e) {
      return null;
    }
  },
  parseNonStream: (d) => {
    const reply = d?.choices?.[0]?.message?.content ?? "";
    return { reply };
  },
};

export const PROVIDERS: Provider[] = [googleAiStudio, grok, groq, mistral, openRouter, venice];

export function providerFor(model: string): Provider | undefined {
  return PROVIDERS.find((p) => p.matches(model));
}

async function fetchUpstream(env: Env, provider: Provider, key: string, req: ChatRequest, signal?: AbortSignal): Promise<Response> {
  let base = env.AI_GATEWAY_BASE_URL?.replace(/\/$/, "");
  let root: string;
  let useGateway = true;

  if (provider.id === "grok") {
    if (base) {
      root = `${base}/grok`;
    } else if (env.CF_ACCOUNT_ID && !env.CF_ACCOUNT_ID.startsWith("DEINE") && env.AI_GATEWAY_ID) {
      root = `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/grok`;
    } else {
      root = "https://api.x.ai";
      useGateway = false;
    }
  } else if (provider.id === "venice") {
    root = "https://api.venice.ai/api";
    useGateway = false;
  } else if (provider.id === "groq") {
    root = "https://api.groq.com/openai";
    useGateway = false;
  } else if (provider.id === "mistral") {
    root = "https://api.mistral.ai";
    useGateway = false;
  } else {
    if (!base && (!env.CF_ACCOUNT_ID || env.CF_ACCOUNT_ID.startsWith("DEINE") || !env.AI_GATEWAY_ID)) {
      throw new ProviderError(503, "gateway_not_configured", "CF_ACCOUNT_ID / AI_GATEWAY_ID sind nicht gesetzt.");
    }
    root = base ?? `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.AI_GATEWAY_ID}`;
  }

  const url = upstreamUrl(provider.id, root, provider.path(req.model, (req as { stream?: boolean }).stream));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...provider.headers(String(key)),
  };

  if (useGateway) {
    headers["cf-aig-cache-ttl"] = String(intVar(env.CACHE_TTL, 3600));
    if (env.CF_AIG_TOKEN) headers["cf-aig-authorization"] = `Bearer ${env.CF_AIG_TOKEN}`;
    if (req.private) headers["cf-aig-collect-log"] = "false";
  }

  const body = req.stream ? provider.bodyStream(req) : provider.bodyNonStream(req);
  try {
    return await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  } catch (e) {
    throw new ProviderError(502, "upstream_unreachable", `Gateway nicht erreichbar: ${(e as Error).message}`);
  }
}

export async function streamModel(env: Env, req: ChatRequest, writer: WritableStreamDefaultWriter<Uint8Array>, signal?: AbortSignal): Promise<void> {
  const provider = providerFor(req.model);
  if (!provider) throw new ProviderError(400, "unknown_model", `Unbekanntes Modell: ${req.model}`);
  const key = await getKey(env, provider.keyProvider as import("./keys").Provider);
  if (!key) throw new ProviderError(503, "missing_api_key", `Kein API-Key für Provider "${provider.id}" konfiguriert.`);

  const res = await fetchUpstream(env, provider, key, { ...req, stream: true }, signal);

  if (!res.ok && res.status === 400 && provider.id === "google-ai-studio" && !req.noThinkingConfig) {
    const t = await res.clone().text();
    if (/thinking/i.test(t)) {
      const res2 = await fetchUpstream(env, provider, key, { ...req, stream: true, noThinkingConfig: true }, signal);
      return processStream(res2, provider, writer, signal);
    }
  }

  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new ProviderError(res.status, "upstream_error", `Upstream ${res.status}: ${text}`);
  }

  await processStream(res, provider, writer, signal);
}

async function processStream(res: Response, provider: Provider, writer: WritableStreamDefaultWriter<Uint8Array>, signal?: AbortSignal) {
  const reader = res.body?.getReader();
  if (!reader) throw new ProviderError(502, "no_body", "Keine Response-Body.");
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let lastUsage: Usage | undefined;
  let textChars = 0; // non-whitespace content chars; reasoning-only/empty streams must fail so the chain falls back
  const finish = async () => {
    if (textChars === 0) throw new ProviderError(502, "empty_reply", "Leere Antwort vom Modell.");
    await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true, usage: lastUsage })}\n\n`));
  };

  try {
    while (true) {
      if (signal?.aborted) {
        reader.cancel();
        throw new ProviderError(499, "client_abort", "Request abgebrochen");
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const parsed = provider.parseStream(line.trim());
        if (!parsed) continue;
        if (parsed.done) {
          if (parsed.usage) lastUsage = parsed.usage;
          await finish();
          return;
        }
        if (parsed.usage) lastUsage = parsed.usage;
        if (parsed.delta) {
          textChars += parsed.delta.replace(/\s+/g, "").length;
          if (!textChars) continue;
          await writer.write(encoder.encode(`data: ${JSON.stringify({ delta: parsed.delta })}\n\n`));
        }
      }
    }
    await finish();
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(502, "stream_error", `Stream-Fehler: ${(e as Error).message}`);
  }
}

export async function callModel(env: Env, req: ChatRequest): Promise<{ reply: string; usage?: Usage }> {
  const provider = providerFor(req.model);
  if (!provider) throw new ProviderError(400, "unknown_model", `Unbekanntes Modell: ${req.model}`);
  const key = await getKey(env, provider.keyProvider as import("./keys").Provider);
  if (!key) throw new ProviderError(503, "missing_api_key", `Kein API-Key für Provider "${provider.id}" konfiguriert.`);

  const res = await fetchUpstream(env, provider, key, { ...req, stream: false });

  if (!res.ok && res.status === 400 && provider.id === "google-ai-studio" && !req.noThinkingConfig) {
    const t = await res.clone().text();
    if (/thinking/i.test(t)) {
      const res2 = await fetchUpstream(env, provider, key, { ...req, stream: false, noThinkingConfig: true });
      if (!res2.ok) {
        const text2 = (await res2.text()).slice(0, 300);
        throw new ProviderError(502, "upstream_error", `Upstream ${res2.status}: ${text2}`);
      }
      const parsed = provider.parseNonStream(await res2.json());
      if (!parsed.reply) throw new ProviderError(502, "empty_reply", "Leere Antwort vom Modell.");
      return parsed;
    }
  }

  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new ProviderError(res.status, "upstream_error", `Upstream ${res.status}: ${text}`);
  }

  const parsed = provider.parseNonStream(await res.json());
  if (!parsed.reply) throw new ProviderError(502, "empty_reply", "Leere Antwort vom Modell.");
  return parsed;
}

export async function complete(env: Env, req: ChatRequest): Promise<{ reply: string; usage?: Usage }> {
  return callModel(env, req);
}
