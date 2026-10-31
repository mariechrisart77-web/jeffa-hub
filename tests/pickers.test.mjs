import test from 'node:test';
import assert from 'node:assert/strict';
import { matchHair, matchOne, matchMulti, matchScale, hairText, GROESSE, STATUR, TYP, STYLE } from '../apps/chat/pickers.js';

test('hair round-trips exactly or is kept as own text', () => {
  assert.deepEqual(matchHair('lange blonde Haare'), { col: 'blond', len: 'lange', exact: true });
  assert.equal(hairText('lange', 'blond'), 'lange blonde Haare');
  const m = matchHair('lange gewellte blonde Haare');
  assert.equal(m.col, 'blond'); assert.equal(m.exact, false);
  assert.equal(matchHair('').exact, true);
});
test('scales map old free text to closest step', () => {
  assert.deepEqual(matchScale(GROESSE, 'mittelgroß'), { idx: 3, exact: true });
  assert.deepEqual(matchScale(STATUR, 'schlank, athletisch'), { idx: 2, exact: false });
  assert.deepEqual(matchScale(GROESSE, ''), { idx: 0, exact: true });
});
test('chips: typ and style', () => {
  assert.deepEqual(matchOne(TYP, 'frau'), { val: 'Frau', exact: true });
  assert.equal(matchOne(TYP, 'junge Frau').exact, false);
  assert.deepEqual(matchMulti(STYLE, 'elegant, sportlich'), { vals: ['elegant', 'sportlich'], exact: true });
});
