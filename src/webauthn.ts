import { Env } from './env';
import { decodeCBOR } from './cbor';
import { AuthError } from './auth';
import { b64urlDecode, b64urlEncode, sha256hex } from './crypto';
import { mergeCredIds } from './webauthn-util';

interface Challenge {
  challenge: string;
  createdAt: number;
}

interface Credential {
  x: string;
  y: string;
  counter: number;
  createdAt: number;
}

function safeKind(raw: string): string {
  try { return String(JSON.parse(raw)?.kind || ''); } catch { return ''; }
}

export async function createRegistrationOptions(env: Env, rpId: string, origin: string): Promise<any> {
  if (!env.KV) throw new Error('KV required');
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const challengeB64 = b64urlEncode(challenge);
  await env.KV.put(`auth:chal:${challengeB64}`, JSON.stringify({ challenge: challengeB64, kind: 'register', createdAt: Date.now() }), { expirationTtl: 300 });

  // v84b: zufällige user.id – sonst überschreibt iOS/iCloud den Passkey bei jeder Neu-Registrierung.
  const userId = crypto.getRandomValues(new Uint8Array(16));

  // excludeCredentials aus Index ∪ KV.list (KV.list ist eventual consistent).
  let allowCredIds: string[] = [];
  try {
    const indexIds = await readCredIndex(env);
    const listed = await env.KV.list({ prefix: 'auth:cred:' });
    allowCredIds = mergeCredIds(indexIds, listed.keys.map((k) => k.name.slice('auth:cred:'.length)));
  } catch { allowCredIds = []; }

  return {
    challenge: challengeB64,
    rp: { name: 'Jeffa', id: rpId },
    user: { id: b64urlEncode(userId), name: 'admin', displayName: 'Admin' },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    timeout: 60000,
    attestation: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      requireResidentKey: false,
      userVerification: 'required',
    },
    excludeCredentials: allowCredIds.map((id) => ({ type: 'public-key' as const, id })),
  };
}

export async function verifyRegistration(env: Env, rpId: string, origin: string, credential: any): Promise<string> {
  if (!env.KV) throw new Error('KV required');

  const clientDataJSON = JSON.parse(new TextDecoder().decode(b64urlDecode(credential.response.clientDataJSON)));
  if (clientDataJSON.type !== 'webauthn.create') throw new AuthError(400, 'webauthn_invalid_type', 'Face ID: Ungültiger Passkey-Typ');
  if (clientDataJSON.origin !== origin) throw new AuthError(400, 'webauthn_origin_mismatch', 'Face ID: Herkunft passt nicht (andere Domain als bei der Einrichtung)');

  const challengeData = await env.KV.get(`auth:chal:${clientDataJSON.challenge}`);
  if (!challengeData) throw new AuthError(400, 'webauthn_challenge_not_found_or_expired', 'Face ID: Anfrage abgelaufen – bitte erneut versuchen');
  await env.KV.delete(`auth:chal:${clientDataJSON.challenge}`);
  // v84b: Challenge muss aus register/options stammen (sonst könnte eine frei abrufbare Login-Challenge eine Registrierung freischalten).
  if (safeKind(challengeData) !== 'register') throw new AuthError(400, 'webauthn_challenge_kind', 'Face ID: Anfrage passt nicht – bitte erneut versuchen');

  const attestationObject = decodeCBOR(b64urlDecode(credential.response.attestationObject));
  const authData = new Uint8Array(attestationObject.authData);

  const rpIdHash = authData.slice(0, 32);
  const expectedHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
  if (!arrayEqual(rpIdHash, expectedHash)) throw new AuthError(400, 'webauthn_rp_id_hash_mismatch', 'Face ID: Passkey gehört zu einer anderen Domain');

  const flags = authData[32];
  if (!(flags & 0x01)) throw new AuthError(400, 'webauthn_user_not_present', 'Face ID: Nutzer nicht bestätigt');
  if (!(flags & 0x04)) throw new AuthError(400, 'webauthn_user_not_verified', 'Face ID: Face ID/Touch ID nicht bestätigt');
  if (!(flags & 0x40)) throw new AuthError(400, 'webauthn_no_attested_credential_data', 'Face ID: Gerät hat keine Passkey-Daten geliefert');

  // v84b QA: authData = rpIdHash(32) | flags(1) | signCount(4) | AAGUID(16) | credIdLen(2) | credId | COSE-Key.
  // Vorher wurde die AAGUID nicht übersprungen → jede echte Registrierung (iPhone) scheiterte mit „Schlüsseltyp“.
  let pos = 37 + 16;
  const credentialIdLength = (authData[pos] << 8) | authData[pos + 1];
  pos += 2;
  const credentialId = authData.slice(pos, pos + credentialIdLength);
  pos += credentialIdLength;

  const credentialPublicKey = decodeCBOR(authData.slice(pos));
  if (credentialPublicKey[3] !== -7) throw new AuthError(400, 'webauthn_only_es256_supported', 'Face ID: Schlüsseltyp wird nicht unterstützt');

  const x = b64urlEncode(credentialPublicKey[-2]);
  const y = b64urlEncode(credentialPublicKey[-3]);

  const credIdB64 = b64urlEncode(credentialId);
  const credData: Credential = { x, y, counter: 0, createdAt: Date.now() };
  await env.KV.put(`auth:cred:${credIdB64}`, JSON.stringify(credData));

  // v84b: Credential-Index ergänzen (schnelle, konsistente Liste direkt nach dem Einrichten).
  try {
    const indexIds = await readCredIndex(env);
    const merged = mergeCredIds(indexIds, [credIdB64]);
    await env.KV.put('auth:credidx', JSON.stringify(merged));
  } catch {}

  return credIdB64;
}

