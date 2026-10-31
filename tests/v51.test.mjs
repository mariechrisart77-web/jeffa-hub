import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execSync } from 'node:child_process';

const d = fs.mkdtempSync(path.join(os.tmpdir(), 'v51-')); fs.mkdirSync(d + '/shared');
fs.writeFileSync(d + '/shared/fsk.js', 'export const isAdult = () => true;');
fs.copyFileSync(new URL('../apps/shared/scenes.js', import.meta.url), d + '/shared/scenes.js'); // v85: zentrale Szenenliste
fs.copyFileSync(new URL('../apps/chat/photoopts.js', import.meta.url), d + '/photoopts.js');
const po = await import(d + '/photoopts.js');
const ids = (adult) => po.CATALOG.outfit.flatMap(([, o]) => o).filter(x => !x[3] || adult).map(x => x[0]);

test('v51 Kleidung: old ids stay valid, max 1 built-in bikini, headings present', () => {
  for (const id of ['bikini', 'latex', 'bademantel', 'badeanzug', 'nackt']) assert.ok(ids(true).includes(id), id);
  const bik = po.CATALOG.outfit.flatMap(([, o]) => o).filter(x => /bikini/i.test(x[1] + x[2]));
  assert.ok(bik.length <= 2, 'bikini count ' + bik.length);
  for (const g of ['Sommer', 'Gemütlich', 'Dessous (18+)', 'Latex & Leder (18+)', 'Verspielt (18+)']) assert.ok(po.CATALOG.outfit.some(([l]) => l.includes(g)), g);
  for (const id of ['lingerie', 'body', 'netz', 'catsuit', 'hemdoffen', 'handtuch', 'negligee', 'strapse', 'harness', 'nassshirt', 'yogaset', 'kimono']) assert.ok(ids(true).includes(id), id);
  assert.equal(new Set(ids(true)).size, ids(true).length, 'unique ids');
});
test('v51 Kleidung: 18+ options hidden outside FSK18, deterministic prompts', () => {
  const h = po.optionsHtml('outfit', '', false, (s) => s, null);
  assert.doesNotMatch(h, /catsuit|lingerie|Dessous/); assert.match(h, /bademantel/);
  const p = { photo: { outfit: 'catsuit' } };
  assert.equal(po.photoFragments(p, true).outfit.startsWith('full-length glossy black latex catsuit'), true);
  assert.equal(po.photoFragments(p, false).outfit, '');
});
test('v51 own presets k1/k5/k6 untouched', () => {
  const s = readFileSync('apps/chat/profiles.js', 'utf8');
  assert.match(s, /\{ id: 'k6', label: 'Rauchglas-Latex Micro', prompt: RAUCHGLAS_MICRO, adult: true \}/);
  assert.match(execSync('git diff HEAD -- apps/chat/profiles.js').toString(), /^(?![-+].*id: 'k[156]')/s);
  assert.doesNotMatch(execSync('git diff HEAD -- apps/chat/profiles.js').toString(), /^[-+].*id: 'k[156]'/m);
});
test('v51 photo sheet link toggle + one-off override to /api/image', () => {
  const c = readFileSync('apps/chat/chat.js', 'utf8') + readFileSync('apps/chat/chat-photo.js', 'utf8') + // v85: chat.js aufgeteilt
     readFileSync('apps/chat/image-client.js', 'utf8'); // v68: Bildcode in image-client.js
  assert.match(c, /🔗 Mit Profil verbunden/);
  assert.match(c, /jeffa\.photoLinked'\) !== '0'/); // default on
  assert.match(c, /photoOverride: once \? frag : undefined/);
  assert.match(c, /photoOnce\.delete\(profP\.id\)/); // only the next photo
  const s = readFileSync('src/imgsvc-image.ts', 'utf8') + readFileSync('src/imgsvc-plan.js', 'utf8');
  assert.match(s, /body\.photoOverride/);
  assert.match(readFileSync('apps/chat/profiles.js', 'utf8'), /jeffa:profile-updated/);
  assert.match(readFileSync('apps/chat/look.js', 'utf8'), /jeffa:profile-updated/);
});
test('v51 errors: no anonymous 500 for memory / Face ID', () => {
  const m = readFileSync('functions/_middleware.ts', 'utf8');
  assert.match(m, /Interner Serverfehler\$\{where/);
  assert.doesNotMatch(readFileSync('src/webauthn.ts', 'utf8'), /throw new Error\('(?!KV required)/);
  assert.match(readFileSync('functions/api/memory/[[route]].ts', 'utf8'), /d1_error/);
  assert.match(readFileSync('functions/api/auth/[[route]].ts', 'utf8'), /webauthn_parse/);
  const st = readFileSync('apps/hub/settings.js', 'utf8');
  assert.doesNotMatch(st, /<option value="">Alle Profile/);
  assert.match(st, /function errText/);
});
test('v51 CBOR decodes arrays, tags and 32-bit ints', async () => {
  const src = readFileSync('src/cbor.ts', 'utf8').replace(/: Uint8Array/g, '').replace(/\): any/g, ')').replace(/: any\[\]/g, '').replace(/: any/g, '').replace(/minor: number\)/g, 'minor)').replace(/\): number/g, ')');
  const f = d + '/cbor.mjs'; fs.writeFileSync(f, src);
  const { decodeCBOR } = await import(f);
  assert.deepEqual(decodeCBOR(new Uint8Array([0x82, 0x01, 0x20])), [1, -1]);
  assert.equal(decodeCBOR(new Uint8Array([0xc1, 0x05])), 5);
  assert.equal(decodeCBOR(new Uint8Array([0x1a, 0xff, 0xff, 0xff, 0xff])), 4294967295);
});
test('v51 compact header: tabs inside the header bar, safe areas, sw bump', () => {
  const h = readFileSync('apps/hub/index.html', 'utf8');
  const hdr = h.slice(h.indexOf('<header'), h.indexOf('</header>'));
  assert.match(hdr, /<nav class="tabs-nav">/); assert.equal((hdr.match(/class="tab-btn/g) || []).length, 9);
  const css = readFileSync('apps/hub/app.css', 'utf8');
  assert.match(css, /v51: one slim header bar[\s\S]*safe-area-inset-top[\s\S]*safe-area-inset-left/);
  assert.match(readFileSync('apps/hub/sw.js', 'utf8'), /jeffa-v([5-9]\d|\d{3})/);
});
