// v71: modellbewusster Formulator – Framing first, christianlook-Wording, Preset-Negatives, Pose-Intensität, Check-JSON-Parser
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildImagePlan, assemblePrompt, mergeNegative, fitPrompt } from '../src/imgsvc-core.js';
import { FRAMING, MICRO_TAGS, normalizeIntensity, intensityDefaults, intensityPose } from '../src/imgsvc-formulate.js';
import { parseCheckJson, applyFixes } from '../src/imgsvc-checkparse.js';

const PROFILE = { id: 'p-adult', name: 'Ava', persona: { look: { age: 28, hair: 'long auburn hair' } }, photo: {}, seed: 12345 };
const RESOLVED = { identity: 'adult woman, looks about 28, long auburn hair, green eyes' };
const say = (content, role = 'assistant') => ({ role, content });
const plan = (body = {}, extra = {}) => buildImagePlan({ profile: PROFILE, resolved: RESOLVED, body: { profile: 'p-adult', ...body }, rnd: () => 0.4, ...extra });

test('v71: Framing steht zuerst und hält Gesicht + Kopf im Bild', async () => {
  const p = await plan({ adult: true, context: { messages: [say('Am Pool.')] } });
  assert.ok(p.prompt.startsWith('Framing: '), p.prompt.slice(0, 90));
  assert.match(p.prompt, /entire face and head in frame/);
  assert.match(p.negative, /cropped head/);
  // Nahaufnahme-Dropdown setzt den Ausschnitt, Framing bleibt Gesicht/Kopf
  const c = await plan({ adult: true, photoOverride: { frame: 'close-up shot' }, context: { messages: [say('Am Pool.')] } });
  assert.match(c.prompt, /close-up shot, entire head and face in frame/);
});

test('v71/v74: christianlook-Text hat sideboob/underboob/cameltoe, kein "opaque"; Piercings wandern in identity', () => {
  const src = fs.readFileSync(new URL('../apps/chat/photoopts.js', import.meta.url), 'utf8');
  const _c = src.match(/\['bikini', '([^']*)', '([^']*)', 1, '([^']*)'\]/);
  const m = _c && [`['christianlook', '${_c[1]}', '${_c[2]}', 1, '${_c[3]}']`];
  assert.ok(m, 'christianlook fehlt');
  const line = m[0].toLowerCase();
  for (const w of ['sideboob', 'underboob', 'cameltoe', 'smoked glass', 'tinted']) assert.ok(line.includes(w), w + ' fehlt');
  assert.ok(!/opaque/.test(line.split("', 1, '")[0]), 'opaque darf nur im Negativ stehen');
  assert.match(line, /large bikini, wide triangles, full coverage/);
  // v74: generisch – keine Character-Piercings mehr im Preset-Text
  const promptPart = line.split("', 1, '")[0];
  assert.ok(!/belly button piercing|christina piercing|nipple barbell piercings/.test(promptPart), promptPart);
});

test('v71: Preset-Negatives landen im Negative (dedupliziert)', () => {
  const out = mergeNegative('bad anatomy, bad anatomy', ['large bikini, wide triangles', 'cropped head, head out of frame'], 400);
  assert.ok(out.length <= 400);
  assert.equal((out.match(/bad anatomy/g) || []).length, 1);
  assert.match(out, /large bikini/); assert.match(out, /cropped head/);
});

test('v71: Intensität "stark" verändert die Pose und ergänzt Negative – nur adult', async () => {
  const msgs = [say('Sie steht am Fenster.')];
  const base = await plan({ adult: true, context: { messages: msgs } });
  const stark = await plan({ adult: true, photoOverride: { intensity: 'stark' }, context: { messages: msgs } });
  assert.match(stark.prompt, /boldly exhibitionistic/);
  assert.ok(!/boldly exhibitionistic/.test(base.prompt));
  assert.match(stark.negative, /shy, closed legs, crossed arms, covering body/);
  const safe = await plan({ adult: false, photoOverride: { intensity: 'stark' }, context: { messages: msgs } });
  assert.ok(!/boldly exhibitionistic/.test(safe.prompt), 'Intensität darf ohne adult nicht wirken');
  assert.ok(!/shy, closed legs/.test(safe.negative));
});

