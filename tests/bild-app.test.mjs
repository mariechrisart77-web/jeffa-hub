import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { parseSessionHash, costOf, buildBody } from '../apps/bild/core.js';

test('parseSessionHash extracts token from hash', () => {
  assert.equal(parseSessionHash('s=abc123'), 'abc123');
  assert.equal(parseSessionHash('s=hello%20world'), 'hello world');
  assert.equal(parseSessionHash('invalid'), null);
  assert.equal(parseSessionHash(''), null);
});

test('costOf calculates prices correctly', () => {
  assert.equal(costOf('single', 'auto'), 0.01);
  assert.equal(costOf('single', 'spar'), 0.01);
  assert.equal(costOf('single', 'mittel'), 0.02);
  assert.equal(costOf('single', 'qualitaet'), 0.04);
  assert.equal(costOf('comic', 'auto', 2), 0.02);
  assert.equal(costOf('comic', 'mittel', 3), 0.06);
  assert.equal(costOf('stil-test', 'spar'), 0.03);
});

test('buildBody creates correct request bodies', () => {
  const stateWithProfile = {
    mode: 'single',
    profile: 'alice',
    style: 'anime',
    quality: 'mittel',
    seed: 'zufall',
    scene: 'Café',
    ownScene: '',
    adult: false,
    panels: 2
  };
  const body1 = buildBody(stateWithProfile);
  assert.equal(body1.profile, 'alice');
  assert.equal(body1.style, 'anime');
  assert.equal(body1.quality, 'mittel');
  assert.equal(body1.seed, undefined);
  assert.equal(body1.context.scene, 'Café');

  const stateWithoutProfile = {
    mode: 'single',
    profile: 'none',
    style: 'comic',
    quality: 'auto',
    seed: '12345',
    scene: 'Beach',
    ownScene: 'Astronaut',
    adult: true,
    panels: 2
  };
  const body2 = buildBody(stateWithoutProfile);
  assert.equal(body2.prompt, 'Astronaut in comic style');
  assert.equal(body2.model, 'z-image-turbo');
  assert.equal(body2.width, 768);
  assert.equal(body2.height, 1024);
  assert.equal(body2.seed, '12345');
  assert.equal(body2.adult, true);
});

test('manifest.webmanifest exists and is valid', () => {
  const content = readFileSync('apps/bild/manifest.webmanifest', 'utf-8');
  const manifest = JSON.parse(content);
  assert.equal(manifest.name, 'Jeffa Bild');
  assert.equal(manifest.short_name, 'Bild');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#8b5cf6');
});

test('sw.js contains correct cache name and precache list', () => {
  const content = readFileSync('apps/bild/sw.js', 'utf-8');
  assert(/const CACHE = ["']jeffa-bild-v\d+["']/.test(content), 'SW should define cache name');
  assert(content.includes('PRECACHE'), 'SW should define precache list');
  assert(content.includes('/api/'), 'SW should handle /api/ paths');
});
