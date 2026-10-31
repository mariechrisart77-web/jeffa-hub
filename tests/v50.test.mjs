import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const s = readFileSync('apps/chat/profiles.js', 'utf8');
test('v50 Rauchglas-Latex Micro is an FSK18-only kleidung preset', () => {
  assert.match(s, /\{ id: 'k6', label: 'Rauchglas-Latex Micro', prompt: RAUCHGLAS_MICRO, adult: true \}/);
  assert.match(s, /RAUCHGLAS_MICRO = 'smoky-grey translucent glossy latex micro bikini[^']*1\.5 cm[^']*thin string ties[^']*barbell/);
});
test('v50 migration adds k6 once without selecting it', () => {
  assert.match(s, /_kv \|\| 0\) >= 50/);
  assert.doesNotMatch(s, /kleidung(Adult)?\s*[:=]\s*'k6'/);
});
test('v50 sw bump', () => assert.match(readFileSync('apps/hub/sw.js', 'utf8'), /jeffa-v([5-9]\d|\d{3})/));