test('v71/v74: kein Namens-Fallback (lora-Voodoo entfernt); nur photo.intensity zählt', () => {
  const lora = { ...PROFILE, id: 'lora', name: 'Lora' };
  assert.equal(intensityDefaults({ profile: lora, body: { adult: true } }), '');
  assert.equal(intensityDefaults({ profile: lora, body: { adult: false } }), '');
  assert.equal(intensityDefaults({ profile: { photo: { intensity: 'stark' } }, body: { adult: true } }), 'stark');
  assert.equal(normalizeIntensity('Stark exhibitionistisch'), 'stark');
  assert.equal(intensityPose('', 'standing'), '');
});

test('v71: Check-JSON-Parser überlebt Fences und Prosa', () => {
  const ok = parseCheckJson('```json\n{"pass":false,"face_in_frame":false,"fix_hints":"zoom out, full body","fix_negative":"cropped head"}\n```');
  assert.equal(ok.pass, false); assert.equal(ok.face_in_frame, false);
  assert.match(ok.fix_hints, /zoom out/);
  assert.equal(parseCheckJson('no json here'), null);
  const prose = parseCheckJson('Sure! {"pass":true,"face_in_frame":true,"micro_bikini":true,"tint_ok":true,"pose_ok":true,"scene_ok":true,"anatomy_ok":true,"fix_hints":"","fix_negative":""}');
  assert.equal(prose.pass, true);
  const fixed = applyFixes('a photo', 'bad anatomy', { pass: false, fix_hints: 'full body, head in frame, zoom out', fix_negative: 'cropped head' });
  assert.match(fixed.prompt, /^(Framing:\s*)?full body shot/); // v75: Framing-Label erlaubt
  assert.match(fixed.negative, /cropped head/);
});

test('v71: Prioritäts-Truncation kürzt Background/Quality zuerst', () => {
  const parts = { scene: 'beach '.repeat(60), pose: 'standing', outfit: 'grey micro bikini', background: 'x'.repeat(2000) };
  const { prompt } = assemblePrompt(parts, { identity: 'adult woman, looks about 28, ' + 'green eyes, '.repeat(40) });
  assert.ok(prompt.length <= 2000, String(prompt.length));
  assert.match(prompt, /entire face and head in frame/);
  assert.match(prompt, /The woman:/);
  assert.match(prompt, /grey micro bikini/);
});

test('v71: Micro-Bikini-Tags enthalten die Kernwörter', () => {
  for (const w of ['micro bikini', 'sideboob', 'underboob', 'thong string bottom']) assert.ok(MICRO_TAGS.includes(w), w);
  assert.match(FRAMING, /entire face and head in frame/);
});

import { parseFocusJson } from '../src/imgsvc-checkparse.js';
test('v72 focus check: bodysuit fails with negatives, tiny bikini passes, empty → null', () => {
  const bad = parseFocusJson('```json\n{"eyes_visible":true,"top_of_head_visible":true,"garment":"bodysuit","triangles":"none","scene_ok":true}\n```');
  assert.equal(bad.pass, false); assert.match(bad.fix_negative, /bodysuit/);
  const ok = parseFocusJson('{"eyes_visible":true,"top_of_head_visible":true,"garment":"micro_bikini","triangles":"tiny","scene_ok":true}');
  assert.equal(ok.pass, true);
  const crop = parseFocusJson('{"eyes_visible":true,"top_of_head_visible":false,"garment":"micro_bikini","triangles":"tiny","scene_ok":true}');
  assert.equal(crop.pass, false); assert.match(crop.fix_hints, /entire face/);
  assert.equal(parseFocusJson(''), null);
});
test('v73/v74 top_worn fails only when the bikini is active; displaced top (nipples_covered=false) fails too', () => {
  const j = '{"eyes_visible":true,"top_of_head_visible":true,"garment":"micro_bikini","triangles":"tiny","top_worn":false,"scene_ok":true}';
  const a = parseFocusJson(j, true); assert.equal(a.pass, false); assert.match(a.fix_negative, /topless/);
  assert.equal(parseFocusJson('{"eyes_visible":true,"top_of_head_visible":true,"garment":"nude","triangles":"none","top_worn":false,"scene_ok":true}', false).pass, true);
  // v74: Top "sitzt" aber Nippel sichtbar → fail
  const displaced = parseFocusJson('{"eyes_visible":true,"top_of_head_visible":true,"garment":"bikini","triangles":"small","top_worn":true,"nipples_covered":false,"scene_ok":true}', true);
  assert.equal(displaced.pass, false);
  assert.match(displaced.fix_negative, /exposed nipple/);
});
