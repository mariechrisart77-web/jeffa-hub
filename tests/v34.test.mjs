import { test } from 'node:test'; import assert from 'node:assert'; import { readFileSync } from 'node:fs';
test('v34 comic: tab wired, chroma allowed, prompts textless', () => {
  assert.match(readFileSync('apps/hub/index.html', 'utf8'), /data-tab="comic"/);
  assert.match(readFileSync("src/bild/image-handler.ts", "utf8"), /"chroma", "z-image-turbo"\]\.includes\(body\.model\)/);
  const c = readFileSync('apps/hub/comic.js', 'utf8');
  assert.match(c, /MODEL_CHEAP = 'z-image-turbo', MODEL_KEY = 'qwen-image-2-1-turbo'/);
  assert.match(c, /no text, no letters/);
});
test('v32 botvault non-extractable', () => assert.match(readFileSync('apps/shared/botvault.js', 'utf8'), /generateKey\(\{ name: 'AES-GCM', length: 256 \}, false/));
