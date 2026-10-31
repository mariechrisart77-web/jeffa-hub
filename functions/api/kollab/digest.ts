// GET /api/kollab/digest — Tages-Digest für das Kollab-Team.
import type { Env } from "../../../src/env";
import { requireRole } from "../../../src/auth";
import { buildDigest } from "../../../src/kollab-digest.js";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  await requireRole(context, "admin");
  const db = context.env.DB;
  const rows: any = { generatedAt: new Date().toISOString(), openTasks: [], proposals: [], siteChanges: [], memberPromptChanges: [] };
  if (!db) return Response.json(buildDigest(rows));
  try {
    const t = await db.prepare("SELECT t.id,t.title,t.status,m.severity,m.state FROM tasks t LEFT JOIN kollab_task_meta m ON m.task_id=t.id WHERE t.status!='erledigt' ORDER BY t.id DESC LIMIT 50").all();
    rows.openTasks = t.results || [];
  } catch { rows.openTasks = []; }
  try {
    const p = await db.prepare("SELECT m.task_id,t.title,m.proposal_model,m.cost_usd,m.updated_at,m.proposal FROM kollab_task_meta m LEFT JOIN tasks t ON t.id=m.task_id WHERE m.state='vorschlag' AND m.updated_at >= datetime('now','-1 day') ORDER BY m.updated_at DESC LIMIT 30").all();
    rows.proposals = p.results || [];
  } catch { rows.proposals = []; }
  try {
    const s = await db.prepare("SELECT id,ts,actor,key,summary,undone FROM site_changes WHERE ts >= datetime('now','-1 day') ORDER BY id DESC LIMIT 50").all();
    rows.siteChanges = s.results || [];
  } catch { rows.siteChanges = []; }
  try {
    const m = await db.prepare("SELECT member,ts,actor,prompt IS NULL isDefault FROM kollab_member_prompts WHERE ts >= datetime('now','-1 day') ORDER BY id DESC LIMIT 30").all();
    rows.memberPromptChanges = m.results || [];
  } catch { rows.memberPromptChanges = []; }
  return Response.json(buildDigest(rows), { headers: { "cache-control": "no-store" } });
};
