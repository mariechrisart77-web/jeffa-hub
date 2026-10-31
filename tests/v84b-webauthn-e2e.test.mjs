// v84b QA (Bot): WebAuthn Ende-zu-Ende in Node – Registrierung + Login mit echtem P-256-Schlüssel,
// Mock-KV, Credential-Index und Challenge-Art (Login-Challenge darf keine Registrierung freischalten).
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webcrypto as wc } from 'node:crypto';

const dir = mkdtempSync(join(tmpdir(), 'jeffa-wa-'));
const out = join(dir, 'wa.mjs');
await build({ stdin: { contents: "export * from './src/webauthn.ts'; export { getAuthState } from './src/auth.ts';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent' });
const WA = await import(out);
test.after(() => rmSync(dir, { recursive: true, force: true }));

function mockKV() {
  const m = new Map();
  return { m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, String(v)); },
    async delete(k) { m.delete(k); },
    async list({ prefix = '' } = {}) { return { keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })) }; },
  };
}
const b64u = (u8) => Buffer.from(u8).toString('base64url');
const fromB64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
// Minimal-CBOR (nur was für none-Attestation + COSE-Key nötig ist)
function cborHead(major, n) { if (n < 24) return [major << 5 | n]; if (n < 256) return [major << 5 | 24, n]; return [major << 5 | 25, n >> 8, n & 255]; }
function cbor(v) {
  if (typeof v === 'number') return v >= 0 ? cborHead(0, v) : cborHead(1, -1 - v);
  if (typeof v === 'string') { const b = [...Buffer.from(v)]; return [...cborHead(3, b.length), ...b]; }
  if (v instanceof Uint8Array) return [...cborHead(2, v.length), ...v];
  if (v instanceof Map) { const o = cborHead(5, v.size); for (const [k, x] of v) o.push(...cbor(k), ...cbor(x)); return o; }
  throw new Error('cbor type');
}
function rawToDer(raw) {
  const int = (b) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); if (b[0] & 0x80) b = Uint8Array.from([0, ...b]); return [0x02, b.length, ...b]; };
  const r = int(raw.slice(0, 32)), s = int(raw.slice(32));
  return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]);
}
const sha = async (u8) => new Uint8Array(await wc.subtle.digest('SHA-256', u8));

const RP = 'jeffa-hub.pages.dev', ORIGIN = 'https://preview-v84.jeffa-hub.pages.dev';

async function fakeAuthenticator() {
  const kp = await wc.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await wc.subtle.exportKey('jwk', kp.publicKey);
  const credId = wc.getRandomValues(new Uint8Array(16));
  return {
    credId,
    async create(opts, origin = ORIGIN, rp = RP) {
      const cd = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: opts.challenge, origin }));
      const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, fromB64u(jwk.x)], [-3, fromB64u(jwk.y)]]);
      const authData = Uint8Array.from([...(await sha(Buffer.from(rp))), 0x45, 0, 0, 0, 0, ...new Uint8Array(16), 0, credId.length, ...credId, ...cbor(cose)]);
      const att = Uint8Array.from(cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]])));
      return { id: b64u(credId), rawId: b64u(credId), response: { clientDataJSON: b64u(cd), attestationObject: b64u(att) } };
    },
    async get(opts, origin = ORIGIN, flags = 0x05) {
      const cd = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: opts.challenge, origin }));
      const authData = Uint8Array.from([...(await sha(Buffer.from(RP))), flags, 0, 0, 0, 1]);
      const signed = Uint8Array.from([...authData, ...(await sha(cd))]);
      const sig = new Uint8Array(await wc.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, signed));
      return { id: b64u(credId), response: { clientDataJSON: b64u(cd), authenticatorData: b64u(authData), signature: b64u(rawToDer(sig)) } };
    },
  };
}

