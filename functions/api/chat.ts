import { Env, intVar } from "../../src/env";
import { ChatMessage, streamModel, callModel, providerFor, ProviderError } from "../../src/providers";
import { trimHistory } from "../../src/context";
import { checkBudget } from "../../src/budget";
import { checkRateLimit } from "../../src/ratelimit";
import { trackUsage } from "../../src/usage";
import { relevantMemories } from "../../src/memory";
import { applyModeToSystem, normalizeChatMode } from "../../src/mode-server.js";
import { isRefusal, refusalFallback, createRefusalGate } from "../../apps/shared/promptapp/chat.js";

interface ChatBody {
  model?: string;
  modelChain?: string[];
  paidAllowed?: boolean;
  system?: string;
  role?: string;
  messages: ChatMessage[];
  summary?: string;
  stream?: boolean;
  notes?: string[];
  profileId?: string;
  memory?: boolean;
  attachments?: Array<{ type: "image" | "video"; mime: string; data: string }>;
  mode?: string;
  profileName?: string;
  otherNames?: string[];
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const ip = context.request.headers.get("cf-connecting-ip") || "unknown";
  await checkRateLimit(context.env, ip);

  const body: ChatBody = await context.request.json();
  const { messages, summary, stream = true, notes, attachments } = body;
  let { model, modelChain, system, role } = body;

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "messages muss 1-50 Einträge haben" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  for (const m of messages) {
    if (!m.role || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || m.content.length > 20000) {
      return new Response(JSON.stringify({ error: { code: "invalid_input", message: "Nachrichtenformat ungültig" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (m.images) {
      if (!Array.isArray(m.images) || m.images.length > 5) {
        return new Response(JSON.stringify({ error: { code: "invalid_input", message: "Maximal 5 Bilder pro Nachricht" } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      for (const img of m.images) {
        if (!img.mimeType || !img.data || img.data.length > 6000000) {
          return new Response(JSON.stringify({ error: { code: "invalid_input", message: "Bildformat ungültig oder >4.5MB" } }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
      }
    }
  }

  if (system && (typeof system !== "string" || system.length > 4000)) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "system max 4000 Zeichen" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (attachments && Array.isArray(attachments)) {
    for (const att of attachments) {
      if (att.type === "image") {
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg.images) lastMsg.images = [];
        lastMsg.images.push({ mimeType: att.mime, data: att.data });
      } else if (att.type === "video") {
        const lastMsg = messages[messages.length - 1];
        if (att.data.length > 8000000) continue;
        lastMsg.video = { mimeType: att.mime, data: att.data };
      }
    }
  }

  const historyLimit = intVar(context.env.HISTORY_LIMIT, 6);
  const trimmed = trimHistory(messages, historyLimit);

  let systemPrompt = system || "Du bist ein hilfreicher Assistent.";
  if (summary) systemPrompt = `Bisheriger Verlauf:\n${summary}\n\n${systemPrompt}`;
  if (role) systemPrompt = `${role}\n\n${systemPrompt}`;
  if (notes && Array.isArray(notes) && notes.length > 0) {
    const noteList = notes.slice(0, 5).map((n) => `- ${n}`).join("\n");
    systemPrompt += `\n\nLernnotizen:\n${noteList}`;
  }
  const chatModeNorm = normalizeChatMode(body.mode);
  systemPrompt = applyModeToSystem(systemPrompt, chatModeNorm);
  if (body.memory !== false) {
    try {
      const q = trimmed.slice(-3).map((x) => x.content).join(" ").slice(-1500);
      const otherNames = Array.isArray(body.otherNames) ? body.otherNames.filter((n) => typeof n === "string").slice(0, 20).map((n) => n.slice(0, 40)) : undefined;
      const mem = await relevantMemories(context.env, body.profileId ? String(body.profileId).slice(0, 80) : undefined, q, 8, 700, otherNames);
      if (mem.length) systemPrompt += `\n\nGedächtnis (Fakten über den NUTZER – nicht über dich; nur nutzen wenn relevant):\n${mem.map((f) => `- ${f}`).join("\n")}`;
    } catch (e) { console.warn("memory", (e as Error).message); }
  }

  const maxTokens = intVar(context.env.MAX_OUTPUT_TOKENS, 1024);
  const privateFlag = context.request.headers.get("x-jeffa-private") === "1";

  const chain = modelChain && Array.isArray(modelChain) && modelChain.length > 0 && modelChain.length <= 6 ? modelChain : [model || context.env.DEFAULT_MODEL];
  if (chain.length > 6) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "modelChain darf maximal 6 Einträge haben" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const resolvedChain: string[] = [];
  for (let m of chain) {
    if (m === "auto:nemotron-free") {
      const freeModels = await getFreeModels(context.env);
      const sorted = [...freeModels].sort((a, b) => {
        const r = (id: string) => (/nemotron/i.test(id) ? 0 : 10) + (/reason|thinking/i.test(id) ? 5 : 0) + (/ultra/i.test(id) ? 1 : 0);
        return r(a) - r(b);
      });
      const picks = sorted.slice(0, 3);
      if (picks.length > 0) resolvedChain.push(...picks, ...(context.env.DEFAULT_MODEL && !chain.includes(context.env.DEFAULT_MODEL) ? [context.env.DEFAULT_MODEL] : []));
      else resolvedChain.push(context.env.DEFAULT_MODEL);
    } else {
      resolvedChain.push(m);
    }
  }
  // v78: zuerst/nur kostenlose Modelle; bezahlte nur mit ausdrücklicher Freigabe (paidAllowed, Standard aus)
  {
    const free = (id: string) => isFreeModel(id);
    const keep = body.paidAllowed === true ? [...resolvedChain.filter(free), ...resolvedChain.filter((x) => !free(x))] : resolvedChain.filter(free);
    resolvedChain.length = 0; resolvedChain.push(...keep);
    if (!resolvedChain.length) return new Response(JSON.stringify({ error: { code: "paid_not_allowed", message: "Kein kostenloses/eigenes Modell in der Kette. Bezahlte Modelle sind gesperrt (Einstellungen → „Bezahlte Modelle erlaubt“)." } }), { status: 400, headers: { "content-type": "application/json" } });
  }

  const usable = resolvedChain.filter((m) => /^[a-z0-9\-_.\/:]+$/i.test(m) && providerFor(m));
  if (usable.length === 0) throw new ProviderError(503, "no_model_available", "Kein Modell verfügbar");
  const retryable = (e: unknown) =>
    e instanceof ProviderError && ((e.status >= 400 && e.status <= 404) || e.status === 408 || e.status === 429 || e.status >= 500 || e.code === "empty_reply" || e.code === "upstream_error");

  if (stream) {
    await checkBudget(context.env, ip, 0);
    const promptChars = (systemPrompt?.length || 0) + trimmed.reduce((n, x) => n + (x.content?.length || 0), 0);
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const sse = (obj: unknown) => writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

    (async () => {
      let lastErr: ProviderError | null = null;
      // v84 P3: Ablehnungs-Fallback nur im Modus hemmungslos; max 2 Wechsel (Fehler-Fallback zählt nicht mit).
      const refusalMode = chatModeNorm === "hemmungslos";
      const queue = [...usable];
      const tried: string[] = [];
      const refused: string[] = [];
      try {
        for (let qi = 0; qi < queue.length; qi++) {
          const m = queue[qi];
          let wrote = 0;
          const counting = {
            write: (chunk: Uint8Array) => {
              wrote += chunk.byteLength;
              return writer.write(chunk);
            },
          } as unknown as WritableStreamDefaultWriter<Uint8Array>;
          // Gate puffert die ersten ≥240 sichtbaren Zeichen; erst danach geht etwas an den Client (wrote zählt nur Geschriebenes).
          const gate = refusalMode ? createRefusalGate({ minChars: 240, onFlush: (txt: string) => counting.write(encoder.encode(txt)) }) : null;
          const gateWriter = gate ? ({ write: (chunk: Uint8Array) => gate.write(chunk) } as unknown as WritableStreamDefaultWriter<Uint8Array>) : counting;
          try {
            const hasVideo = trimmed.some((msg) => msg.video);
            if (hasVideo && !m.startsWith("gemini")) {
              await sse({ notice: "Video wird ignoriert – nur Gemini-Modelle unterstützen Video." });
            }
            await streamModel(context.env, { model: m, system: systemPrompt, messages: trimmed, maxTokens, stream: true, private: privateFlag }, gateWriter, context.request.signal);
            tried.push(m);
            if (gate) {
              await gate.finish();
              if (gate.refused) {
                const next = refused.length < 2 ? refusalFallback(queue, tried, { max: 2, refused: [...refused, m] }) : "";
                if (next) {
                  refused.push(m);
                  const later = queue.indexOf(next, qi + 1);
                  if (later >= 0) queue.splice(later, 1);
                  queue.splice(qi + 1, 0, next);
                  console.warn("refusal", m, "->", next, `(${refused.length}/2)`);
                  await sse({ notice: `${modelShort(m)} hat abgelehnt → wechsle zu ${modelShort(next)} (unzensiert)` });
                  continue;
                }
                // Keine Wechsel mehr: letzte Antwort (auch eine Ablehnung) normal ausliefern.
                refused.push(m);
                console.warn("refusal", m, "-> kein Wechsel mehr");
                await gate.release();
              }
            }
            if (wrote === 0) throw new ProviderError(502, "empty_reply", "Leere Antwort");
            await sse({ model: m, tried: [...tried], ...(refusalMode ? { switched: refused.filter((x) => x !== m).length, refused } : {}) });

            const provider = providerFor(m)!;
            const estimatedTokens = { promptTokens: Math.ceil(promptChars / 4), outputTokens: Math.ceil(wrote / 4) };
            const cost = estimateCost(m, estimatedTokens);
            await sse({ usage: { in: estimatedTokens.promptTokens, out: estimatedTokens.outputTokens, cost, model: m } });
            await trackUsage(context.env, provider.id, m, estimatedTokens.promptTokens, estimatedTokens.outputTokens, cost);

            try {
              await checkBudget(context.env, ip, cost);
            } catch {}
            return;
          } catch (e) {
            const err = e instanceof ProviderError ? e : new ProviderError(500, "internal_error", (e as Error).message);
            console.warn(`chain: ${m} failed (${err.status} ${err.code})`);
            lastErr = err;
            if (!tried.includes(m)) tried.push(m);
            if (wrote > 0 || !retryable(err) || context.request.signal.aborted) break;
            const src = m.endsWith(":free") ? "OpenRouter" : providerFor(m)?.id === "venice" ? "Venice" : m;
            const why = err.code === "empty_reply" ? "Leere Antwort" : err.status === 429 ? "Limit erreicht" : err.status === 402 ? "Kein Guthaben" : "Fehler";
            if (qi < queue.length - 1) await sse({ notice: `${src}: ${why} → nächstes ${m.endsWith(":free") ? "Gratis-" : ""}Modell` });
          }
        }
        if (lastErr && body.paidAllowed !== true) await sse({ error: { code: "no_free_model", message: "Kein kostenloses Modell hat geantwortet (" + lastErr.message.slice(0, 120) + "). Bezahlte Modelle sind gesperrt – bitte später erneut versuchen oder in den Einstellungen „Bezahlte Modelle erlaubt“ einschalten." } });
        else if (lastErr) await sse({ error: { code: lastErr.code, message: lastErr.message.replace(/,?\\?"user_id\\?":\\?"[^"\\]*\\?"/g, "").slice(0, 300) } });
      } catch {}
      finally {
        try {
          await writer.close();
        } catch {}
      }
    })();

    return new Response(readable, {
      headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive" },
    });
  }

  let lastError: ProviderError | null = null;
  const nsQueue = [...usable];
  const nsTried: string[] = [];
  const nsRefused: string[] = [];
  for (let qi = 0; qi < nsQueue.length; qi++) {
    const m = nsQueue[qi];
    try {
      const hasVideo = trimmed.some((msg) => msg.video);
      if (hasVideo && !m.startsWith("gemini")) {
        for (const msg of trimmed) delete msg.video;
      }
      nsTried.push(m);
      const result = await callModel(context.env, { model: m, system: systemPrompt, messages: trimmed, maxTokens, stream: false, private: privateFlag });
      if (!result.reply) throw new ProviderError(502, "empty_reply", "Leere Antwort");
      // v84 P3: Ablehnungs-Fallback nur im Modus hemmungslos, max 2 Wechsel.
      if (chatModeNorm === "hemmungslos" && isRefusal(result.reply)) {
        const next = nsRefused.length < 2 ? refusalFallback(nsQueue, nsTried, { max: 2, refused: [...nsRefused, m] }) : "";
        nsRefused.push(m);
        if (next) {
          const later = nsQueue.indexOf(next, qi + 1);
          if (later >= 0) nsQueue.splice(later, 1);
          nsQueue.splice(qi + 1, 0, next);
          console.warn("refusal", m, "->", next, `(${nsRefused.length}/2)`);
          continue;
        }
      }
      const cost = estimateCost(m, result.usage);
      await checkBudget(context.env, ip, cost);

      const provider = providerFor(m)!;
      await trackUsage(
        context.env,
        provider.id,
        m,
        result.usage?.promptTokens || 0,
        result.usage?.outputTokens || 0,
        cost
      );

      return new Response(JSON.stringify({ reply: result.reply, usage: result.usage, model: m }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    } catch (e) {
      if (retryable(e)) {
        lastError = e as ProviderError;
        continue;
      }
      throw e;
    }
  }
  throw lastError && body.paidAllowed !== true ? new ProviderError(lastError.status, "no_free_model", "Kein kostenloses Modell hat geantwortet. Bezahlte Modelle sind gesperrt (Einstellungen → „Bezahlte Modelle erlaubt“).") : lastError ?? new ProviderError(503, "no_model_available", "Kein Modell verfügbar");
};

function modelShort(id: string): string { return String(id).replace(/^[a-z]+:/, "").replace(/:free$/, "").split("/").pop()!.slice(0, 40); }

/** v79: true = ohne Freigabe nutzbar (kostenlos ODER Anbieter mit eigenem Key/Volumen: Venice, Gemini, LumiaRouter). */
export function isFreeModel(id: string): boolean { return /:free$/.test(id) || id.startsWith("auto:") || /^(groq|mistral|venice|gemini|lumia|grok-)/.test(id); }

function estimateCost(model: string, usage?: { promptTokens: number; outputTokens: number }): number {
  if (!usage || model.endsWith(":free")) return 0;
  const prices: Record<string, { input: number; output: number }> = {
    "gemini-3.5-flash-lite": { input: 0.075 / 1e6, output: 0.3 / 1e6 },
    "gemini-3.5-flash": { input: 0.15 / 1e6, output: 0.6 / 1e6 },
    "venice-uncensored-1-2": { input: 0.2 / 1e6, output: 0.9 / 1e6 },
    "venice-uncensored-role-play": { input: 0.5 / 1e6, output: 2 / 1e6 },
    "venice:gemma-4-uncensored": { input: 0.1625 / 1e6, output: 0.5 / 1e6 },
    "venice:deepseek-v4-1-flash-uncensored": { input: 0.33 / 1e6, output: 1.32 / 1e6 },
    "grok-4.3": { input: 1.25 / 1e6, output: 2.5 / 1e6 },
    "grok-4.20-0309-non-reasoning": { input: 1.25 / 1e6, output: 2.5 / 1e6 },
    "grok-4.7": { input: 2 / 1e6, output: 6 / 1e6 },
  };
  const price = prices[model] || { input: 0.5 / 1e6, output: 1.5 / 1e6 };
  return usage.promptTokens * price.input + usage.outputTokens * price.output;
}

async function getFreeModels(env: Env): Promise<string[]> {
  const cacheKey = "openrouter:free-models";
  if (env.KV) {
    const cached = await env.KV.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const { getKey } = await import("../../src/keys");
  const key = await getKey(env, "openrouter");
  if (!key) return [];

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { authorization: `Bearer ${key}` },
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const models = filterFreeModels(data.data || []);
    const nemotronFirst = orderFreeModels(models);
    if (env.KV) await env.KV.put(cacheKey, JSON.stringify(nemotronFirst), { expirationTtl: 3600 });
    return nemotronFirst;
  } catch {
    return [];
  }
}

function filterFreeModels(models: any[]): string[] {
  return models
    .filter((model: any) => {
      const id = typeof model?.id === "string" ? model.id : "";
      if (!id.includes(":free")) return false;
      if (/safety|guard|embed|rerank|moderation/i.test(id)) return false;
      const architecture = model?.architecture || {};
      const input = architecture.input_modalities;
      const output = architecture.output_modalities;
      if (Array.isArray(input) && !input.includes("text")) return false;
      if (Array.isArray(output) && !output.includes("text")) return false;
      return true;
    })
    .map((model: any) => model.id as string);
}

function orderFreeModels(models: string[]): string[] {
  const rank = (id: string) => {
    const nemotron = /nvidia\/nemotron/i.test(id) ? 0 : 1;
    const reasoning = /reason|r1|thinking/i.test(id) ? 1 : 0;
    const sizeMatch = id.match(/(?:^|[^0-9])(\d+(?:\.\d+)?)b/i);
    const size = sizeMatch ? Number(sizeMatch[1]) : 999;
    return nemotron * 10000 + reasoning * 1000 + size;
  };
  return [...models].sort((a, b) => rank(a) - rank(b));
}
