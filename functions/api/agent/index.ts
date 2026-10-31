// POST /api/agent — chat turn with function calling (Gemini native, OpenAI-format for OpenRouter/xAI).
import type { Env } from "../../../src/env";
import { getSession } from "../../../src/auth";
import { getKey } from "../../../src/keys";
import { checkRateLimit } from "../../../src/ratelimit";
import { TOOLS, toolsFor, geminiTools, openaiTools, execServerTool, audit, type Role } from "../../../src/tools";

interface Msg { role: "user" | "assistant"; content: string }
interface Body { model?: string; system?: string; messages: Msg[]; member?: string; ctx?: { profiles?: unknown; settings?: unknown }; toolResults?: { name: string; args: unknown; result: unknown }[] }
type Call = { name: string; args: Record<string, unknown> };

const SYS = "Du hast Werkzeuge für diese App. Nutze sie nur, wenn nötig. Ändernde Aktionen werden vom Nutzer bestätigt. Schlüsselwerte niemals zeigen. Antworte knapp auf Deutsch.";

async function callGemini(env: Env, model: string, system: string, msgs: Msg[], tools: ReturnType<typeof toolsFor>, maxOut = 800) {
  const key = await getKey(env, "gemini");
  if (!key) throw new Error("Kein Gemini-Schlüssel");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      tools: tools.length ? geminiTools(tools) : undefined,
      generationConfig: { maxOutputTokens: maxOut },
    }),
  });
  const d: any = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || `Gemini ${r.status}`);
  const parts: any[] = d.candidates?.[0]?.content?.parts || [];
  const calls: Call[] = parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));
  const text = parts.map((p) => p.text || "").join("");
  return { text, calls, usage: { promptTokens: d.usageMetadata?.promptTokenCount || 0, outputTokens: d.usageMetadata?.candidatesTokenCount || 0 } };
}

