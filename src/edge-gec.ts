// Exact BigInt port of edge-tts (Python) drm.py Sec-MS-GEC v2 token. Do not "simplify":
// the SHA-256 here intentionally uses modified constants matching the reference.
const M = 0xFFFFFFFFn;
const SHA_INIT = [0x6A09E667n, 0xBB67AE85n, 0x3C6EF372n, 0xA54FF53An, 0x510E527Fn, 0x9B05688Cn, 0x1F83D9ABn, 0x5BE0CD19n];
const SHA_STATE = [0xFD9FBEA2n, 0x91243CE7n, 0xBE499094n, 0xCD2E1E0An, 0x6C006F49n, 0x04BD35ABn, 0xFEB0A7E4n, 0x03EFFBD2n];
const SHA_SCHED = [0xEB24BF9En, 0x1558691Fn, 0xA0C09EE2n, 0x0CFA32BAn, 0xA622EE8Cn, 0xD1DD9491n, 0xC0DD25A0n, 0xF9E70AB6n, 0xF0C31573n, 0x7058CE4En, 0x7188E606n, 0x00E5AB33n, 0xD258B060n, 0x72766564n];
const RC = [0x428A2F98n, 0x71374491n, 0xB5C0FBCFn, 0xE9B5DBA5n, 0x3956C25Bn, 0x59F111F1n, 0x923F82A4n, 0xAB1C5ED5n, 0xD807AA98n, 0x12835B01n, 0x243185BEn, 0x550C7DC3n, 0x72BE5D74n, 0x80DEB1FEn, 0x9BDC06A7n, 0xC19BF174n, 0xE49B69C1n, 0xEFBE4786n, 0x0FC19DC6n, 0x240CA1CCn, 0x2DE92C6Fn, 0x4A7484AAn, 0x5CB0A9DCn, 0x76F988DAn, 0x983E5152n, 0xA831C66Dn, 0xB00327C8n, 0xBF597FC7n, 0xC6E00BF3n, 0xD5A79147n, 0x06CA6351n, 0x14292967n, 0x27B70A85n, 0x2E1B2138n, 0x4D2C6DFCn, 0x53380D13n, 0x650A7354n, 0x766A0ABBn, 0x81C2C92En, 0x92722C85n, 0xA2BFE8A1n, 0xA81A664Bn, 0xC24B8B70n, 0xC76C51A3n, 0xD192E819n, 0xD6990624n, 0xF40E3585n, 0x106AA070n, 0x19A4C116n, 0x1E376C08n, 0x2748774Cn, 0x34B0BCB5n, 0x391C0CB3n, 0x4ED8AA4An, 0x5B9CCA4Fn, 0x682E6FF3n, 0x748F82EEn, 0x78A5636Fn, 0x84C87814n, 0x8CC70208n, 0x90BEFFFAn, 0xA4506CEBn, 0xBEF9A3F7n, 0xC67178F2n];
const CS64_COEF: Array<[bigint, bigint]> = [[0xE82E91B1n, 0xB32700D0n], [0x44DE24C6n, 0x88DFF51Dn], [0x3BEB65BCn, 0x29514038n], [0xC89C5933n, 0xB328CBDFn], [0x8D1EC211n, 0xD405B4D5n], [0x314EF5D5n, 0x26E55F3Cn], [0xE92491B1n, 0x607801C6n], [0xF0A5B9D5n, 0x82B2C1FBn], [0x06064CF3n, 0xFA51A3DAn], [0xDA79FA60n, 0x207CC464n], [0xBED20560n, 0x3C3C74F3n], [0x89F9C9F8n, 0xD2D14B61n], [0x35FA38C6n, 0xBB04A2C1n], [0xCB49E3C6n, 0xC5626167n]];
const SHA_ADJ = 0xC9DC06A7n;
const BLOCK_RC = [...RC.slice(0, 14), SHA_ADJ, ...RC.slice(15)];
const SIG0_ADJ = 0x059C0B80n;
const SIG1_ADJ = 0x000B92C0n;
const CS64_FACTOR = 0x82893933n;
const CS64_ADJ0 = 0xF2F90B1An;
const CS64_ADJ1 = 0x0B1A0000n;
const ROT = 0x100000001n;

const rol16 = (v: bigint) => { v &= M; return ((v << 16n) | (v >> 16n)) & M; };
const sigma0 = (v: bigint) => ((v >> 7n) ^ (v << 25n) ^ (v >> 18n) ^ (v << 14n) ^ (v >> 3n)) & M;
const sigma1 = (v: bigint) => ((v >> 17n) ^ (v << 15n) ^ (v >> 19n) ^ (v << 13n) ^ (v >> 10n)) & M;
const bigS1 = (e: bigint) => { const r = e * ROT; return (r >> 6n) ^ (r >> 11n) ^ (r >> 25n); };
const bigS0 = (a: bigint) => { const r = a * ROT; return (r >> 2n) ^ (r >> 13n) ^ (r >> 22n); };

