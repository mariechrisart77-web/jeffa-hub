// POST /api/kollab/claude — Aufgabe an Claude senden (dryRun = nur Schätzung).
import type { Env } from "../../../src/env";
import { requireRole } from "../../../src/auth";
import { getKey } from "../../../src/keys";
import { sendToClaude } from "../../../src/kollab-claude-send";
import { estimateClaude, buildClaudeMessages, pickClaudeRoute } from "../../../src/kollab-claude.js";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  await requireRole(context, "admin");
  const body: any = await context.request.json().catch(() => ({}));
  const taskId = Number(body.taskId);
  const extra = String(body.extra || "");
  const route = pickClaudeRoute(!!(await getKey(context.env, "vnaipro")), !!context.env.LUMIAROUTER_API_KEY);
  if (body.dryRun) {
    let task: any = null;
    try { if (context.env.DB) task = await context.env.DB.prepare("SELECT id,title,body FROM tasks WHERE id=?").bind(taskId).first(); } catch { task = null; }
    const msgs = buildClaudeMessages(task, null, extra);
    return Response.json({ estimate: estimateClaude(msgs.map((m: any) => m.content).join("\n")), route });
  }
  try {
    const r = await sendToClaude(context.env, taskId, extra);
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: { code: "claude_error", message: (e as Error).message } }, { status: 400 });
  }
};
