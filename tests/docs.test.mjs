import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../apps/hub/tresor.js', import.meta.url), 'utf8');
const fn = src.slice(src.indexOf('export function mdToHtml')).replace('export ', '');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mdToHtml = new Function('esc', fn.split('\n// ')[0] + '\nreturn mdToHtml;')(esc);
test('mdToHtml renders and escapes', () => {
  const h = mdToHtml('# T\n- **a** <x>\n| a | b |\n|---|---|\n| 1 | 2 |\nhttps://x.io/"onmouseover');
  assert.match(h, /<h3[^>]*>T<\/h3>/);
  assert.match(h, /<li><strong>a<\/strong> &lt;x&gt;<\/li>/);
  assert.match(h, /<td[^>]*>2<\/td>/);
  assert.ok(!h.includes('href="https://x.io/""'));
  assert.ok(!h.includes('<x>'));
});
test('docs migration + api exist', () => {
  assert.match(readFileSync(new URL('../migrations/0013_docs.sql', import.meta.url), 'utf8'), /CREATE TABLE IF NOT EXISTS docs/);
  assert.match(readFileSync(new URL('../functions/api/docs/[[route]].ts', import.meta.url), 'utf8'), /requireRole\(ctx, 'admin'\)/);
});
