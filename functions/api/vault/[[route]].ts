import { Env } from "../../../src/env";
import { requireRole, getSession } from "../../../src/auth";
import { listKeys, setKey, deleteKey, revealKey, Provider } from "../../../src/keys";
import { checkRateLimit, clientKey } from "../../../src/ratelimit";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.KV) return new Response(JSON.stringify({ error: { code: 'kv_missing', message: 'KV nicht verfügbar' } }), { status: 503, headers: { 'content-type': 'application/json' } });

  const url = new URL(ctx.request.url);
  const path = url.pathname.replace('/api/vault', '');
  const method = ctx.request.method;
  const ip = clientKey(ctx.request.headers.get('cf-connecting-ip') || '127.0.0.1');

  await checkRateLimit(ctx.env, ip);

  if (path === '/keys' && method === 'GET') {
    await requireRole(ctx, 'admin');
    const keys = await listKeys(ctx.env);
    return json(keys);
  }

  if (path.startsWith('/keys/') && method === 'PUT') {
    await requireRole(ctx, 'admin');
    const provider = path.slice(6) as Provider;
    const body = await ctx.request.json<{ value?: string; enabled?: boolean; label?: string }>();
    await setKey(ctx.env, provider, body.value, body.enabled, body.label);
    return json({ ok: true });
  }

  if (path.startsWith('/keys/') && method === 'DELETE') {
    await requireRole(ctx, 'admin');
    const provider = path.slice(6) as Provider;
    await deleteKey(ctx.env, provider);
    return json({ ok: true });
  }

  if (path === '/reveal' && method === 'POST') {
    const session = await requireRole(ctx, 'admin');
    if (session.via !== 'webauthn' && session.via !== 'pin') {
      return new Response(JSON.stringify({ error: { code: 'reauth_required', message: 'Erneute Anmeldung erforderlich' } }), { status: 403, headers: { 'content-type': 'application/json' } });
    }
    if (Date.now() - session.createdAt > 10 * 60 * 1000) {
      return new Response(JSON.stringify({ error: { code: 'reauth_required', message: 'Session zu alt – erneut anmelden' } }), { status: 403, headers: { 'content-type': 'application/json' } });
    }
    const body = await ctx.request.json<{ provider: Provider }>();
    const value = await revealKey(ctx.env, body.provider);
    return json({ value: value || null });
  }

  return new Response('Not Found', { status: 404 });
};

function json(data: any) {
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
}
