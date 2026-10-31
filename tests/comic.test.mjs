import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
globalThis.window ??= { addEventListener() {}, location: { hash: '' } }; globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} }; globalThis.document ??= { addEventListener() {}, querySelector() { return null; }, getElementById() { return null; } };

test('AP1: no spar mode in comic.js', () => {
  const c = readFileSync('apps/hub/comic.js', 'utf8');
  assert.ok(!c.includes('spar'), 'spar mode removed');
  assert.ok(!c.includes('oneScene'), 'oneScene removed');
  assert.ok(!c.includes('crop'), 'crop logic removed');
});

test('AP1: costOf function', async () => {
  const { costOf } = await import('../dist/hub/comic.js');
  assert.strictEqual(costOf(3, false, false), 0.03, '3 panels z-image-turbo');
  assert.strictEqual(costOf(4, true, false), 0.05, '4 panels with qwen key');
  assert.strictEqual(costOf(3, true, true), 0.03, 'FSK18 always chroma 0.01 each');
  assert.strictEqual(costOf(2, false, true), 0.02, 'FSK18 2 panels');
});

test('AP2: parseScript with valid JSON', async () => {
  const { parseScript } = await import('../dist/hub/comic.js');
  const json = `\`\`\`json
{
  "title": "La confusión",
  "cast": [{"name": "Lena", "look": "young woman, blonde hair, casual outfit"}],
  "panels": [
    {"scene_en": "woman on the left at bar counter", "caption_es": "En el bar", "bubbles": [{"speaker": "Lena", "text_es": "Una cerveza", "pos": "left", "head": "top"}], "shot": "medium shot"},
    {"scene_en": "bartender on right side smiling", "caption_es": "", "bubbles": [{"speaker": "María", "text_es": "Claro", "pos": "right", "head": "middle"}], "shot": "close-up"},
    {"scene_en": "woman on left surprised", "caption_es": "Sorpresa", "bubbles": [], "shot": "close-up"}
  ]
}
\`\`\``;
  const result = parseScript(json);
  assert.strictEqual(result.panels.length, 3, '3 panels parsed');
  assert.strictEqual(result.panels[0].bubbles.length, 1, 'panel 0 has 1 bubble');
  assert.strictEqual(result.panels[0].bubbles[0].pos, 'left', 'pos=left');
  assert.strictEqual(result.panels[0].bubbles[0].head, 'top', 'head=top');
});

test('AP2: parseScript rejects invalid JSON', async () => {
  const { parseScript } = await import('../dist/hub/comic.js');
  assert.strictEqual(parseScript('not json'), null, 'invalid JSON -> null');
  assert.strictEqual(parseScript('{"panels":[]}'), null, 'too few panels -> null');
});

test('AP2: panelPrompt includes speaker position and no text', async () => {
  const { panelPrompt } = await import('../dist/hub/comic.js');
  const panel = {
    scene_en: 'woman at bar counter',
    caption_es: 'En el bar',
    bubbles: [{ speaker: 'Lena', text_es: 'Hola', pos: 'left', head: 'top' }],
    shot: 'medium shot'
  };
  const cast = [{ name: 'Lena', look: 'young blonde woman' }];
  const prompt = panelPrompt(panel, cast);
  assert.match(prompt, /left side/, 'contains speaker position');
  assert.match(prompt, /no text, no letters/, 'contains no text instruction');
});

test('AP3: bubbleGeom places bubble inside panel top area', async () => {
  const { bubbleGeom } = await import('../dist/hub/comic.js');
  const panel = { x: 16, y: 16, w: 468, h: 500 };
  const bubble = { pos: 'left', head: 'top' };
  const geom = bubbleGeom(panel, bubble, 0);
  assert.ok(geom.x >= panel.x && geom.x + geom.w <= panel.x + panel.w, 'bubble x within panel');
  assert.ok(geom.y >= panel.y && geom.y + geom.h <= panel.y + panel.h * 0.3, 'bubble y in top area');
  assert.ok(geom.tailX < panel.x + panel.w / 2, 'tail left of center for pos=left');
});

test('AP3: bubbleGeom right position', async () => {
  const { bubbleGeom } = await import('../dist/hub/comic.js');
  const panel = { x: 16, y: 16, w: 468, h: 500 };
  const bubble = { pos: 'right', head: 'middle' };
  const geom = bubbleGeom(panel, bubble, 0);
  assert.ok(geom.tailX > panel.x + panel.w / 2, 'tail right of center for pos=right');
});