test('WebAuthn E2E: Optionen (iOS-tauglich) → Registrierung → Index → Login', async () => {
  const env = { KV: mockKV() };
  const dev = await fakeAuthenticator();
  const ro = await WA.createRegistrationOptions(env, RP, ORIGIN);
  assert.equal(ro.rp.id, RP);
  assert.equal(ro.authenticatorSelection.residentKey, 'preferred');
  assert.equal(ro.authenticatorSelection.userVerification, 'required');
  assert.ok(fromB64u(ro.user.id).some(b => b !== 0), 'user.id zufällig, nicht Nullen');
  assert.deepEqual(ro.pubKeyCredParams.map(p => p.alg), [-7, -257]);
  assert.deepEqual(ro.excludeCredentials, []);
  const id = await WA.verifyRegistration(env, RP, ORIGIN, await dev.create(ro));
  assert.equal(id, b64u(dev.credId));
  assert.deepEqual(JSON.parse(env.KV.m.get('auth:credidx')), [id]);
  assert.equal((await WA.getAuthState(env)).passkeys, 1);
  const ro2 = await WA.createRegistrationOptions(env, RP, ORIGIN);
  assert.deepEqual(ro2.excludeCredentials.map(c => c.id), [id]);

  const lo = await WA.createLoginOptions(env, RP);
  assert.deepEqual(lo.allowCredentials.map(c => c.id), [id]);
  assert.equal(await WA.verifyLogin(env, RP, ORIGIN, await dev.get(lo)), id);
  // Challenge ist einmalig
  await assert.rejects(WA.verifyLogin(env, RP, ORIGIN, await dev.get(lo)), /abgelaufen/);
});

test('WebAuthn: Login-Challenge schaltet KEINE Registrierung frei (Sicherheitsfix QA)', async () => {
  const env = { KV: mockKV() };
  const dev = await fakeAuthenticator();
  const lo = await WA.createLoginOptions(env, RP);
  await assert.rejects(WA.verifyRegistration(env, RP, ORIGIN, await dev.create(lo)), (e) => e.code === 'webauthn_challenge_kind');
  assert.equal((await WA.getAuthState(env)).passkeys, 0);
  // und umgekehrt
  const ro = await WA.createRegistrationOptions(env, RP, ORIGIN);
  await WA.verifyRegistration(env, RP, ORIGIN, await dev.create(ro));
  const ro2 = await WA.createRegistrationOptions(env, RP, ORIGIN);
  await assert.rejects(WA.verifyLogin(env, RP, ORIGIN, await dev.get(ro2)), (e) => e.code === 'webauthn_challenge_kind');
});

test('WebAuthn: falsche Herkunft, fehlendes UV, fremder Schlüssel werden abgelehnt', async () => {
  const env = { KV: mockKV() };
  const dev = await fakeAuthenticator();
  await WA.verifyRegistration(env, RP, ORIGIN, await dev.create(await WA.createRegistrationOptions(env, RP, ORIGIN)));
  await assert.rejects(WA.verifyLogin(env, RP, ORIGIN, await dev.get(await WA.createLoginOptions(env, RP), 'https://evil.example')), (e) => e.code === 'webauthn_origin_mismatch');
  await assert.rejects(WA.verifyLogin(env, RP, ORIGIN, await dev.get(await WA.createLoginOptions(env, RP), ORIGIN, 0x01)), (e) => e.code === 'webauthn_user_not_verified');
  const other = await fakeAuthenticator();
  const fake = await other.get(await WA.createLoginOptions(env, RP));
  fake.id = b64u(dev.credId); // fremde Signatur unter bekannter ID
  await assert.rejects(WA.verifyLogin(env, RP, ORIGIN, fake), (e) => e.code === 'webauthn_signature_verification_failed');
});

test('getAuthState: Index ∪ KV.list, KV-Fehler wird nicht zu „0 Passkeys"', async () => {
  const env = { KV: mockKV() };
  env.KV.m.set('auth:credidx', JSON.stringify(['a', 'b']));
  env.KV.m.set('auth:cred:b', '{}'); env.KV.m.set('auth:cred:c', '{}');
  assert.equal((await WA.getAuthState(env)).passkeys, 3);
  env.KV.list = async () => { throw new Error('kv down'); };
  await assert.rejects(WA.getAuthState(env), /kv down/);
});
