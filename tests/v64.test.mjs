import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs';
import { PRESETS } from '../apps/shared/quickfill.js';
test('v64 presets present and wired', () => {
  for (const k of ['p-desc', 'look-details', 'me-kleidung', 'imgfb-t', 'cm-story', 'own-scene-input']) assert.ok(PRESETS[k].length >= 4, k);
  assert.ok(!/kindlich|teen|jugendlich|schoolgirl/i.test(JSON.stringify(PRESETS)));
  for (const f of ['apps/chat/persona.js', 'apps/chat/me.js', 'apps/hub/comic.js', 'apps/chat/chat.js', 'apps/bild/bild.js']) assert.ok(fs.readFileSync(f, 'utf8').includes('quickfill'), f);
  assert.ok(fs.readFileSync('apps/shared/quickfill.js', 'utf8').includes("cur + ', ' + v"), 'appends, never replaces');
});
