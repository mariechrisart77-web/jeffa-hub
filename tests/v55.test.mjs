import { test } from 'node:test'; import assert from 'node:assert'; import { readFileSync } from 'node:fs';
const B = readFileSync('apps/hub/bot.js', 'utf8'), C = readFileSync('apps/chat/chat.js', 'utf8'), A = readFileSync('apps/hub/app.js', 'utf8');
test('v55: bot tab uses chat composer + spellcheck', () => { assert.match(B, /class="composer-input" id="bot-msg"[^>]*spellcheck="true" autocorrect="on" autocapitalize="sentences"/); assert.match(B, /btn-icon primary" id="bot-send"/); });
test('v55: main chat input spellcheck', () => assert.match(C, /id="message-input"[^>]*spellcheck="true" autocorrect="on" autocapitalize="sentences"/));
test('v55: text attachments inline + keyboard fit + lazy', () => { assert.match(B, /inlineTextAtts/); assert.match(B, /visualViewport\?\.addEventListener\('resize', scheduleBotFit\)/); assert.match(A, /import\('\.\/bot\.js'\)/); });
