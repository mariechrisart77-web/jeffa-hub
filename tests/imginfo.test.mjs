import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { imgInfoHtml } from '../apps/chat/imginfo.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

test('imgInfoHtml includes model, cost, seed', () => {
  const gen = { model: 'chroma', cost: 0.01, seed: 12345, prompt: 'test prompt' };
  const html = imgInfoHtml(gen, esc);
  assert.match(html, /chroma/);
  assert.match(html, /0,01 \$/);
  assert.match(html, /Seed 12345/);
});

test('imgInfoHtml shows scene when present', () => {
  const gen = { model: 'z-image', cost: 0.01, seed: 999, llmScene: 'A woman in a park', prompt: 'test' };
  const html = imgInfoHtml(gen, esc);
  assert.match(html, /A woman in a park/);
});

test('imgInfoHtml shows warning when sceneError present', () => {
  const gen = { model: 'chroma', cost: 0.01, seed: 123, sceneError: 'all_models_failed', prompt: 'raw' };
  const html = imgInfoHtml(gen, esc);
  assert.match(html, /Szene nicht erstellt/);
  assert.match(html, /img-warn/);
});

test('imgInfoHtml escapes HTML in prompt', () => {
  const gen = { model: 'test', cost: 0.02, seed: 1, prompt: '<b>bold</b> & "quoted"' };
  const html = imgInfoHtml(gen, esc);
  assert.match(html, /&lt;b&gt;bold&lt;\/b&gt;/);
  assert.match(html, /&amp;/);
  assert.match(html, /&quot;/);
});

test('imgInfoHtml truncates long prompts', () => {
  const gen = { model: 'test', cost: 0.01, seed: 1, prompt: 'a'.repeat(700) };
  const html = imgInfoHtml(gen, esc);
  assert.match(html, /…/);
  assert.ok(html.length < 1500);
});

test('imgInfoHtml returns empty for missing gen', () => {
  const html = imgInfoHtml(null, esc);
  assert.equal(html, '');
});

test('nextAngle rotates through list', () => {
  const list = ['close-up shot', 'full body shot', 'low angle shot'];
  assert.equal(nextAngle('close-up shot', list), 'full body shot');
  assert.equal(nextAngle('full body shot', list), 'low angle shot');
  assert.equal(nextAngle('low angle shot', list), 'close-up shot');
});

test('nextAngle wraps from non-existent current', () => {
  const list = ['a', 'b', 'c'];
  assert.equal(nextAngle('unknown', list), 'a');
  assert.equal(nextAngle('', list), 'a');
});

test('nextAngle handles empty or missing list', () => {
  assert.equal(nextAngle('test', []), 'test');
  assert.equal(nextAngle('test', undefined), 'test');
});



import { nextAngle } from '../apps/chat/imginfo.js';
import fs from 'node:fs';
test('AP7 (v68): server keeps the story state per conversation instead of a separate scene writer', () => {
  assert.match(fs.readFileSync(new URL('../src/imgsvc-image.ts', import.meta.url), 'utf8'), /story:\$\{pid\}:\$\{cid/);
  assert.ok(!/imagefb\/scene/.test(fs.readFileSync(new URL('../apps/chat/chat.js', import.meta.url), 'utf8')));
});
