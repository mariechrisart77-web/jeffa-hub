import test from 'node:test';
import assert from 'node:assert/strict';
import { imageContext } from '../apps/shared/img-context.js';
const msgs = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i} ` + 'x'.repeat(3000) }));
test('Bild-Kontext: max 4 Nachrichten, gekürzt', () => {
  const c = imageContext([...msgs, { role: 'assistant', content: 'bild', generated: true }]);
  assert.equal(c.length, 4);
  assert.ok(c[0].content.startsWith('m6'));
  assert.equal(c[3].content.length, 1200);
  assert.equal(c[0].content.length, 400);
  const before = msgs.slice(-6).reduce((n, m, i, a) => n + Math.min(m.content.length, i === a.length - 1 ? 1800 : 600), 0);
  const after = c.reduce((n, m) => n + m.content.length, 0);
  assert.ok(after < before / 1.5, `${after} vs ${before}`);
});
