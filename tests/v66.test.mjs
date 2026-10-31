import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs';
test('v66 news dots wired without polling', () => {
  const app = fs.readFileSync('apps/hub/app.js', 'utf8'), sw = fs.readFileSync('apps/hub/sw.js', 'utf8');
  assert.match(app, /jeffa-v6[6-9]/); assert.match(app, /clearNews\(name\)/); assert.match(app, /has-news/);
  assert.match(sw, /type: 'news'/); assert.match(fs.readFileSync('apps/chat/chat.js', 'utf8'), /jeffa:news/);
  assert.match(fs.readFileSync('apps/hub/app.css', 'utf8'), /has-news::after/);
  assert.doesNotMatch(app.split('v66:')[1], /setInterval/);
});
