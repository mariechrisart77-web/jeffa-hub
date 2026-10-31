import { Env } from './env';
import { decodeCBOR } from './cbor';
import { AuthError } from './auth';
import { b64urlDecode, b64urlEncode, sha256hex } from './crypto';

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

export async function createRegistrationOptions(env: Env, rpId: string, origin: string): Promise<any> {
  if (!env.KV) throw new Error('KV required');
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const challengeB64 = b64urlEncode(challenge);
  await env.KV.put(`auth:chal:${challengeB64}`, JSON.stringify({ challenge: challengeB64, createdAt: Date.now() }), { expirationTtl: 300 });

  return {
    challenge: challengeB64,
    rp: { name: 'Jeffa', id: rpId },
    user: { id: b64urlEncode(new Uint8Array(16)), name: 'admin', displayName: 'Admin' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    timeout: 60000,
    attestation: 'none',
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
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

  const attestationObject = decodeCBOR(b64urlDecode(credential.response.attestationObject));
  const authData = new Uint8Array(attestationObject.authData);

  const rpIdHash = authData.slice(0, 32);
  const expectedHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
  if (!arrayEqual(rpIdHash, expectedHash)) throw new AuthError(400, 'webauthn_rp_id_hash_mismatch', 'Face ID: Passkey gehört zu einer anderen Domain');

  const flags = authData[32];
  if (!(flags & 0x01)) throw new AuthError(400, 'webauthn_user_not_present', 'Face ID: Nutzer nicht bestätigt');
  if (!(flags & 0x04)) throw new AuthError(400, 'webauthn_user_not_verified', 'Face ID: Face ID/Touch ID nicht bestätigt');
  if (!(flags & 0x40)) throw new AuthError(400, 'webauthn_no_attested_credential_data', 'Face ID: Gerät hat keine Passkey-Daten geliefert');

  let pos = 37;
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

  return credIdB64;
}

export async function createLoginOptions(env: Env, rpId: string): Promise<any> {
  if (!env.KV) throw new Error('KV required');
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const challengeB64 = b64urlEncode(challenge);
  await env.KV.put(`auth:chal:${challengeB64}`, JSON.stringify({ challenge: challengeB64, createdAt: Date.now() }), { expirationTtl: 300 });

  const list = await env.KV.list({ prefix: 'auth:cred:' });
  const allowCredentials = list.keys.map(k => ({ type: 'public-key' as const, id: k.name.slice(10) }));

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
