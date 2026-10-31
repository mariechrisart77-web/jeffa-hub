import test from 'node:test';
import assert from 'node:assert/strict';
import { bmi, bmiClass, cupLetter, bustText, figureParts, BUST_EN, HIPS_EN, BUST_CALIBRATION } from '../apps/shared/figure.js';

test('bmi grundwerte', () => {
  assert.equal(bmi(168, 55), 19.5);
  assert.equal(bmi(0, 0), null);
  assert.equal(bmi(168, null), null);
});

test('bmiClass grenzen', () => {
  assert.equal(bmiClass(18.4).en, 'very slim, slender build');
  assert.equal(bmiClass(18.5).en, 'slim build');
  assert.equal(bmiClass(21.9).en, 'slim build');
  assert.equal(bmiClass(22).en, 'average build');
  assert.equal(bmiClass(24.9).en, 'average build');
  assert.equal(bmiClass(25).en, 'soft, full-figured build');
  assert.equal(bmiClass(29.9).en, 'soft, full-figured build');
  assert.equal(bmiClass(30).en, 'plus-size build');
});

test('cupLetter', () => {
  assert.equal(cupLetter(1), 'A');
  assert.equal(cupLetter(2), 'B');
  assert.equal(cupLetter(7), 'G');
});

test('figureParts alt = bisheriger Output', () => {
  assert.deepEqual(figureParts({ groesse: '168 cm', statur: 'schlank', kurven: 5, oberweite: 3 }),
    ['168 cm tall', 'a slim build', HIPS_EN[5], BUST_EN[3]]);
  assert.deepEqual(figureParts({ groesse: '160 cm', statur: '', kurven: 3, oberweite: 2 }),
    ['160 cm tall', HIPS_EN[3], BUST_EN[2]]);
  assert.deepEqual(figureParts({ groesse: '', statur: 'zierlich', kurven: 8, oberweite: 5 }),
    ['a petite delicate build', HIPS_EN[8], BUST_EN[5]]);
});

test('figureParts mit Gewicht ergänzt BMI-Baustein', () => {
  const p = figureParts({ groesse: '168 cm', statur: 'schlank', kurven: 5, oberweite: 3, gewichtKg: 55 });
  assert.equal(p[2], 'slim build');
  assert.deepEqual(p, ['168 cm tall', 'a slim build', 'slim build', HIPS_EN[5], BUST_EN[3]]);
});

test('bustText ohne Unterbrust = BUST_EN', () => {
  assert.equal(bustText({ oberweite: 3 }), BUST_EN[3]);
  assert.equal(bustText({ oberweite: 3, model: 'chroma' }), BUST_EN[3]);
});

test('bustText mit Unterbrust 70A', () => {
  const t = bustText({ oberweite: 1, unterbrustCm: 70 });
  assert.ok(t.includes('70A'), t);
  assert.ok(!/medium|full|large/i.test(t), t);
});

test('kalibrier offset -1 bei B formuliert wie A', () => {
  const orig = BUST_CALIBRATION.chroma;
  BUST_CALIBRATION.chroma = -1;
  try {
    const t = bustText({ oberweite: 2, model: 'chroma' });
    assert.equal(t, BUST_EN[1]);
  } finally { BUST_CALIBRATION.chroma = orig; }
  assert.equal(BUST_CALIBRATION.chroma, 0);
});
