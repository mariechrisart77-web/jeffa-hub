// v85b: zentrale Szenenliste + Tageszeit (19), Geschlecht 'm' (20), chat.js-Aufteilung (20), Runware-Weg ohne Venice-Key.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SCENES, SCENE_DETECT, sceneMenu, sceneById, TIMES_OF_DAY, timeOfDayKey, TIME_PHRASE } from '../apps/shared/scenes.js';
import { SCENE_MAP, detectScene } from '../src/promptapp/scene-map.js';
import { buildImagePlan } from '../src/imgsvc-core.js';
import { buildBody } from '../apps/bild/core.js';
import { genderOf } from '../apps/shared/promptapp/chat.js';

const read = (f) => fs.readFileSync(f, 'utf8');
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'v85b-')); fs.mkdirSync(d + '/shared');
fs.writeFileSync(d + '/shared/fsk.js', 'export const isAdult = () => false;');
fs.copyFileSync('apps/shared/scenes.js', d + '/shared/scenes.js');
fs.copyFileSync('apps/chat/photoopts.js', d + '/photoopts.js');
const PO = await import(d + '/photoopts.js');

test('19: eine Szenenliste – Erkennung unverändert (26 Einträge, gleiche Reihenfolge)', () => {
  assert.equal(SCENE_MAP, SCENE_DETECT);
  assert.equal(SCENE_DETECT.length, 26);
  assert.equal(SCENE_DETECT[0][1].location, 'parking deck');
  assert.equal(SCENE_DETECT[25][1].location, 'snow');
  assert.equal(detectScene('Wir sitzen im Café am Fenster')?.location, 'café');
  const ids = SCENES.map((s) => s.id); assert.equal(new Set(ids).size, ids.length, 'IDs eindeutig');
});

