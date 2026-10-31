import { Env } from './env';
import { sha256hex, randomToken, constantTimeCompare, pbkdf2, b64urlEncode } from './crypto';
import { mergeCredIds } from './webauthn-util';

export class AuthError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

interface Session {
  role: 'admin' | 'read';
  createdAt: number;
  via: 'webauthn' | 'pin' | 'token';
  lastSeen?: number;
}

// v57: persistent sessions — 90 days, sliding (renewed at most once per day on use).
export const SESSION_TTL_S = 90 * 24 * 3600;
const RENEW_AFTER_MS = 24 * 3600 * 1000;

interface PinData {
  hash: string;
  salt: string;
  iterations: number;
}

export async function getSession(ctx: EventContext<Env, any, any>): Promise<Session | null> {
  const auth = ctx.request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    // API-Key für Bild-Dienst
    if (ctx.env.BILD_API_KEY) {
      const key = ctx.request.headers.get('x-bild-key');
      if (key && await constantTimeCompare(key, ctx.env.BILD_API_KEY)) {
        return { role: 'admin', createdAt: Date.now(), via: 'token' };
      }
    }
    return null;
  }
  const token = auth.slice(7);

  if (token.startsWith('jft_')) {
    const hash = await sha256hex(token);
    const data = await ctx.env.KV?.get(`tok:${hash}`);
    if (!data) return null;
    const tok = JSON.parse(data);
    return { role: tok.role, createdAt: tok.createdAt, via: 'token' };
  }

  const hash = await sha256hex(token);
  const data = await ctx.env.KV?.get(`sess:${hash}`);
  if (!data) return null;
  const sess: Session = JSON.parse(data);
  const now = Date.now();
  if (now - (sess.lastSeen || sess.createdAt) > RENEW_AFTER_MS) {
    sess.lastSeen = now;
    const p = ctx.env.KV!.put(`sess:${hash}`, JSON.stringify(sess), { expirationTtl: SESSION_TTL_S });
    try { (ctx as any).waitUntil ? ctx.waitUntil(p) : await p; } catch { await p; }
  }
  return sess;
}

export async function requireRole(ctx: EventContext<Env, any, any>, role: 'admin' | 'read'): Promise<Session> {
  const session = await getSession(ctx);
  if (!session) throw new AuthError(401, 'unauthorized', 'Nicht angemeldet');
  if (role === 'admin' && session.role !== 'admin') throw new AuthError(403, 'forbidden', 'Admin-Rechte erforderlich');
  return session;
}

export async function createSession(env: Env, role: 'admin' | 'read', via: 'webauthn' | 'pin' | 'token'): Promise<string> {
  if (!env.KV) throw new Error('KV required');
  const token = randomToken(32);
  const hash = await sha256hex(token);
  const now = Date.now();
  const session: Session = { role, createdAt: now, lastSeen: now, via };
  await env.KV.put(`sess:${hash}`, JSON.stringify(session), { expirationTtl: SESSION_TTL_S });
  return token;
}

export async function checkPinLock(env: Env, ip: string): Promise<void> {
  if (!env.KV) return;
  const key = `auth:pinfail:${ip}`;
  const data = await env.KV.get(key);
  if (!data) return;
  const attempts: number[] = JSON.parse(data);
  const recent = attempts.filter(t => Date.now() - t < 15 * 60 * 1000);
  if (recent.length >= 5) throw new AuthError(429, 'pin_locked', 'Zu viele Fehlversuche. Warte 15 Minuten.');
}

export async function recordPinFailure(env: Env, ip: string): Promise<void> {
  if (!env.KV) return;
  const key = `auth:pinfail:${ip}`;
  const data = await env.KV.get(key);
  const attempts: number[] = data ? JSON.parse(data) : [];
  attempts.push(Date.now());
  const recent = attempts.filter(t => Date.now() - t < 15 * 60 * 1000);
  await env.KV.put(key, JSON.stringify(recent), { expirationTtl: 15 * 60 });
}

export async function setupPin(env: Env, pin: string, isAdmin: boolean): Promise<void> {
  if (!env.KV) throw new Error('KV required');
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN muss 4 Ziffern sein');

  if (!isAdmin) {
    const hasPin = await env.KV.get('auth:pin');
    const credList = await env.KV.list({ prefix: 'auth:cred:' });
    if (hasPin || credList.keys.length > 0) throw new AuthError(403, 'forbidden', 'PIN oder Passkey bereits vorhanden');
  }

  const salt = crypto.getRandomValues(new Uint8Array(32));
  const hash = await pbkdf2(pin, salt, 100000);
  const pinData: PinData = { hash: b64urlEncode(hash), salt: b64urlEncode(salt), iterations: 100000 };
  await env.KV.put('auth:pin', JSON.stringify(pinData));
}

export async function verifyPin(env: Env, pin: string): Promise<boolean> {
  if (!env.KV) throw new Error('KV required');
  const data = await env.KV.get('auth:pin');
  if (!data) return false;
  const pinData: PinData = JSON.parse(data);
  const salt = new Uint8Array(atob(pinData.salt.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => c.charCodeAt(0)));
  const hash = await pbkdf2(pin, salt, pinData.iterations);
  const computed = b64urlEncode(hash);
  return constantTimeCompare(computed, pinData.hash);
}

export async function getAuthState(env: Env): Promise<{ pinSet: boolean; passkeys: number }> {
  if (!env.KV) return { pinSet: false, passkeys: 0 };
  const pinSet = !!(await env.KV.get('auth:pin'));
  // v84b: Index ∪ KV.list – KV.list ist eventual consistent (direkt nach dem Einrichten sonst 0).
  // QA: KV-Fehler NICHT als „0 Passkeys" werten (sonst wäre die Ersteinrichtungs-Schranke offen) – nur kaputtes JSON tolerieren.
  let idx: any = [];
  try { const raw = await env.KV.get('auth:credidx'); idx = raw ? JSON.parse(raw) : []; } catch { idx = []; }
  const credList = await env.KV.list({ prefix: 'auth:cred:' });
  const passkeys = mergeCredIds(
    Array.isArray(idx) ? idx.filter((v: any) => typeof v === 'string') : [],
    credList.keys.map((k) => k.name.slice('auth:cred:'.length))
  ).length;
  return { pinSet, passkeys };
}
