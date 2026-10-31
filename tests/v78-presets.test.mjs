// v78: Paket-Presets – Streichliste, LEGACY-Migration, Szenen-Tageszeit, Einteiler-Regel, Non-Adult-Filter.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'v78p-')); fs.mkdirSync(d + '/shared');
fs.writeFileSync(d + '/shared/fsk.js', 'export const isAdult = () => true;');
fs.copyFileSync(new URL('../apps/shared/scenes.js', import.meta.url), d + '/shared/scenes.js'); // v85: zentrale Szenenliste
fs.copyFileSync(new URL('../apps/chat/photoopts.js', import.meta.url), d + '/photoopts.js');
const { CATALOG, LEGACY_IDS, LEGACY_PROMPTS, SCENE_TIME, photoFragments, optionsHtml } = await import(d + '/photoopts.js');

const REMOVED = ['sport', 'jogging', 'sommer', 'shorts', 'strick', 'jeanspulli', 'office', 'cocktail', 'abendkleid', 'hemd', 'christianlook'];
const allIds = (adult) => Object.values(CATALOG).flatMap((grp) => grp.flatMap(([, opts]) => opts.map((o) => o[0]).filter((id) => id !== '')));
const ids = (k, adult = true) => CATALOG[k].flatMap(([, opts]) => opts.filter((o) => !o[3] || adult).map((o) => o[0]));

test('v78: gestrichene ids sind nicht mehr im Katalog', () => {
  const all = allIds(true);
  for (const id of REMOVED) assert.ok(!all.includes(id), id);
});

test('v78: jede Option hat einen EN-Prompt (außer den leeren Standard-Einträgen)', () => {
  for (const [k, grp] of Object.entries(CATALOG)) for (const [, opts] of grp) for (const o of opts) {
    if (o[0] === '') continue;
    assert.equal(typeof o[2], 'string', `${k}/${o[0]}`);
  }
});

test('v78: keine doppelten Prompts innerhalb einer Kategorie', () => {
  for (const [k, grp] of Object.entries(CATALOG)) {
    const seen = new Set();
    for (const [, opts] of grp) for (const o of opts) {
      if (!o[2]) continue;
      assert.ok(!seen.has(o[2]), `${k}: doppelter Prompt ${o[0]}`);
      seen.add(o[2]);
    }
  }
});

test('v78: LEGACY_IDS mappen alte ids korrekt', () => {
  assert.equal(LEGACY_IDS.hemd, 'hemdoffen');
  for (const id of ['sport', 'jogging', 'sommer', 'shorts', 'strick', 'jeanspulli', 'office', 'cocktail', 'abendkleid']) assert.equal(LEGACY_IDS[id], '', id);
});

test('v78: alte gespeicherte ids funktionieren via Migration weiter', () => {
  assert.equal(photoFragments({ photo: { outfit: 'hemd' } }, true).outfit, 'oversized men\'s shirt worn open, nothing else visible underneath');
  assert.equal(photoFragments({ photo: { outfit: 'sommer' } }, true).outfit, '');
  assert.match(photoFragments({ photo: { light: 'tag' } }, true).light, /daylight/);
});

test('v78: christianlook bleibt für gespeicherte Profile wirksam (nur adult)', () => {
  const p = { photo: { outfit: 'christianlook' } };
  const a = photoFragments(p, true);
  assert.match(a.outfit, /Wicked Weasel/);
  assert.equal(photoFragments(p, false).outfit, '');
  assert.match(a.neg_outfit, /opaque/);
  const h = optionsHtml('outfit', 'christianlook', true, (s) => s, null);
  assert.match(h, /value="bikini" selected>Grauer Latex-Micro-Bikini \(Christians Look\)/);
  assert.equal((h.match(/Latex-Mi[ck]ro/g) || []).length, 1);
  const prof = { looks: { presets: { kleidung: [{ id: 'x1', label: 'Rauchgrauer Latex-Micro-Bikini', prompt: 'old' }, { id: 'x2', label: 'Rotes Kleid', prompt: 'red dress' }] } }, photo: { outfit: 'my:x1' } };
  const h2 = optionsHtml('outfit', 'my:x1', true, (s) => s, prof);
  assert.ok(!h2.includes('Rauchgrauer Latex-Micro') && h2.includes('Rotes Kleid') && /value="bikini" selected/.test(h2));
  assert.match(photoFragments(prof, true).outfit, /Wicked Weasel/);
});

test('v78: non-adult liefert nie adultOnly-Prompts (auch nicht via Migration/Legacy)', () => {
  const p = { photo: { outfit: 'hemdoffen', pose: 'o_bett', scene: 'betonwand', intensity: 'stark' } };
  const out = photoFragments(p, false);
  for (const k of Object.keys(out)) if (k !== 'negative') assert.doesNotMatch(String(out[k]), /open, nothing else|legs spread|exhibitionistic/, k);
  assert.equal(photoFragments({ photo: { outfit: 'christianlook' } }, false).outfit, '');
});

test('v78: Szenen-Tageszeit wird nur bei time/Default angehängt', () => {
  assert.equal(SCENE_TIME.tag, 'daylight');
  const base = photoFragments({ photo: { scene: 'hotel' } }, true).scene;
  assert.equal(base, 'luxury hotel room with floor-to-ceiling windows and a city skyline view');
  assert.equal(photoFragments({ photo: { scene: 'hotel', time: 'abend' } }, true).scene, `${base}, evening, warm dim light`);
  assert.match(photoFragments({ photo: { scene: 'parkplatz' } }, true).scene, /, night, artificial light$/);
});

test('v78: Einteiler-Regel – Zweiteiler erhält Trenn-Tags, maximal einmal', () => {
  const o = photoFragments({ photo: { outfit: 'bikini' } }, true).outfit;
  assert.match(o, /separate top and bottom, visible waistline/);
  assert.equal(o.match(/separate top and bottom/g).length, 1);
  assert.equal(photoFragments({ photo: { outfit: 'badeanzug' } }, true).outfit, 'elegant high-cut one-piece swimsuit');
});

test('v78: kombinierter Outfit-Prompt ≤ 1000 Zeichen (Wicked-Weasel-Text)', () => {
  const o = photoFragments({ photo: { outfit: 'bikini', koerper: 'piercings1', knapp: 10, intensity: 'stark' } }, true).outfit;
  assert.ok(o.length <= 1000, `${o.length}`);
});
