// GET /api/kollab/meta — Zusatzinfos zu Aufgaben (Severity, Zustand, Vorschlag).
import type { Env } from "../../../src/env";
import { requireRole } from "../../../src/auth";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  await requireRole(context, "read");
  if (!context.env.DB) return Response.json({ meta: [] });
  try {
    const r = await context.env.DB.prepare("SELECT task_id,severity,state,substr(proposal,1,20000) proposal,proposal_model,cost_usd,context,updated_at FROM kollab_task_meta ORDER BY task_id DESC LIMIT 200").all();
    return Response.json({ meta: r.results || [] }, { headers: { "cache-control": "no-store" } });
  } catch { return Response.json({ meta: [] }); }
};
