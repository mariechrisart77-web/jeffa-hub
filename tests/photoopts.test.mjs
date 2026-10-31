import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
// photoopts.js imports ./shared/fsk.js (copied at build) -> load it from a temp dir with a stub
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'po-')); fs.mkdirSync(d + '/shared');
fs.writeFileSync(d + '/shared/fsk.js', 'export const isAdult = () => false;');
fs.copyFileSync(new URL('../apps/shared/scenes.js', import.meta.url), d + '/shared/scenes.js'); // v85: zentrale Szenenliste
fs.copyFileSync(new URL('../apps/chat/photoopts.js', import.meta.url), d + '/photoopts.js');
const m = await import(d + '/photoopts.js');
test('Frei leaves everything to the scene', () => { assert.deepEqual(Object.values(m.photoFragments({ photo: {} }, true)).filter(Boolean), []); });
test('environment sets default clothing and pose when Frei', () => {
  const f = m.photoFragments({ photo: { scene: 'betonwand' } }, true);
  assert.match(f.outfit, /bikini/); assert.match(f.pose, /wall/);
  const g = m.photoFragments({ photo: { scene: 'betonwand', pose: 'kniend' } }, true); assert.match(g.pose, /kneeling/);
});
test('FSK18-only options are ignored and hidden in standard mode', () => {
  const f = m.photoFragments({ photo: { scene: 'betonwand', outfit: 'nackt' } }, false);
  assert.equal(f.outfit, ''); assert.equal(f.scene, '');
  const h = m.optionsHtml('outfit', '', false); assert.ok(!h.includes('nackt') && !h.includes('Latex'));
  assert.ok(m.optionsHtml('outfit', '', true).includes('<optgroup'));
});
test('auto photo', () => {
  assert.equal(m.autoPhoto({}), null); assert.equal(m.autoPhoto({ photo: { auto: 'immer' } }), true);
  assert.equal(m.autoPhoto({ photo: { auto: 'zufall', rate: 'selten' } }, 0.2), false);
  assert.equal(m.autoPhoto({ photo: { auto: 'zufall', rate: 'oft' } }, 0.2), true);
});
test('Knappheit slider 1-10: deterministic graded wording, FSK18 only, synced via profile.photo', () => {
  assert.equal(m.knappFragment(1, true), ''); assert.equal(m.knappFragment(undefined, true), '');
  assert.match(m.knappFragment(10, true), /extremely tiny micro bikini top.*sideboob and underboob/);
  assert.match(m.knappFragment(8, true), /micro bikini top showing sideboob and underboob/);
  assert.equal(m.knappFragment(10, false), ''); assert.equal(m.knappFragment(99, true), m.knappFragment(10, true));
  for (let n = 2; n <= 10; n++) assert.notEqual(m.knappFragment(n, true), m.knappFragment(n - 1, true));
  assert.equal(m.knappFragment(6, true), m.knappFragment(6, true));
  assert.match(m.photoFragments({ photo: { knapp: 8 } }, true).outfit, /sideboob and underboob/);
  assert.equal(m.photoFragments({ photo: { knapp: 8 } }, false).outfit, '');
});
test('AP6 Bildstil/Licht/Ausschnitt presets: fixed piece, Standard adds nothing', () => {
  assert.match(m.photoFragments({ photo: { render: 'noir' } }, false).render, /film noir/);
  assert.match(m.photoFragments({ photo: { light: 'tag' } }, false).light, /daylight/);
  assert.match(m.photoFragments({ photo: { frame: 'oben' } }, false).frame, /bird/);
  assert.equal(m.photoFragments({ photo: {} }, false).render, '');
});
