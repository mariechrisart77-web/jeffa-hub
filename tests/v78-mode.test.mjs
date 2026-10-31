import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, chatMode, effectiveAdult } from '../apps/shared/mode.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'po78-')); fs.mkdirSync(d + '/shared');
fs.writeFileSync(d + '/shared/fsk.js', 'export const isAdult = () => false;');
fs.copyFileSync(new URL('../apps/chat/photoopts.js', import.meta.url), d + '/photoopts.js');
const { SFW_DIRECTIONS, photoFragments } = await import(d + '/photoopts.js');
import { applyModeToSystem, enforceImageMode, SFW_RULE } from '../src/mode-server.js';

const adultOn = () => true;
const adultOff = () => false;

test('chatMode defaults', () => {
  assert.equal(chatMode({}, { adult: false }), MODES.jugendfrei);
  assert.equal(chatMode({}, { adult: true }), MODES.hemmungslos);
  assert.equal(chatMode({}, {}), MODES.jugendfrei);
  assert.equal(chatMode({ mode: 'hemmungslos' }, { adult: false }), MODES.hemmungslos);
  assert.equal(chatMode({ mode: 'jugendfrei' }, { adult: true }), MODES.jugendfrei);
  assert.equal(chatMode({ mode: 'quatsch' }, { adult: false }), MODES.jugendfrei);
});

test('effectiveAdult', () => {
  assert.equal(effectiveAdult({ mode: 'hemmungslos' }, {}, adultOn), true);
  assert.equal(effectiveAdult({ mode: 'hemmungslos' }, {}, adultOff), false);
  assert.equal(effectiveAdult({ mode: 'jugendfrei' }, {}, adultOn), false);
  assert.equal(effectiveAdult({}, { adult: false }, adultOn), false);
  assert.equal(effectiveAdult({ mode: 'hemmungslos' }, { adultMode: false }, adultOn), false);
  assert.equal(effectiveAdult({ mode: 'hemmungslos' }, { adult: 'never' }, adultOn), false);
});

test('SFW_DIRECTIONS has 3 non-empty EN prompts', () => {
  const entries = Object.entries(SFW_DIRECTIONS);
  assert.equal(entries.length, 3);
  for (const [id, d] of entries) {
    assert.ok(id);
    assert.ok(typeof d.prompt === 'string' && d.prompt.length > 5);
    assert.match(d.prompt, /[a-z]/);
  }
});

test('applyModeToSystem appends SFW rule only for jugendfrei', () => {
  assert.equal(applyModeToSystem('X', 'hemmungslos'), 'X');
  assert.ok(applyModeToSystem('X', 'jugendfrei').startsWith('X'));
  assert.ok(applyModeToSystem('X', 'jugendfrei').includes(SFW_RULE));
  assert.equal(applyModeToSystem('X', undefined), 'X'); // alte Aufrufer ohne mode unverändert
  assert.equal(applyModeToSystem('X', 'jugendfrei').split(SFW_RULE).length - 1, 1);
});

test('enforceImageMode', () => {
  assert.equal(enforceImageMode({ adult: true, mode: 'jugendfrei' }).adult, false);
  assert.equal(enforceImageMode({ adult: true, mode: 'hemmungslos' }).adult, true);
  assert.equal(enforceImageMode({ adult: true }).adult, true);
  assert.equal(enforceImageMode({ adult: true, mode: undefined }).adult, true);
  assert.equal(enforceImageMode({ adult: true, mode: 'quatsch' }).adult, false);
});

test('jugendfrei: Richtung landet im Outfit, nicht im 18+-Modus', () => {
  assert.match(photoFragments({ photo: { direction: 'sportlich' } }, false).outfit, /sporty/);
  assert.doesNotMatch(photoFragments({ photo: { direction: 'sportlich' } }, true).outfit || '', /sporty/);
});
