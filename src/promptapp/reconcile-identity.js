// v83 Identitäts-Abgleich: pro Merkmal (Alter, Haarfarbe, Hautton, Körpergröße, Oberweite) genau EIN Wert.
// Priorität (dokumentiert in docs/konzepte/bild-abgleich-v83.md):
//   1. Profil-Einstellungsfeld (persona.look.age/hair/skin/details, persona.figur.*)
//   2. Charakterkarte (card.data.extensions.jeffa.look/figur)
//   3. Freitext (persona.look.typ, resolved.identity/look)
// Konservativ: nur echte Widersprüche desselben Merkmals werden entfernt, alles andere bleibt stehen.
// Jugendschutz: das Alter kommt aus resolveAge (immer >= 18); hier wird nie ein Alter gesenkt.
import { low, tidy, deToEn } from './util.js';

const RANGE_RX = /\b(?:in|of)\s+(?:her|his|the)\s+(\d0)s\b|\b(?:early|mid|late)\s+(\d0)s\b|\bmitte\s+(\d0)\b/i;
const NUM_AGE_RX = /\b(\d{2})[-\s]?(?:years?[-\s]?old|yo|jahre\b|jährig\w*)|\blooks?\s+(?:about|exactly)\s+(\d{2})\b/i;

/** Alters-Wert eines Segments (Bereich → Mitte), 0 wenn keine Altersangabe */
function ageOf(seg) {
  const m = String(seg).match(NUM_AGE_RX);
  if (m) return +(m[1] || m[2]);
  const r = String(seg).match(RANGE_RX);
  if (r) return +(r[1] || r[2] || r[3]) + 5;
  return 0;
}

const HAIR_COLORS = [
  ['blonde', /\b(blonde?|blond\w*|platinum|golden hair)\b/i],
  ['black', /\b(black|jet-black|raven|schwarz\w*)\b[^,]*\b(hair|haare)\b|\b(raven-haired|black-haired)\b/i],
  ['brown', /\b(brown|brunette|chestnut|braun\w*)\b[^,]*\b(hair|haare)\b|\bbrunette\b/i],
  ['red', /\b(red|ginger|auburn|copper|rot\w*)\b[^,]*\b(hair|haare)\b|\b(redhead|auburn)\b/i],
  ['grey', /\b(grey|gray|silver|white|grau\w*)\b[^,]*\b(hair|haare)\b/i],
];
function hairColorOf(seg) { for (const [k, rx] of HAIR_COLORS) if (rx.test(seg)) return k; return ''; }

const SKIN_TONES = [
  ['tanned', /\b(tanned|tan|sun-kissed|bronzed|gebräunt\w*)\b/i],
  ['fair', /\b(fair|pale|porcelain|light|hell\w*|blass\w*)\b[^,]*\bskin\b|\b(fair|pale|porcelain)-skinned\b/i],
  ['dark', /\b(dark|ebony|brown|dunkl\w*)\b[^,]*\bskin\b/i],
  ['olive', /\bolive\b[^,]*\bskin\b/i],
];
function skinToneOf(seg) { for (const [k, rx] of SKIN_TONES) if (rx.test(seg)) return k; return ''; }

const CM_RX = /\b(1\d{2}|2[0-2]\d)\s*cm\b/i;
const CUP_RX = /\b([a-h]{1,2})-cup\b/i;

/** Sammelt Feld-Sieger (höchste Quelle) pro Merkmal */
function fieldWinners(profile = {}, card = null) {
  const pl = profile.persona?.look || profile.look || {};
  const cl = card?.data?.extensions?.jeffa?.look || {};
  const hairText = String(pl.hair || cl.hair || '');
  const skinText = [pl.skin, pl.details, cl.skin, cl.details].map((t) => String(t || '')).join(', ');
  return {
    hair: hairColorOf(hairText) || hairColorOf(tidy(deToEn(hairText))),
    skin: skinToneOf(skinText) || skinToneOf(tidy(deToEn(skinText))),
  };
}

/**
 * Nimmt die Identitäts-Segmente (Reihenfolge: figur-Zahlen zuerst, dann Felder, dann Freitext – siehe collectIdentitySegs)
 * und liefert { segs, notes } mit genau einem Wert pro Merkmal.
 * @param {string[]} segs
 * @param {{profile?:object, card?:object, age?:number, fieldSegs?:string[]}} opts  age = von resolveAge gewähltes Alter (>= 18);
 *   fieldSegs = Texte aus den figur-Einstellungsfeldern (Größe/Oberweite)
 */
export function reconcileIdentitySegs(segs = [], { profile = {}, card = null, age = 0, fieldSegs = [] } = {}) {
  const notes = [];
  let cur = (Array.isArray(segs) ? segs : []).slice();

  // 1) Alter: Segmente mit abweichender Altersangabe (> 5 Jahre) entfernen – Alterszeile kommt von buildIdentity.
  if (age >= 18) {
    const dropped = cur.filter((s) => { const a = ageOf(s); return a && Math.abs(a - age) > 5; });
    if (dropped.length) cur = cur.filter((s) => !dropped.includes(s));
  }

  const w = fieldWinners(profile, card);
  const pick = (name, valueOf, winner, label) => {
    const hits = cur.map((s) => ({ s, v: valueOf(s) })).filter((x) => x.v);
    const vals = [...new Set(hits.map((x) => x.v))];
    if (vals.length < 2) return;
    const keepVal = winner && vals.includes(winner) ? winner : hits[0].v;
    const drop = hits.filter((x) => x.v !== keepVal).map((x) => x.s);
    cur = cur.filter((s) => !drop.includes(s));
    notes.push(`${label}: „${hits.find((x) => x.v === keepVal).s}“ gilt (${winner === keepVal ? 'Einstellungsfeld' : 'erste Quelle'}) – ${drop.map((d) => `„${d}“`).join(', ')} entfernt`);
  };
  pick('hair', hairColorOf, w.hair, 'Haarfarbe');
  pick('skin', skinToneOf, w.skin, 'Hautton');
  // Größe / Oberweite: Sieger = Wert aus den figur-Einstellungsfeldern
  const cmOf = (s) => (String(s).match(CM_RX) || [])[1] || '';
  const cupOf = (s) => low((String(s).match(CUP_RX) || [])[1] || '');
  const fs = Array.isArray(fieldSegs) ? fieldSegs : [];
  pick('height', cmOf, fs.map(cmOf).find(Boolean) || '', 'Größe');
  pick('cup', cupOf, fs.map(cupOf).find(Boolean) || '', 'Oberweite');
  return { segs: cur, notes };
}
