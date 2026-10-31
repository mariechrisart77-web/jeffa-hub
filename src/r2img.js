// Generated images in R2 (binding IMAGES). Pure helpers + store/serve; every R2 failure is non-fatal (caller keeps the dataUrl fallback).
const enc = new TextEncoder();
export const KEY_RE = /^gen\/[0-9]{6}\/[A-Za-z0-9_-]{1,64}\/[a-f0-9-]{36}\.(webp|png|jpg)$/;
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
export function makeKey(profile, mime = 'image/webp', now = new Date(), uuid = crypto.randomUUID()) {
  const ym = now.toISOString().slice(0, 7).replace('-', '');
  const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'webp';
  const p = /^[A-Za-z0-9_-]{1,64}$/.test(String(profile || '')) ? String(profile) : 'misc';
  return `gen/${ym}/${p}/${uuid}.${ext}`;
}
export async function signUrl(secret, key, exp) { return `/api/img/${key}?exp=${exp}&sig=${await hmac(secret, key + '|' + exp)}`; }
export async function verifySig(secret, key, exp, sig, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret || !sig || !/^\d{1,12}$/.test(String(exp)) || Number(exp) < nowSec) return false;
  const want = await hmac(secret, key + '|' + exp);
  if (want.length !== String(sig).length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ String(sig).charCodeAt(i);
  return d === 0;
}
const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
/** -> { key, url } | null. Never throws. url is signed (1 year) when a signing secret exists, else bearer-only. */
export async function storeGenerated(env, b64, { mime = 'image/webp', profile = '', model = '' } = {}) {
  try {
    if (!env?.IMAGES || !b64) return null;
    const key = makeKey(profile, mime);
    await env.IMAGES.put(key, b64ToBytes(b64), { httpMetadata: { contentType: mime }, customMetadata: { profile: String(profile).slice(0, 64), model: String(model).slice(0, 120) } });
    const secret = env.VAULT_SECRET;
    const url = secret ? await signUrl(secret, key, Math.floor(Date.now() / 1000) + 365 * 86400) : `/api/img/${key}`;
    return { key, url };
  } catch { return null; }
}
