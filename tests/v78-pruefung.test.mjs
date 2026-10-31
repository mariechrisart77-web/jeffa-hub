import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSpecVision, classifyVerdict } from '../src/imgsvc-checkparse.js';
const spec = { framing: 'full', garment: { kind: 'latex', label: 'grey sheer latex top', topRequired: true }, scene: 'beach' };
// Fixtures: gespeicherte Check-Antworten
const FX = {
  sheerTop: '{"eyes_visible":true,"top_of_head_visible":true,"garment":"latex","top_worn":false,"bottom_worn":true,"nipples_covered":true,"scene_ok":true,"extra_people":false}',
  extraPerson: '{"eyes_visible":true,"top_of_head_visible":true,"garment":"latex","top_worn":true,"bottom_worn":true,"scene_ok":true,"extra_people":true}',
  wrongScene: '```json\n{"eyes_visible":true,"top_of_head_visible":true,"garment":"latex","top_worn":true,"bottom_worn":true,"scene_ok":false}\n```',
  ok: '{"eyes_visible":true,"top_of_head_visible":true,"garment":"latex","top_worn":true,"bottom_worn":true,"scene_ok":true}',
  noFace: '{"eyes_visible":false,"top_of_head_visible":false,"garment":"latex","top_worn":true,"bottom_worn":true,"scene_ok":true}',
};
test('Kleidungsdetail (Top fehlt bei sheer) → kein Retry', () => {
  const v = parseSpecVision(FX.sheerTop, spec);
  assert.equal(v.pass, false);
  const c = classifyVerdict(v);
  assert.deepEqual(c.reasons, ['garment']); assert.equal(c.hard, false);
});
test('CHECK_SHEER_OK: sheer Top zählt als getragen (nur mit Flag)', () => {
  assert.equal(parseSpecVision(FX.sheerTop, spec, { sheerOk: true }).pass, true);
  assert.equal(parseSpecVision(FX.sheerTop, { ...spec, garment: { kind: 'bikini', label: 'red bikini', topRequired: true } }, { sheerOk: true }).pass, false);
});
test('harte Fehler → Retry', () => {
  assert.deepEqual(classifyVerdict(parseSpecVision(FX.extraPerson, spec)), { reasons: ['person'], hard: true });
  assert.deepEqual(classifyVerdict(parseSpecVision(FX.wrongScene, spec)), { reasons: ['scene'], hard: true });
  assert.equal(classifyVerdict(parseSpecVision(FX.noFace, spec)).hard, true);
  assert.equal(classifyVerdict({ pass: false, minor_risk: true }).hard, true);
});
test('Retry-Quote über Fixtures messbar', () => {
  const vs = Object.values(FX).map((t) => parseSpecVision(t, spec));
  const retries = vs.filter((v) => classifyVerdict(v).hard).length;
  const fails = vs.filter((v) => !v.pass).length;
  assert.equal(fails, 4); assert.equal(retries, 3); // vorher 4 Retries, jetzt 3
  assert.deepEqual(classifyVerdict(parseSpecVision(FX.ok, spec)), { reasons: [], hard: false });
});
