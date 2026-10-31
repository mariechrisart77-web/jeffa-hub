// v81: randloser Chat auf dem Handy (CSS-Block) + Zoom-Meta bleibt unangetastet.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function v81Block(src) {
  const i = src.indexOf('/* v81: randloser Chat auf dem Handy */');
  assert.ok(i >= 0, 'v81-Block fehlt');
  return src.slice(i);
}

test('v81 Layout: app.css und chat.css enthalten den v81-Block', () => {
  for (const f of ['apps/hub/app.css', 'apps/chat/chat.css']) {
    const b = v81Block(css(f));
    assert.ok(b.includes('max-width:700px'), `${f}: Media-Query fehlt`);
    assert.ok(/\.msg\b[^{]*\{[^}]*max-width:\s*100%/s.test(b), `${f}: .msg max-width:100% fehlt`);
    assert.ok(b.includes('#tab-bot .bot-msg'), `${f}: Bot-Tab-Regeln fehlen`);
  }
});

test('v81 Layout: Viewport erlaubt weiterhin Zoom, #messages behaelt pan-y', () => {
  for (const f of ['apps/hub/index.html', 'apps/chat/index.html']) {
    const html = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(!/user-scalable\s*=\s*no/i.test(html), `${f}: user-scalable=no`);
    assert.ok(!/maximum-scale\s*=\s*1/i.test(html), `${f}: maximum-scale=1`);
  }
  assert.ok(/touch-action:\s*pan-y/.test(css('apps/chat/chat.css')), 'touch-action: pan-y fehlt');
});
