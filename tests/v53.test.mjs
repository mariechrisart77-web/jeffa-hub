import test from 'node:test'; import assert from 'node:assert'; import { readFileSync } from 'node:fs';
import { buildBody, FORMATS } from '../apps/bild/core.js';
test('v53 bild format dropdown + dims', () => {
  assert.match(readFileSync('apps/bild/index.html', 'utf8'), /id="format-select"[\s\S]*Querformat/);
  assert.deepEqual(FORMATS.quer, [1024, 768]);
  const b = buildBody({ mode: 'single', profile: 'none', style: 'real', quality: 'auto', seed: 'zufall', scene: 'cafe', format: 'quer' });
  assert.equal(b.width, 1024); assert.equal(b.height, 768);
});
test('v53 Bild-App button moved: not in header, in Comic tab and ☰ drawer', () => {
  assert.doesNotMatch(readFileSync('apps/hub/app.js', 'utf8'), /nav\.appendChild/);
  assert.match(readFileSync('apps/hub/comic.js', 'utf8'), /data-open-bild/);
  assert.match(readFileSync('apps/chat/chat.js', 'utf8'), /data-open-bild/);
});
