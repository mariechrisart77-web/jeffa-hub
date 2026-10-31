// GET/POST /api/kollab/team — feste Kollab-Mitglieder + editierbare Systemprompts.
import type { Env } from "../../../src/env";
import { requireRole } from "../../../src/auth";
import { TEAM, DEFAULT_PROMPTS as DP, memberById, effectivePrompt, sanitizePrompt } from "../../../src/kollab-team.js";
const DEFAULT_PROMPTS = DP as Record<string, string>;

async function currentPrompts(env: Env): Promise<Record<string, { prompt: string | null; version: number }>> {
  const out: Record<string, { prompt: string | null; version: number }> = {};
  if (!env.DB) return out;
  try {
    const r = await env.DB.prepare("SELECT member, prompt, id FROM kollab_member_prompts WHERE id IN (SELECT MAX(id) FROM kollab_member_prompts GROUP BY member)").all();
    for (const row of (r.results || []) as any[]) {
      if (!out[row.member]) out[row.member] = { prompt: row.prompt ?? null, version: Number(row.id) };
    }
  } catch { /* Tabelle fehlt */ }
  return out;
}

function view(id: string, cur: { prompt: string | null; version: number } | undefined, def: string) {
  const mem = memberById(id)!;
  const ov = cur?.prompt ?? null;
  return { id: mem.id, name: mem.name, avatar: mem.avatar, role: mem.role, model: mem.model, prompt: effectivePrompt(id, ov), isDefault: !sanitizePrompt(ov), version: cur?.version || 0, defaultPrompt: def };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  await requireRole(context, "read");
  const cur = await currentPrompts(context.env);
  return Response.json({ members: TEAM.map((m) => view(m.id, cur[m.id], DEFAULT_PROMPTS[m.id])) }, { headers: { "cache-control": "no-store" } });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const session = await requireRole(context, "admin");
  const body: any = await context.request.json().catch(() => ({}));
  const mem = memberById(String(body.member || ""));
  if (!mem) return Response.json({ error: { code: "bad_member", message: "Unbekanntes Mitglied" } }, { status: 400 });
  if (!context.env.DB) return Response.json({ error: { code: "no_db", message: "Keine Datenbank" } }, { status: 500 });
  let prompt: string | null = null;
  if (body.reset !== true) {
    prompt = sanitizePrompt(body.prompt);
    if (!prompt) return Response.json({ error: { code: "bad_prompt", message: "Prompt leer oder ungültig" } }, { status: 400 });
  }
  const row: any = await context.env.DB.prepare("INSERT INTO kollab_member_prompts (member, prompt, actor) VALUES (?, ?, ?) RETURNING id")
    .bind(mem.id, prompt, (session as any)?.role || "admin").first();
  return Response.json({ member: view(mem.id, { prompt, version: Number(row?.id) || 0 }, DEFAULT_PROMPTS[mem.id]) });
};
