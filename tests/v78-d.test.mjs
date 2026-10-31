import test from 'node:test';
import assert from 'node:assert/strict';
import { sliderTerm, personaChatText, stylePrompt, SLIDER_TERMS } from '../apps/shared/persona-terms.js';
test('v78 D3: Stufen-Begriffe, je weiter desto stärker; nur adult im Chat', () => {
  for (const [id, t] of Object.entries(SLIDER_TERMS)) { assert.equal(t.L.length, 5, id); assert.equal(t.R.length, 5, id); }
  assert.equal(sliderTerm('g1', 0), '');
  assert.equal(sliderTerm('g1', 5, 'en'), 'uninhibited, openly polyamorous');
  assert.notEqual(sliderTerm('g1', 1), sliderTerm('g1', 4));
  const p = { gegensaetze: [{ id: 'g2', value: -3 }], temperament: [{ id: 't1', value: 2 }] };
  assert.match(personaChatText(p, true), /passionate.*traditional/);
  assert.equal(personaChatText(p, false), '');
});
test('v78 D5: Stil-Mini-Prompts, Eigener Stil bleibt Text', () => {
  assert.match(stylePrompt('Elegant'), /elegant refined/);
  assert.equal(stylePrompt('Boho mit Leder'), 'Boho mit Leder');
});
