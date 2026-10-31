import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { mergeStyles, cleanStyles } from '../apps/shared/styles-sync.js';
import { makeKey, KEY_RE, signUrl, verifySig, storeGenerated } from '../src/r2img.js';

const d = fs.mkdtempSync(path.join(os.tmpdir(), 'v26-')); fs.mkdirSync(d + '/shared');
fs.writeFileSync(d + '/shared/fsk.js', 'export const isAdult = () => false;');
fs.copyFileSync(new URL('../apps/chat/photoopts.js', import.meta.url), d + '/photoopts.js');
const po = await import(d + '/photoopts.js');
const prof = (o = {}) => ({ looks: { kleidung: 'k2', pose: 'frei', umgebung: 'frei', presets: { kleidung: [{ id: 'k1', label: 'A', prompt: 'adult text', adult: true }, { id: 'k2', label: 'Abendkleid', prompt: 'evening dress' }], pose: [{ id: 'p1', label: 'Stehend', prompt: 'standing' }], umgebung: [] } }, photo: o });

test('Meine Presets: own presets selectable in the photo group, adult ones hidden outside FSK18', () => {
  const h = po.optionsHtml('outfit', '', false, (s) => s, prof());
  assert.match(h, /<optgroup label="Meine Presets">/); assert.match(h, /value="my:k2"/); assert.doesNotMatch(h, /my:k1/);
  assert.match(h, /Wie bisher: Abendkleid/);
  assert.doesNotMatch(po.optionsHtml('light', '', false, (s) => s, prof()), /Meine Presets/);
});
test('Meine Presets: chosen my: value resolves to the stored prompt unchanged', () => {
  assert.equal(po.photoFragments(prof({ outfit: 'my:k2', pose: 'my:p1' }), false).outfit, 'evening dress');
  assert.equal(po.photoFragments(prof({ pose: 'my:p1' }), false).pose, 'standing');
  assert.equal(po.photoFragments(prof({ outfit: 'my:k1' }), false).outfit, '');
  assert.equal(po.photoFragments(prof({ outfit: 'my:nope' }), false).outfit, '');
});
test('styles sync: local text wins, server-only added, junk dropped', () => {
  const m = mergeStyles([{ id: 'a', label: 'L', prompt: 'local' }], [{ id: 'a', label: 'S', prompt: 'server' }, { id: 'b', label: 'B', prompt: 'x' }]);
  assert.deepEqual(m.map((s) => s.prompt), ['local', 'x']);
  assert.equal(cleanStyles('x'), null);
  const c = cleanStyles([{ id: 'ok', label: 'Mein Stil', prompt: 'exact  text\n' }, { id: 'bad id!' }, { id: 'ok' }]);
  assert.equal(c.length, 1); assert.equal(c[0].prompt, 'exact  text\n');
});
test('r2: keys, signatures, store + failure fallback', async () => {
  const k = makeKey('seraphina', 'image/webp', new Date('2026-10-30T00:00:00Z'), '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(k, 'gen/202610/seraphina/123e4567-e89b-12d3-a456-426614174000.webp'); assert.ok(KEY_RE.test(k));
  assert.ok(!KEY_RE.test('gen/../x')); assert.ok(KEY_RE.test(makeKey('../evil')));
  const url = await signUrl('s3cret', k, 2000000000); const u = new URL(url, 'https://x');
  assert.ok(await verifySig('s3cret', k, u.searchParams.get('exp'), u.searchParams.get('sig'), 1));
  assert.ok(!(await verifySig('other', k, u.searchParams.get('exp'), u.searchParams.get('sig'), 1)));
  assert.ok(!(await verifySig('s3cret', k, '1000', u.searchParams.get('sig'), 2000)));
  const puts = []; const env = { VAULT_SECRET: 's3cret', IMAGES: { put: async (key, b) => puts.push([key, b.length]) } };
  const r = await storeGenerated(env, btoa('abc'), { profile: 'seraphina' });
  assert.equal(puts.length, 1); assert.equal(puts[0][1], 3); assert.match(r.url, /^\/api\/img\/gen\/.*sig=/);
  assert.equal(await storeGenerated({ IMAGES: { put: async () => { throw new Error('down'); } } }, btoa('abc')), null);
  assert.equal(await storeGenerated({}, btoa('abc')), null);
});