function rounds(state: bigint[], w: bigint[], first = 0): bigint[] {
  let [a, b, c, d, e, f, g, h] = state;
  const k = first === 14 ? BLOCK_RC : RC;
  for (let i = first; i < 64; i++) {
    const t1 = h + bigS1(e) + (g ^ (e & (f ^ g))) + k[i] + w[i];
    const t2 = bigS0(a) + ((a & b) | (c & (a | b)));
    h = g; g = f; f = e; e = (d + t1) & M; d = c; c = b; b = a; a = (t1 + t2) & M;
  }
  return [a, b, c, d, e, f, g, h];
}
function expand(w: bigint[], first = 16) {
  for (let i = first; i < 64; i++) {
    const x = w[i - 2], y = w[i - 15];
    const s1 = (x >> 17n) ^ (x << 15n) ^ (x >> 19n) ^ (x << 13n) ^ (x >> 10n);
    const s0 = (y >> 7n) ^ (y << 25n) ^ (y >> 18n) ^ (y << 14n) ^ (y >> 3n);
    w.push((s1 + w[i - 7] + s0 + w[i - 16]) & M);
  }
}
const beInt = (b: Uint8Array) => b.reduce((acc, x) => (acc << 8n) | BigInt(x), 0n);
function shaInit(d7: Uint8Array): bigint[] {
  const w: bigint[] = [...Array(14).fill(0n), beInt(d7.slice(0, 3)), beInt(d7.slice(3, 7))];
  for (let i = 16; i < 30; i++) {
    let v = SHA_SCHED[i - 16];
    if (i - 2 >= 14) v += i === 16 ? (sigma1(w[i - 2]) ^ SIG1_ADJ) : sigma1(w[i - 2]);
    if (i - 7 >= 14) v += w[i - 7];
    if (i - 15 >= 14) v += i === 29 ? (sigma0(w[i - 15]) ^ SIG0_ADJ) : sigma0(w[i - 15]);
    w.push(v & M);
  }
  w.push((sigma1(w[28]) + w[23] + sigma0(w[15]) + w[14] + SHA_ADJ - RC[14]) & M);
  expand(w, 31);
  const work = rounds(SHA_STATE, w, 14);
  return SHA_INIT.map((x, i) => (x + work[i]) & M);
}
function shaDigest(data: Uint8Array): Uint8Array {
  const len = 57 + data.length;
  const padLen = (((55 - len) % 64) + 64) % 64;
  const rest = data.slice(7);
  const padded = new Uint8Array(rest.length + 1 + padLen + 8);
  padded.set(rest); padded[rest.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setBigUint64(padded.length - 8, BigInt(len * 8), false);
  let state = shaInit(data.slice(0, 7));
  for (let off = 0; off < padded.length; off += 64) {
    const w: bigint[] = [];
    for (let j = 0; j < 16; j++) w.push(BigInt(dv.getUint32(off + j * 4, false)));
    expand(w);
    const work = rounds(state, w);
    state = state.map((x, i) => (x + work[i]) & M);
  }
  const out = new Uint8Array(32); const ov = new DataView(out.buffer);
  state.forEach((x, i) => ov.setUint32(i * 4, Number(x), false));
  return out;
}
function cs64(data: Uint8Array, digest: Uint8Array): [bigint, bigint] {
  const dv = new DataView(digest.buffer, digest.byteOffset);
  const ka = BigInt(dv.getUint32(0, true)) | 1n, kb = BigInt(dv.getUint32(4, true)) | 1n;
  const fac = [(ka * CS64_FACTOR) & M, (kb * CS64_FACTOR) & M];
  const terms = CS64_COEF.map(([c], i) => (c * fac[i % 2]) & M);
  const offs = CS64_COEF.map(([, o]) => o);
  const src = new Uint8Array(1 + data.length); src.set(data, 1);
  const padded = new Uint8Array(Math.ceil(src.length / 4) * 4); padded.set(src);
  const pv = new DataView(padded.buffer);
  const words: bigint[] = [];
  for (let i = 0; i < padded.length; i += 4) words.push(BigInt(pv.getUint32(i, true)));
  if (words.length % 2) words.push(0n);
  words.forEach((word, i) => {
    let term = word * (i % 2 === 0 ? ka : kb);
    let off = rol16(word) * (i % 2 === 0 ? 0xEF0569FBn : 0xC31713DBn);
    if (i === 0) { term += CS64_ADJ0 * fac[0]; off += CS64_ADJ1; }
    terms.push(term & M); offs.push(off & M);
  });
  let swapAcc = 0n, swapLast = 0n, state = 0n, acc = 0n;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i], y = terms[i + 1];
    let t = rol16((offs[i] + x) & M);
    let q = (t * 0x76F50F34n) & M;
    swapAcc += (rol16(q) * 0xC3EFEA97n + q) & M;
    t = rol16((offs[i + 1] + y) & M);
    q = (t * 0x1881CE3Cn) & M;
    swapLast = (rol16(q) * 0x35BD1EC9n + q) & M;
    swapAcc = (swapAcc + swapLast) & M;
    state = (state * ka + x) & M;
    state = (rol16(state) * 0xCF98B111n) & M;
    state = (rol16(state) * 0x87085B9Fn) & M;
    state = (rol16(state) * 0x12CEB96Dn) & M;
    state = (rol16(state) * 0x257E1D83n) & M;
    acc += state;
    t = (state * kb + y) & M;
    t = (rol16(t) * 0xA27416F5n) & M;
    t = (rol16(t) * 0xD38396FFn) & M;
    state = (rol16((rol16(t) * 0x7C932B89n) & M) * 0xBFA49F69n) & M;
    acc = (acc + state) & M;
  }
  return [swapLast ^ state, swapAcc ^ acc];
}
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();

export function secMsGec(trustedToken: string, nowSec: number = Date.now() / 1000): string {
  let ticks = Math.floor(nowSec) + 11644473600;
  ticks -= ticks % 300;
  const data = new TextEncoder().encode(`${BigInt(ticks) * 10000000n}${trustedToken}`);
  const digest = shaDigest(data);
  const [c0, c1] = cs64(data, digest);
  const out = new Uint8Array(8); const ov = new DataView(out.buffer);
  ov.setUint32(0, Number(c0), true); ov.setUint32(4, Number(c1), true);
  return `${hex(out)}-${hex(digest)}`;
}
