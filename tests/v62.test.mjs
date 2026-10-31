import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs';
import { relTime, convMeta } from '../apps/chat/convmeta.js';
test('v62 relTime', () => {
  const now = new Date(2026, 9, 30, 16, 0);
  assert.equal(relTime(new Date(2026, 9, 30, 15, 1).getTime(), now), 'heute 15:01');
  assert.equal(relTime(new Date(2026, 9, 29, 9).getTime(), now), 'gestern');
  assert.equal(relTime(new Date(2026, 9, 26, 9).getTime(), now), 'Mo.');
  assert.equal(relTime(new Date(2026, 8, 3).getTime(), now), '03.09.');
});
test('v62 convMeta', () => {
  const m = convMeta({ messages: [{ role: 'user', content: 'Hallo' }, { role: 'assistant', content: 'Hi du [FOTO: x]', imageUrl: 'u', ts: 5 }] });
  assert.equal(m.count, 2); assert.ok(m.hasImages); assert.equal(m.preview, 'Hi du'); assert.equal(m.lastTs, 5);
});
test('v62 sidebar uses ⋯ menu', () => { const s = fs.readFileSync('apps/chat/chat.js', 'utf8'); assert.ok(s.includes('conv-more') && s.includes('conv-preview') && s.includes('conv-count')); });