test('19: Menü – Chat und Bild-App nutzen dieselbe Liste, 18+ nur im FSK18-Menü', () => {
  const sfw = sceneMenu(false).flatMap(([, l]) => l), all = sceneMenu(true).flatMap(([, l]) => l);
  assert.ok(sfw.every((s) => !s.adult));
  assert.ok(all.some((s) => s.id === 'betonwand' && s.adult));
  for (const id of ['betonwand', 'parkplatz', 'poolnacht', 'yoga', 'hotel', 'strand', 'dach', 'spa', 'jet', 'weingut', 'loft', 'schlafzimmer']) assert.ok(sceneById(id), 'alte Foto-ID ' + id);
  for (const lb of ['Café', 'Strand bei Sonnenuntergang', 'Bibliothek', 'Stadtpark', 'Küche', 'Bahnhof', 'Bergsee', 'Neon-Straße bei Nacht']) assert.ok(sfw.some((s) => s.label === lb), 'Bild-App-Szene ' + lb);
  // Fotomenü (photoopts) baut sich aus derselben Liste; alte Reihenfolge der ersten Gruppe bleibt
  const html = PO.optionsHtml('scene', '', false);
  assert.ok(html.includes('Hotelzimmer mit Blick auf die Stadt') && html.includes('Bahnhof') && !html.includes('Betonwand-Studio'));
  assert.ok(PO.optionsHtml('scene', '', true).includes('Betonwand-Studio'));
  assert.ok(html.indexOf('Hotelzimmer') < html.indexOf('Yacht-Deck'));
  const bild = read('apps/bild/bild.js');
  assert.ok(/sceneMenu\(false\)/.test(bild) && !/const SCENES = \[/.test(bild));
});

test('19: Tageszeit-Werte', () => {
  assert.deepEqual(TIMES_OF_DAY.map((t) => t.id), ['morgen', 'tag', 'abend', 'nacht']);
  assert.equal(timeOfDayKey('morgen'), 'morning'); assert.equal(timeOfDayKey('nacht'), 'night');
  assert.equal(timeOfDayKey('evening'), 'evening'); assert.equal(timeOfDayKey(''), ''); assert.equal(timeOfDayKey('auto'), ''); assert.equal(timeOfDayKey('<x>'), '');
  assert.ok(TIME_PHRASE.night);
});

test('19: Foto-Menü – Tageszeit nur gesetzt, wenn gewählt (sonst Ausgabe unverändert)', () => {
  const base = PO.photoFragments({ photo: { scene: 'hotel' } }, false);
  assert.equal('time' in base, false);
  const m = PO.photoFragments({ photo: { scene: 'hotel', time: 'morgen' } }, false);
  assert.equal(m.time, 'morning');
  assert.match(m.scene, /early morning/);
  assert.ok(PO.optionsHtml('time', 'abend', false).includes('selected'));
  const ph = read('apps/chat/chat-photo.js');
  assert.ok(ph.includes("['time', 'Tageszeit']") && ph.includes("k === 'time'"), 'Tageszeit auch jugendfrei sichtbar');
});

const say = (c) => ({ role: 'assistant', content: c });
const RES = { identity: 'Mara, adult woman, looks about 30' };
const PROF = { persona: { look: { age: 30 } } };

test('19: Server – gewählte Tageszeit überschreibt Story und Licht; automatisch erkennt deutsch', async () => {
  const msgs = [say('Wir sitzen mittags im Café.')];
  const night = await buildImagePlan({ profile: PROF, resolved: RES, body: { adult: false, dryRun: true, timeOfDay: 'night', context: { messages: msgs } }, rnd: () => 0.4 });
  assert.equal(night.story.time_of_day, 'night');
  assert.match(night.prompt, /night/i);
  const po = await buildImagePlan({ profile: PROF, resolved: RES, body: { adult: false, dryRun: true, photoOverride: { time: 'morgen' }, context: { messages: msgs } }, rnd: () => 0.4 });
  assert.equal(po.story.time_of_day, 'morning');
  const auto = await buildImagePlan({ profile: PROF, resolved: RES, body: { adult: false, dryRun: true, context: { messages: [say('Heute abends treffen wir uns im Café.')] } }, rnd: () => 0.4 });
  assert.equal(auto.story.time_of_day, 'evening');
  // Licht-Dropdown gewinnt weiter
  const lit = await buildImagePlan({ profile: PROF, resolved: { ...RES, photo: { light: 'neon pink light' } }, body: { adult: false, dryRun: true, timeOfDay: 'night', context: { messages: msgs } }, rnd: () => 0.4 });
  assert.match(lit.prompt, /neon pink light/);
  // Altersschutz bleibt vor allem anderen
  const minor = await buildImagePlan({ profile: { persona: { look: { age: 17 } } }, resolved: {}, body: { adult: true, dryRun: true, timeOfDay: 'night', context: { scene: 'am Strand' } }, rnd: () => 0.5 });
  assert.equal(minor.error?.code, 'not_adult');
});

test('19: Bild-App – Tageszeit im Body nur wenn gewählt', () => {
  const st = { mode: 'single', profile: 'p1', style: 'real', quality: 'auto', seed: 'zufall', scene: 'Café', adult: false, format: 'hoch' };
  const a = buildBody(st), b = buildBody({ ...st, timeOfDay: 'night', timePhrase: TIME_PHRASE.night });
  assert.equal('timeOfDay' in a, false);
  assert.equal(b.timeOfDay, 'night');
  const leg = buildBody({ ...st, profile: 'none', timeOfDay: 'night', timePhrase: TIME_PHRASE.night });
  assert.match(leg.prompt, /^Café, night/);
  assert.equal(buildBody({ ...st, profile: 'none' }).prompt, 'Café');
  assert.ok(read('apps/bild/index.html').includes('id="time-select"'));
});

test('20: Geschlecht m/w/d – Feld im Profil, Client-Bildprompt erkennt "m"', () => {
  assert.equal(genderOf({ persona: { gender: 'm' } }), 'm');
  assert.equal(genderOf({ gender: 'male' }), 'm');
  assert.equal(genderOf({ persona: { gender: 'w' } }), 'w');
  const prof = read('apps/chat/profiles.js');
  assert.ok(prof.includes("genderOf(profile) === 'm' ? 'adult man' : 'adult woman'"));
  assert.ok(!prof.includes("=== 'male' ? 'adult man'"));
  assert.ok(read('apps/chat/persona.js').includes("chips('p-gender'"));
});

test('20: chat.js aufgeteilt – öffentliche Exporte bleiben, Teilmodule vorhanden', () => {
  const c = read('apps/chat/chat.js');
  for (const n of ['initChat', 'startNewChat', 'openLastChat', 'lastConvIdFor', 'getCast', 'setCast', 'listConversations']) assert.match(c, new RegExp('export (async )?function ' + n + '\\b'), n);
  assert.match(c, /export \{ initPinchZoom, photoOnce, photoLinked \}/);
  for (const f of ['chat-util.js', 'chat-agent.js', 'chat-layout.js', 'chat-photo.js']) assert.ok(fs.existsSync('apps/chat/' + f), f);
  assert.ok(c.split('\n').length < 950, 'chat.js deutlich kleiner');
  assert.match(read('apps/chat/chat-agent.js'), /export async function runAgent/);
  assert.match(read('apps/chat/chat-photo.js'), /export function openPhotoSheet\(currentConv\)/);
  // keine statischen Importe von me.js/tts.js (v63) in den neuen Modulen
  for (const f of ['chat-util.js', 'chat-agent.js', 'chat-layout.js', 'chat-photo.js']) assert.ok(!/^import .*(me\.js|tts\.js)/m.test(read('apps/chat/' + f)), f);
  // CHECK_SHEER_OK bleibt aus
  assert.ok(!/CHECK_SHEER_OK\s*=\s*["']?(1|true)/.test(read('wrangler.toml') + read('src/imgsvc-image.ts')));
});

test('R: ohne Venice-Key aber mit Runware-Key → Runware; fehlender Runware-Key → klare Meldung', () => {
  const s = read('src/imgsvc-image.ts');
  assert.ok(s.includes('model.startsWith("runware:") || (!key && rwKey)'));
  assert.ok(s.includes('runware_no_key'));
  assert.ok(s.includes('if (wantImage && !key && !rwKey)'));
});
