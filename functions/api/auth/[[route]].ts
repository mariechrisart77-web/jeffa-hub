import { Env } from "../../../src/env";
import { AuthError, getSession, requireRole, createSession, checkPinLock, recordPinFailure, setupPin, verifyPin, getAuthState } from "../../../src/auth";
import { createRegistrationOptions, verifyRegistration, createLoginOptions, verifyLogin } from "../../../src/webauthn";
import { sha256hex, randomToken } from "../../../src/crypto";
import { checkRateLimit, clientKey } from "../../../src/ratelimit";
import { rpIdFor } from "../../../src/webauthn-util";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.KV) return new Response(JSON.stringify({ error: { code: 'kv_missing', message: 'KV nicht verfügbar' } }), { status: 503, headers: { 'content-type': 'application/json' } });

  const url = new URL(ctx.request.url);
  const path = url.pathname.replace('/api/auth', '');
  const method = ctx.request.method;

  const ip = clientKey(ctx.request.headers.get('cf-connecting-ip') || '127.0.0.1');

  if (path === '/state' && method === 'GET') {
    const state = await getAuthState(ctx.env);
    const session = await getSession(ctx);
    return json({ ...state, session: session ? { role: session.role } : null });
  }

  if (path === '/logout' && method === 'POST') {
    const auth = ctx.request.headers.get('authorization');
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice(7);
      if (!token.startsWith('jft_')) {
        const hash = await sha256hex(token);
        await ctx.env.KV.delete(`sess:${hash}`);
      }
    }
    return json({ ok: true });
  }

  if (path === '/pin/setup' && method === 'POST') {
    await checkRateLimit(ctx.env, ip);
    const body = await ctx.request.json<{ pin: string }>();
    const session = await getSession(ctx);
    const isAdmin = session?.role === 'admin';
    await setupPin(ctx.env, body.pin, isAdmin);
    return json({ ok: true });
  }

  if (path === '/pin/login' && method === 'POST') {
    await checkRateLimit(ctx.env, ip);
    await checkPinLock(ctx.env, ip);
    const body = await ctx.request.json<{ pin: string }>();
    const valid = await verifyPin(ctx.env, body.pin);
    if (!valid) {
      await recordPinFailure(ctx.env, ip);
      throw new AuthError(401, 'invalid_pin', 'Falscher PIN');
    }
    const token = await createSession(ctx.env, 'admin', 'pin');
    return json({ token, role: 'admin' });
  }

  if (path === '/webauthn/register/options' && method === 'POST') {
    await checkRateLimit(ctx.env, ip);
    const session = await getSession(ctx);
    const isAdmin = session?.role === 'admin';
    if (!isAdmin) {
      const state = await getAuthState(ctx.env);
      if (state.pinSet || state.passkeys > 0) throw new AuthError(403, 'forbidden', 'Passkey oder PIN bereits vorhanden');
    }
    const origin = new URL(ctx.request.url).origin;
    const rpId = rpIdFor(new URL(ctx.request.url).hostname, ctx.env.RP_ID);
    const options = await createRegistrationOptions(ctx.env, rpId, origin);
    return json(options);
  }

  if (path === '/webauthn/register/verify' && method === 'POST') {
    await checkRateLimit(ctx.env, ip);
    // v84b: gleiche Schranke wie bei register/options – verify stellt jetzt eine Admin-Session aus.
    {
      const session = await getSession(ctx);
      if (session?.role !== 'admin') {
        const state = await getAuthState(ctx.env);
        if (state.pinSet || state.passkeys > 0) throw new AuthError(403, 'forbidden', 'Passkey oder PIN bereits vorhanden');
      }
    }
    const body = await ctx.request.json();
    const origin = new URL(ctx.request.url).origin;
    const rpId = rpIdFor(new URL(ctx.request.url).hostname, ctx.env.RP_ID);
    try { await verifyRegistration(ctx.env, rpId, origin, body); } catch (e: any) {
      if (e instanceof AuthError) throw e;
      throw new AuthError(400, 'webauthn_parse', 'Face ID: Antwort des Geräts nicht lesbar (' + String(e?.message || e).slice(0, 120) + ')');
    }
    // v84b: Nach der Registrierung direkt eine Admin-Session ausstellen (iOS: kein zweites get() nach der Geste).
    const token = await createSession(ctx.env, 'admin', 'webauthn');
    return json({ ok: true, token, role: 'admin' });
  }

  if (path === '/webauthn/login/options' && method === 'POST') {
    await checkRateLimit(ctx.env, ip);
    const rpId = rpIdFor(new URL(ctx.request.url).hostname, ctx.env.RP_ID);
    const options = await createLoginOptions(ctx.env, rpId);
    return json(options);
  }

  if (path === '/webauthn/login/verify' && method === 'POST') {
    await checkRateLimit(ctx.env, ip);
    const body = await ctx.request.json();
    const origin = new URL(ctx.request.url).origin;
    const rpId = rpIdFor(new URL(ctx.request.url).hostname, ctx.env.RP_ID);
    try { await verifyLogin(ctx.env, rpId, origin, body); } catch (e: any) {
      if (e instanceof AuthError) throw e;
      throw new AuthError(400, 'webauthn_parse', 'Face ID: Antwort des Geräts nicht lesbar (' + String(e?.message || e).slice(0, 120) + ')');
    }
    const token = await createSession(ctx.env, 'admin', 'webauthn');
    return json({ token, role: 'admin' });
  }

  if (path === '/tokens' && method === 'GET') {
    await requireRole(ctx, 'admin');
    const indexData = await ctx.env.KV.get('tok:index');
    const tokens = indexData ? JSON.parse(indexData) : [];
    return json(tokens);
  }

  if (path === '/tokens' && method === 'POST') {
    await requireRole(ctx, 'admin');
    const body = await ctx.request.json<{ label: string; role: 'admin' | 'read' }>();
    const id = randomToken(8);
    const token = 'jft_' + randomToken(32);
    const hash = await sha256hex(token);
    const data = { id, label: body.label, role: body.role, createdAt: Date.now() };
    await ctx.env.KV.put(`tok:${hash}`, JSON.stringify(data));

    const indexData = await ctx.env.KV.get('tok:index');
    const tokens = indexData ? JSON.parse(indexData) : [];
    tokens.push({ id, label: body.label, role: body.role, createdAt: data.createdAt });
    await ctx.env.KV.put('tok:index', JSON.stringify(tokens));

    return json({ id, token });
  }

  if (path.startsWith('/tokens/') && method === 'DELETE') {
    await requireRole(ctx, 'admin');
    const id = path.slice(9);
    const indexData = await ctx.env.KV.get('tok:index');
    const tokens = indexData ? JSON.parse(indexData) : [];
    const newTokens = tokens.filter((t: any) => t.id !== id);
    await ctx.env.KV.put('tok:index', JSON.stringify(newTokens));

    const list = await ctx.env.KV.list({ prefix: 'tok:' });
    for (const key of list.keys) {
      if (key.name === 'tok:index') continue;
      const data = await ctx.env.KV.get(key.name);
      if (data) {
        const tok = JSON.parse(data);
        if (tok.id === id) {
          await ctx.env.KV.delete(key.name);
          break;
        }
      }
    }

    return json({ ok: true });
  }

  return new Response('Not Found', { status: 404 });
};

function json(data: any) {
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
}