export async function createLoginOptions(env: Env, rpId: string): Promise<any> {
  if (!env.KV) throw new Error('KV required');
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const challengeB64 = b64urlEncode(challenge);
  await env.KV.put(`auth:chal:${challengeB64}`, JSON.stringify({ challenge: challengeB64, kind: 'login', createdAt: Date.now() }), { expirationTtl: 300 });

  // v84b: Index ∪ KV.list (KV.list ist eventual consistent – direkt nach dem Einrichten sonst leer).
  let allowCredIds: string[] = [];
  try {
    const indexIds = await readCredIndex(env);
    const list = await env.KV.list({ prefix: 'auth:cred:' });
    allowCredIds = mergeCredIds(indexIds, list.keys.map((k) => k.name.slice('auth:cred:'.length)));
  } catch { allowCredIds = []; }
  const allowCredentials = allowCredIds.map((id) => ({ type: 'public-key' as const, id }));

  return { challenge: challengeB64, rpId, allowCredentials, userVerification: 'required', timeout: 60000 };
}

export async function verifyLogin(env: Env, rpId: string, origin: string, assertion: any): Promise<string> {
  if (!env.KV) throw new Error('KV required');

  const clientDataJSON = JSON.parse(new TextDecoder().decode(b64urlDecode(assertion.response.clientDataJSON)));
  if (clientDataJSON.type !== 'webauthn.get') throw new AuthError(400, 'webauthn_invalid_type', 'Face ID: Ungültiger Passkey-Typ');
  if (clientDataJSON.origin !== origin) throw new AuthError(400, 'webauthn_origin_mismatch', 'Face ID: Herkunft passt nicht (andere Domain als bei der Einrichtung)');

  const challengeData = await env.KV.get(`auth:chal:${clientDataJSON.challenge}`);
  if (!challengeData) throw new AuthError(400, 'webauthn_challenge_not_found_or_expired', 'Face ID: Anfrage abgelaufen – bitte erneut versuchen');
  await env.KV.delete(`auth:chal:${clientDataJSON.challenge}`);
  if (safeKind(challengeData) !== 'login') throw new AuthError(400, 'webauthn_challenge_kind', 'Face ID: Anfrage passt nicht – bitte erneut versuchen');

  const credData = await env.KV.get(`auth:cred:${assertion.id}`);
  if (!credData) throw new AuthError(400, 'webauthn_credential_not_found', 'Face ID: Passkey unbekannt – bitte neu einrichten');
  const cred: Credential = JSON.parse(credData);

  const authData = b64urlDecode(assertion.response.authenticatorData);
  const rpIdHash = authData.slice(0, 32);
  const expectedHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
  if (!arrayEqual(rpIdHash, expectedHash)) throw new AuthError(400, 'webauthn_rp_id_hash_mismatch', 'Face ID: Passkey gehört zu einer anderen Domain');

  const flags = authData[32];
  if (!(flags & 0x01)) throw new AuthError(400, 'webauthn_user_not_present', 'Face ID: Nutzer nicht bestätigt');
  if (!(flags & 0x04)) throw new AuthError(400, 'webauthn_user_not_verified', 'Face ID: Face ID/Touch ID nicht bestätigt');

  const clientDataHash = new Uint8Array(await crypto.subtle.digest('SHA-256', b64urlDecode(assertion.response.clientDataJSON)));
  const signedData = new Uint8Array(authData.length + clientDataHash.length);
  signedData.set(authData, 0);
  signedData.set(clientDataHash, authData.length);

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: cred.x, y: cred.y },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );

  const signatureDER = b64urlDecode(assertion.response.signature);
  const signature = derToRaw(signatureDER);

  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, signedData);
  if (!valid) throw new AuthError(400, 'webauthn_signature_verification_failed', 'Face ID: Signature verification failed');

  return assertion.id;
}

async function readCredIndex(env: Env): Promise<string[]> {
  if (!env.KV) return [];
  try {
    const raw = await env.KV.get('auth:credidx');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((v: any) => typeof v === 'string') : [];
  } catch { return []; }
}

function arrayEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function derToRaw(der: Uint8Array): Uint8Array {
  let pos = 2;
  let rLen = der[pos + 1];
  pos += 2;
  let r = der.slice(pos, pos + rLen);
  if (r[0] === 0) r = r.slice(1);
  pos += rLen;
  pos++;
  let sLen = der[pos];
  pos++;
  let s = der.slice(pos, pos + sLen);
  if (s[0] === 0) s = s.slice(1);
  const raw = new Uint8Array(64);
  raw.set(r, 32 - r.length);
  raw.set(s, 64 - s.length);
  return raw;
}
