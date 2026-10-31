import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const pk = await import('../dist/hub/pickers.js');
const src = (f) => fs.readFileSync(new URL('../apps/chat/' + f, import.meta.url), 'utf8');
test('sliders show German words, not numbers', () => {
  const n = pk.scaleNames('Kühl', 'Warm'); assert.equal(n.length, 10); assert.equal(n[0], 'Sehr kühl'); assert.equal(n[9], 'Sehr warm');
  assert.ok(n.every(x => !/\d/.test(x)));
  assert.equal(pk.bipolarName(0, 'scheu', 'frech'), 'neutral'); assert.equal(pk.bipolarName(5, 'scheu', 'frech'), 'sehr frech'); assert.equal(pk.bipolarName(-2, 'scheu', 'frech'), 'leicht scheu');
  assert.equal(pk.voiceName(1, 'rate'), 'normal'); assert.equal(pk.voiceName(2, 'pitch'), 'sehr hoch');
  assert.match(pk.slider('x', 'Wärme', 1, 10, 3, 'Kühl', 'Warm', n), /Kühl<\/b>|Kühl/);
});
test('Knappheit labels: 10 German steps from Normal to Micro', () => {
  const s = src('photoopts.js'); assert.match(s, /KNAPP_LABELS = \['Normal.*'Micro, maximal knapp, viel Sideboob und Underboob – Brustwarzen und Klitoris werden nicht mal mehr ganz verdeckt'\]/);
  assert.match(src('chat.js'), /KNAPP_LABELS\[/);
});
test('bust = cup sizes A..G with fixed wording', () => {
  const p = src('profiles.js'); assert.match(p, /BUST_EN = \['small A-cup bust'.*'huge G-cup bust'\]/);
  assert.match(src('persona.js'), /'A-Körbchen'.*'G-Körbchen'/);
});
test('Vorlieben: adult options only in FSK18, fewer everyday entries', () => {
  const s = src('persona.js');
  assert.doesNotMatch(s.match(/export const VORLIEBEN = \[[^\]]*\]/)[0], /Kochen|Sport|Lesen|Kunst/);
  assert.match(s, /adult \|\| !ADULT_VORLIEBEN\.includes\(v\)/);
});
import { ARCHETYPES, archetypeText, cleanArchetypes, conflictsWith, VANILLA } from '../apps/chat/archetypes.js';
test('FSK18 Typ-Pakete: a few bundles, max 2, fixed text, hidden in Standard', () => {
  assert.ok(ARCHETYPES.length >= 4 && ARCHETYPES.length <= 8);
  assert.ok(ARCHETYPES.every(a => a.name && a.tag && /einvernehmlich/.test(a.piece) && /Erwachsene/.test(a.piece)));
  assert.match(archetypeText(['showgirl'], true), /Exhibitionistin.*Swinger/);
  assert.match(archetypeText(['mama'], true), /Laktation/);
  assert.equal(archetypeText(['showgirl'], false), '');
  assert.equal(archetypeText(['showgirl', 'mama', 'tease'], true).split('Erwachsene').length - 1, 2);
  assert.deepEqual(cleanArchetypes(['domina', 'sub']), ['domina']); assert.ok(conflictsWith('sub').includes('domina'));
  assert.equal(archetypeText([], true), VANILLA.piece); assert.match(VANILLA.name, /Vanilla/);
  assert.match(src('persona.js'), /adult \? `<div class="pe-sec"><h4>Typ-Paket/);
});

import { routeModel as rm46 } from '../src/imgsvc-core.js';
test('v46 AP5: FSK18 always chroma', () => {
  for (const o of [{ quality: 'qualitaet' }, { quality: 'mittel' }, { style: 'comic' }, { refMode: 'edit', hasRef: true }]) assert.equal(rm46({ ...o, adult: true }).model, 'chroma');
  assert.equal(rm46({ quality: 'qualitaet' }).model, 'qwen-image-3');
});
