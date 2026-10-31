// GET/PUT /api/styles – own style presets synced across devices (owner session required).
import { Env } from "../../src/env";
import { requireRole, AuthError } from "../../src/auth";
// @ts-ignore plain JS helper
import { cleanStyles } from "../../apps/shared/styles-sync.js";
const j = (s: number, o: unknown) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
async function auth(ctx: any) { try { await requireRole(ctx, "read"); return null; } catch (e) { if (e instanceof AuthError) return j(e.status, { error: e.code }); throw e; } }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const a = await auth(ctx); if (a) return a;
  if (!ctx.env.DB) return j(503, { error: "no_db" });
  const row = await ctx.env.DB.prepare("SELECT data, updated FROM user_styles WHERE id='owner'").first<{ data: string; updated: number }>();
  return j(200, { items: row ? JSON.parse(row.data) : [], updated: row?.updated || 0 });
};
export const onRequestPut: PagesFunction<Env> = async (ctx) => {
  const a = await auth(ctx); if (a) return a;
  if (!ctx.env.DB) return j(503, { error: "no_db" });
  let b: any; try { b = await ctx.request.json(); } catch { return j(400, { error: "bad_input" }); }
  const items = cleanStyles(b?.items); if (!items) return j(400, { error: "bad_input" });
  const data = JSON.stringify(items); if (data.length > 200_000) return j(413, { error: "too_large" });
  const now = Date.now();
  await ctx.env.DB.prepare("INSERT INTO user_styles (id, data, updated) VALUES ('owner', ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated=excluded.updated").bind(data, now).run();
  return j(200, { ok: true, count: items.length, updated: now });
};
