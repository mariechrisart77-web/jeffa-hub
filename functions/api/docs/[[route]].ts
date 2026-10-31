import { Env } from "../../../src/env";
import { requireRole } from "../../../src/auth";
import { checkRateLimit, clientKey } from "../../../src/ratelimit";

const err = (code: string, message: string, status: number) =>
  new Response(JSON.stringify({ error: { code, message } }), { status, headers: { 'content-type': 'application/json' } });
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const db = ctx.env.DB;
  if (!db) return err('db_missing', 'Datenbank nicht verfügbar', 503);
  await checkRateLimit(ctx.env, clientKey(ctx.request.headers.get('cf-connecting-ip') || '127.0.0.1'));
  const slug = new URL(ctx.request.url).pathname.replace(/^\/api\/docs\/?/, '');
  const method = ctx.request.method;

  if (method === 'GET' && !slug) {
    await requireRole(ctx, 'admin');
    const r = await db.prepare('SELECT slug, title, updated_at FROM docs ORDER BY updated_at DESC').all();
    return json(r.results || []);
  }
  if (method === 'GET') {
    await requireRole(ctx, 'admin');
    const row = await db.prepare('SELECT slug, title, body_md, updated_at FROM docs WHERE slug = ?').bind(slug).first();
    return row ? json(row) : err('not_found', 'Dokument nicht gefunden', 404);
  }
  if (method === 'PUT' && /^[a-z0-9-]{1,64}$/.test(slug)) {
    await requireRole(ctx, 'admin');
    const b = await ctx.request.json<{ title?: string; body_md?: string }>();
    if (!b.title || !b.body_md || b.body_md.length > 200000) return err('bad_request', 'title und body_md nötig', 400);
    await db.prepare('INSERT INTO docs (slug, title, body_md, updated_at) VALUES (?,?,?,?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title, body_md=excluded.body_md, updated_at=excluded.updated_at')
      .bind(slug, b.title, b.body_md, Date.now()).run();
    return json({ ok: true });
  }
  return err('not_found', 'Unbekannte Route', 404);
};
