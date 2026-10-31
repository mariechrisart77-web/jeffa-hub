// v86: Aufgabe an Claude senden (Claude Gateway, Rückfall LumiaRouter). Kein Deploy, nur Vorschlag.
import type { Env } from "./env";
import { getKey } from "./keys";
import { estimateClaude, buildClaudeMessages, pickClaudeRoute } from "./kollab-claude.js";

export async function sendToClaude(env: Env, taskId: number, extra: string): Promise<any> {
  if (!env.DB) throw new Error("Keine Datenbank");
  if (!Number.isFinite(taskId)) throw new Error("taskId fehlt");
  const task: any = await env.DB.prepare("SELECT id,title,body,assignee,status FROM tasks WHERE id=?").bind(taskId).first();
  if (!task) throw new Error("Aufgabe nicht gefunden");
  let meta: any = null;
  try { meta = await env.DB.prepare("SELECT task_id,severity,state,proposal,proposal_model,cost_usd,context FROM kollab_task_meta WHERE task_id=?").bind(taskId).first(); } catch { meta = null; }

  const gwKey = await getKey(env, "vnaipro");
  const lumiaKey = env.LUMIAROUTER_API_KEY || null;
  const route = pickClaudeRoute(!!gwKey, !!lumiaKey);
  if (!route) throw new Error("Kein Claude-Zugang (Claude Gateway-Schlüssel im Tresor fehlt)");

  const day = new Date().toISOString().slice(0, 10);
  const kvKey = `kollab:claude:${day}`;
  let count = 0;
  if (env.KV) { try { count = Number(await env.KV.get(kvKey)) || 0; } catch { count = 0; } }
  if (env.KV && count >= 10) throw new Error("Tageslimit erreicht (max. 10 Claude-Sendungen pro Tag)");

  const messages = buildClaudeMessages(task, meta, extra);
  const est = estimateClaude(messages.map((m: any) => m.content).join("\n"));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  let text = "";
  let model = "";
  let cost = est.usd;
  try {
    let res: Response;
    if (route === "gateway") {
      model = env.CLAUDE_GATEWAY_MODEL || "claude-sonnet-4-5";
      const base = env.VNAIPRO_API_KEY?.startsWith("http") ? env.VNAIPRO_API_KEY.replace(/\/+$/, "") : "https://apikey.vnaipro.app";
      res = await fetch(`${base}/v1/chat/completions`, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${gwKey}` },
        body: JSON.stringify({ model, max_tokens: 4000, messages }), signal: ctrl.signal,
      });
    } else {
      model = "claude-sonnet-5-5";
      res = await fetch("https://lumiarouter.com/v1/chat/completions", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${lumiaKey}` },
        body: JSON.stringify({ model, max_tokens: 4000, messages }), signal: ctrl.signal,
      });
    }
    const d: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Claude nicht erreichbar (HTTP ${res.status})`);
    text = String(d?.choices?.[0]?.message?.content || "").slice(0, 60000);
    if (d?.usage && Number.isFinite(Number(d.usage.prompt_tokens))) {
      cost = Math.round((Number(d.usage.prompt_tokens) * 3 / 1e6 + Number(d.usage.completion_tokens || 0) * 15 / 1e6) * 1000) / 1000;
    }
  } catch (e) {
    const msg = (e as Error).message || "";
    throw new Error(/^Claude nicht erreichbar/.test(msg) ? msg : "Claude nicht erreichbar (Netzwerkfehler)");
  } finally { clearTimeout(timer); }
  if (!text) throw new Error("Claude lieferte keine Antwort");

  try {
    await env.DB.prepare("INSERT INTO kollab_task_meta (task_id, severity, state, proposal, proposal_model, cost_usd, context, updated_at) VALUES (?, ?, 'vorschlag', ?, ?, ?, ?, datetime('now')) ON CONFLICT(task_id) DO UPDATE SET state='vorschlag', proposal=excluded.proposal, proposal_model=excluded.proposal_model, cost_usd=excluded.cost_usd, context=excluded.context, updated_at=excluded.updated_at")
      .bind(taskId, meta?.severity ?? null, text, model, cost, String(extra || "").slice(0, 8000)).run();
    await env.DB.prepare("UPDATE tasks SET updated_at=datetime('now') WHERE id=?").bind(taskId).run();
  } catch { /* Meta optional */ }
  if (env.KV) { try { await env.KV.put(kvKey, String(count + 1), { expirationTtl: 172800 }); } catch { /* KV optional */ } }
  return { ok: true, state: "vorschlag", proposal: text, cost_usd: cost, model };
}
