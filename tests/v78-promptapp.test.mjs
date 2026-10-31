import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectOf, buildIdentity } from '../src/promptapp/identity.js';
import { detectTimeOfDay, detectPoseDetails } from '../src/promptapp/scene-time.js';

// Male
const maleProfile = { id: 'm1', name: 'Max', persona: { gender: 'male', look: { typ: 'Mann', age: 32, hair: 'short dark hair', eyes: 'blue' } } };
const femaleProfile = { id: 'f1', name: 'Lena', persona: { look: { typ: 'Frau', age: 32, hair: 'long blonde hair', eyes: 'green' } } };

test('male: subjectOf liefert "The man" und "adult man"', () => {
  const s = subjectOf(maleProfile);
  assert.equal(s.label, 'The man');
  assert.equal(s.noun, 'adult man');
});

test('female: subjectOf liefert "The woman"', () => {
  const s = subjectOf(femaleProfile);
  assert.equal(s.label, 'The woman');
  assert.equal(s.noun, 'adult woman');
});

test('male: buildIdentity nutzt "adult man" + "looks exactly 32 years old"', () => {
  const r = buildIdentity({ profile: maleProfile });
  assert.match(r.identity, /^adult man, looks exactly 32 years old/);
});

test('Alter 17 → 18 (v84), 19 bleibt 19', () => {
  const r = buildIdentity({ profile: { persona: { look: { age: 17 } } } });
  assert.match(r.identity, /looks exactly 18 years old/);
  assert.match(buildIdentity({ profile: { persona: { look: { age: 19 } } } }).identity, /looks exactly 19 years old/);
});

test('scene-time: abends → evening', () => {
  assert.equal(detectTimeOfDay('Parkdeck abends'), 'evening');
  assert.equal(detectTimeOfDay('nachts am Strand'), 'night');
  assert.equal(detectTimeOfDay('morgens im Bad'), 'morning');
});

test('scene-time: Pose-Details Tür/Bein', () => {
  const p = detectPoseDetails('Tür offen, ein Bein draußen');
  assert.ok(p.includes('car door wide open'), 'door fehlt: ' + p.join('|'));
  assert.ok(p.includes('one leg outside on the ground'), 'leg fehlt: ' + p.join('|'));
});

test('v78 composer cache: gleicher Input ruft LLM nur einmal; male label/SOLO_NEG', async () => {
  const plan = await import('../src/imgsvc-plan.js');
  plan.clearComposerCache(); let n = 0; const llm = async () => { n++; return '{"scene":"x"}'; };
  await plan.cachedCompose('s', 'in', llm); await plan.cachedCompose('s', 'in', llm); await plan.cachedCompose('s', 'in2', llm);
  assert.equal(n, 2);
  const src = (await import('node:fs')).readFileSync(new URL('../src/imgsvc-plan.js', import.meta.url), 'utf8');
  assert.match(src, /male \? 'The man: ' : 'The woman: '/); assert.match(src, /SOLO_NEG_MALE = 'extra people, second person, woman/);
});

import { buildPromptPlan } from '../src/promptapp/index.js';
test('buildPromptPlan: männliches Profil → "The man"-Label + Solo-Neg ohne man', () => {
  const p = buildPromptPlan({ profile: { name: 'Javier', persona: { gender: 'male', look: { age: 35 } } }, resolved: {}, model: 'z-image-turbo' });
  const txt = JSON.stringify(p);
  assert.match(txt, /The man/);
  assert.doesNotMatch(txt, /The woman: adult man/);
});