async function callOpenAI(env: Env, model: string, system: string, msgs: Msg[], tools: ReturnType<typeof toolsFor>) {
  const xai = model.startsWith("grok");
  const key = await getKey(env, xai ? "xai" : "openrouter");
  if (!key) throw new Error("Kein Schlüssel für " + (xai ? "xAI" : "OpenRouter"));
  const url = xai ? "https://api.x.ai/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
  const r = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, max_tokens: 800, messages: [{ role: "system", content: system }, ...msgs], ...(tools.length ? { tools: openaiTools(tools) } : {}) }),
  });
  const d: any = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || `Upstream ${r.status}`);
  const m = d.choices?.[0]?.message || {};
  const calls: Call[] = (m.tool_calls || []).map((c: any) => { let args = {}; try { args = JSON.parse(c.function.arguments || "{}"); } catch {} return { name: c.function.name, args }; });
  return { text: m.content || "", calls, usage: { promptTokens: d.usage?.prompt_tokens || 0, outputTokens: d.usage?.completion_tokens || 0 } };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const env = context.env;
  await checkRateLimit(env, context.request.headers.get("cf-connecting-ip") || "local");
  const body = (await context.request.json()) as Body;
  const session = await getSession(context);
  const role: Role = session ? (session.role as Role) : "none";
  // v86: festes Kollab-Mitglied → Modell/Prompt/Werkzeuge serverseitig erzwingen
  const memberId = body.member === "seraphina" || body.member === "gemini" ? body.member : null;
  const mem = memberId ? (await import("../../../src/kollab-team")).memberById(memberId) : null;
  let tools = toolsFor(role);
  if (mem) {
    const kt = await import("../../../src/kollab-team");
    const allowed = kt.toolNamesFor(mem.id, role);
    tools = tools.filter((t) => allowed.includes(t.name));
  }
  const _m = body.model && !body.model.startsWith("auto:") ? String(body.model) : "";
  // v78: bezahlte Modelle nur mit Freigabe
  const model = mem
    ? (env.KOLLAB_GEMINI_MODEL || "gemini-3.5-flash")
    : (_m && (/:free$|^(groq|mistral):|^(venice|gemini|lumia)/.test(_m) || (body as any).paidAllowed === true) ? _m : "nvidia/nemotron-3-ultra-550b-a55b:free");
  let memberPrompt = "";
  if (mem) {
    const kt = await import("../../../src/kollab-team");
    let ov: string | null = null;
    try {
      if (env.DB) {
        const row: any = await env.DB.prepare("SELECT prompt FROM kollab_member_prompts WHERE member=? ORDER BY id DESC LIMIT 1").bind(mem.id).first();
        ov = row && row.prompt ? String(row.prompt) : null;
      }
    } catch { ov = null; }
    memberPrompt = kt.effectivePrompt(mem.id, ov) + `\n\nRolle: ${mem.role}.`;
  }
  const system = mem
    ? `${memberPrompt}\n\n${SYS}\nRolle: ${role === "admin" ? "Admin" : role === "read" ? "Nur-Lesen" : "Gast (nur Lesen)"}.`
    : `${body.system || ""}\n\n${SYS}\nRolle: ${role === "admin" ? "Admin" : role === "read" ? "Nur-Lesen" : "Gast (nur Lesen)"}.`;
  const msgs: Msg[] = (body.messages || []).slice(-8).map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  for (const tr of body.toolResults || []) msgs.push({ role: "user", content: `[Werkzeug ${tr.name} Ergebnis] ${JSON.stringify(tr.result).slice(0, 3000)}` });

  const usage = { promptTokens: 0, outputTokens: 0 };
  const used: string[] = [];
  try {
    for (let i = 0; i < 4; i++) {
      // v86: Kollab-Mitglieder immer nativ über den eigenen Gemini-Schlüssel (nie OpenRouter), längere Antworten für Code.
      const res = mem || model.startsWith("gemini") ? await callGemini(env, model, system, msgs, tools, mem ? 2048 : 800) : await callOpenAI(env, model, system, msgs, tools);
      usage.promptTokens += res.usage.promptTokens; usage.outputTokens += res.usage.outputTokens;
      if (!res.calls.length) return Response.json({ reply: res.text, usage, tools: used, model, ...(memberId ? { member: memberId } : {}) });
      for (const c of res.calls) {
        const t = TOOLS.find((x) => x.name === c.name);
        if (!t || !tools.includes(t)) {
          await audit(env, role, c.name, c.args, false, "denied");
          msgs.push({ role: "user", content: `[Werkzeug ${c.name}] nicht erlaubt für diese Rolle.` });
          continue;
        }
        if (t.write) {
          // Never apply writes without UI confirmation.
          return Response.json({ reply: res.text, confirm: { name: c.name, args: c.args, client: !!t.client }, usage, tools: used, model, ...(memberId ? { member: memberId } : {}) });
        }
        let result: unknown;
        if (t.name === "list_profiles") result = body.ctx?.profiles ?? [];
        else if (t.name === "read_settings") result = body.ctx?.settings ?? {};
        else {
          try { result = await execServerTool(env, role, c.name, c.args, memberId || "admin"); await audit(env, role, c.name, c.args, true, "ok"); }
          catch (e) { result = { error: (e as Error).message }; await audit(env, role, c.name, c.args, false, (e as Error).message); }
        }
        used.push(c.name);
        msgs.push({ role: "assistant", content: `(rufe ${c.name} auf)` });
        msgs.push({ role: "user", content: `[Werkzeug ${c.name} Ergebnis] ${JSON.stringify(result).slice(0, 3000)}` });
      }
    }
    return Response.json({ reply: "Zu viele Werkzeugschritte – bitte genauer fragen.", usage, tools: used, model });
  } catch (e) {
    return Response.json({ error: { code: "agent_error", message: (e as Error).message } }, { status: 502 });
  }
};
