import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs';
test('v63 chat start without waechter.css / me.js / tts', () => {
  assert.ok(!fs.readFileSync('apps/hub/index.html', 'utf8').includes('waechter.css'));
  const c = fs.readFileSync('apps/chat/chat.js', 'utf8'); assert.ok(!/^import .*(me\.js|tts\.js)/m.test(c));
  assert.ok(fs.readFileSync('apps/hub/sw.js', 'utf8').includes('2500'));
});
