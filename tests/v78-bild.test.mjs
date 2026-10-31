import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
test('hub und bild nutzen dieselbe Bild-Engine (gleiche Prompt-Ausgabe)', () => {
  assert.match(rd('functions/api/image.ts'), /from "\.\.\/\.\.\/src\/bild\/image-handler"/);
  assert.match(rd('services/bild/functions/api/image.ts'), /from "\.\.\/\.\.\/\.\.\/\.\.\/src\/bild\/image-handler"/);
});
test('Health liefert Commit (hub + bild)', () => {
  for (const f of ['functions/api/health.ts', 'services/bild/functions/api/health.ts']) assert.match(rd(f), /commit: BUILD\.commit/);
  assert.match(rd('src/build-info.ts'), /commit: "/);
});
test('deploy.sh koppelt hub und bild', () => {
  const s = rd('scripts/deploy.sh');
  assert.match(s, /APPS="\$APPS bild"/); assert.match(s, /APPS="\$APPS hub"/);
});
