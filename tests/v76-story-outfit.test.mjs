import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { buildImagePlan } from '../src/imgsvc-plan.js';
test('v76: Kleidung automatisch – Story-Satinkleid schlägt Profil-Outfit; Dropdown gewinnt weiter', async () => {
  const resolved = { identity: 'adult woman, 28 years old, long black hair', outfits: [{ when: '', text: 'grey latex micro bikini' }], defaults: { outfit: 'grey latex micro bikini' } };
  const profile = { id: 't', name: 'T', adult: true, persona: { age: 28 } };
  const msgs = [{ role: 'user', content: 'Zieh dich um.' }, { role: 'assistant', content: '*Sie kommt in einem engen roten Satinkleid zurück und lehnt sich im Wohnzimmer ans Fenster.*' }];
  const composeLLM = async () => JSON.stringify({ outfit: 'grey latex micro bikini', background: 'living room', story: { location: 'living room', outfit: 'tight red satin dress' } });
  const a = await buildImagePlan({ profile, resolved, composeLLM, rnd: () => 0.1, body: { profile: 't', adult: true, style: 'real', photoOverride: { outfit: '' }, context: { messages: msgs } } });
  assert.match(a.prompt, /red satin dress/); assert.doesNotMatch(a.prompt, /latex micro bikini/);
  const b = await buildImagePlan({ profile, resolved, composeLLM, rnd: () => 0.1, body: { profile: 't', adult: true, style: 'real', photoOverride: { outfit: 'grey latex micro bikini' }, context: { messages: msgs } } });
  assert.match(b.prompt, /latex micro bikini/);
});
