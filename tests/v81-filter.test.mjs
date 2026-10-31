// v81: Erwachsenen-Filter – Request-Flag `adult` ist maßgeblich, Profilflag false stuft nicht mehr herab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { guardAdult, buildPromptPlan } from '../src/promptapp/index.js';
import { buildIdentity } from '../src/promptapp/identity.js';

test('v81 (a) profile.adult=false + adult:true laesst Outfit unveraendert', () => {
  const notes = [];
  const ph = { outfit: 'micro bikini latex' };
  const { effectiveAdult } = guardAdult({ profile: { adult: false }, adult: true, ph, notes });
  assert.equal(effectiveAdult, true);
  assert.equal(ph.outfit, 'micro bikini latex');
  assert.ok(!notes.some((n) => /SFW|casual summer outfit|Profil nicht 18\+/.test(n)));
});

test('v81 (b) profile.adult="never" sperrt adult-Anfrage', () => {
  const notes = [];
  const { effectiveAdult } = guardAdult({ profile: { adult: 'never' }, adult: true, ph: {}, notes });
  assert.equal(effectiveAdult, false);
});

test('v81 (c) profile.adultMode=false sperrt adult-Anfrage', () => {
  const notes = [];
  const { effectiveAdult } = guardAdult({ profile: { adultMode: false }, adult: true, ph: {}, notes });
  assert.equal(effectiveAdult, false);
});

test('v81 (d) adult:false loescht FSK18-Outfit ohne casual-summer-Ersatz', () => {
  const notes = [];
  const ph = { outfit: 'micro bikini' };
  guardAdult({ profile: { adult: true }, adult: false, ph, notes });
  assert.equal(ph.outfit, '');
  assert.ok(!notes.some((n) => /casual summer outfit|Dropdown-Kleidung|Kleidung: Auswahl/.test(n)));
});

test('v81 (e) buildIdentity behaelt FSK18-Merkmale bei adult:true trotz profile.adult=false', () => {
  const profile = { adult: false, persona: { look: { typ: 'Frau', age: 26 }, figur: { oberweite: 6 } } };
  const resolved = { identity: 'adult woman, full D-cup bust, nipple piercing' };
  const on = buildIdentity({ profile, resolved, adult: true });
  const off = buildIdentity({ profile, resolved, adult: false });
  // v83: Einstellungsfeld (oberweite 6 → F-cup) gewinnt gegen Freitext „full D-cup“ – FSK18-Merkmal bleibt im Adult-Modus
  assert.ok(/F-cup bust|full D-cup bust|nipple/i.test(on.identity), on.identity);
  assert.ok(!/F-cup bust|full D-cup bust|nipple/i.test(off.identity), off.identity);
  assert.ok(on.identity.length >= off.identity.length);
});

test('v81 (f) buildPromptPlan: adult:true + photoOverride outfit bleibt, keine SFW-Notizen', () => {
  const profile = { adult: false, persona: { look: { typ: 'Frau', age: 26 } } };
  const plan = buildPromptPlan({ profile, resolved: {}, photoOverride: { outfit: 'micro bikini' }, adult: true });
  assert.equal(plan.adult, true);
  assert.equal(plan.parts.outfit, 'micro bikini');
  assert.ok(!plan.abgleich.some((n) => /SFW reduziert|Profil nicht 18\+/.test(n)), plan.abgleich.join(' | '));
});
