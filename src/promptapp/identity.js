// v74 Identität: aus JEDEM Profil (persona.look, figur, details, card-look, age) einen kompakten,
// konsistenten englischen Identitätsblock bauen. KEINE Kleidungs-Wörter; die gehen in den Default-Outfit-Kandidaten.
import { deToEn, dedupe, splitSegs, tidy, low } from './util.js';
import { isCleanIdentityFragment, isGermanFragment, isBogusAge, extractHairFromGerman } from './decheck.js';

/** Wörter, die Kleidung beschreiben – dürfen NIE im Identitätsblock landen */
const CLOTHING_RX = /\b(kleid|dress|bikini|swim\w*|badeanzug|lingerie|dessous|shirt|t-?shirt|bluse|blouse|jeans|hose|pants|skirt|rock|jacke|jacket|coat|mantel|pullover|sweater|hoodie|uniform|kostüm|costume|towel|handtuch|bademantel|robe|pyjama|pajama|nightgown|nachthemd|wears?|wearing|trägt|angezogen|outfit|latex|leder|leather|stockings|strümpfe|heels|bodysuit|catsuit|harness|negligee|string|thong|v-?strap|clinging|second skin|micro\s*bikini|wicked[- ]weasel|tie[- ]side|halter|triangle)\b/i;
export const OUTFIT_HINT_RX = CLOTHING_RX;

/** FSK18-Merkmale: nur für 18+-Profile; aus dem Identitätsblock entfernen wenn nicht 18+ */
const FSK18_ID_RX = /\b(full|large|huge|massive|heavy|ample)\s+[a-z]{1,2}-cup\b|\bcup bust\b|\bsideboob\b|\bunderboob\b|\bnipple\w*|\bpiercing\w*|\bpierced\b|\bnude\b|\bnaked\b|\blingerie\b|\blatex\b|\bbodysuit\b|\bcatsuit\b|\bharness\b|\bmicro\s*bikini\b/i;

/** Alters-Range aus "in her 20s" / "mid 20s" → Mittelwert */
const RANGE_RX = /\b(?:in|of)\s+(?:her|his|the)\s+(\d0)s\b|\b(early|mid|late)\s+(\d0)s\b/gi;

function rangeCandidates(text) {
  const out = [];
  const t = String(text || '');
  // v75-Fix: RANGE_RX ist global; matchAll übernimmt lastIndex → vor jedem Lauf zurücksetzen
  RANGE_RX.lastIndex = 0;
  for (const m of t.matchAll(RANGE_RX)) {
    const decade = +(m[1] || m[3]) + 5; // "20s" → 25 (v74-Bug: 205)
    out.push({ n: decade, source: 'range' });
  }
  RANGE_RX.lastIndex = 0;
  return out;
}

/** v75: Zahlen > 120 sind keine Altersangabe (z. B. „205 (Bereichsangabe)") */
function isPlausibleAge(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return false;
  if (v < 10) return false;
  if (isBogusAge(v)) return false;
  return true;
}

/** Alter aus numerischen Angaben oder Text ermitteln. Liefert { age, note } mit note = Widerspruchstext oder '' */
export function resolveAge(profile = {}, resolved = {}) {
  const candidates = [];
  const push = (v, source) => {
    const n = +String(v ?? '').match(/\d{1,3}/)?.[0];
    if (isPlausibleAge(n) && n >= 10 && n <= 99) candidates.push({ n, source });
  };
  push(profile.persona?.look?.age, 'persona.look.age');
  push(profile.look?.age, 'look.age');
  push(profile.age, 'profile.age');
  push(profile.card?.data?.extensions?.jeffa?.look?.age, 'card.age');

  const texts = [
    profile.persona?.look?.style, profile.look?.style,
    resolved.identity, resolved.look,
  ].map((t) => String(t || '')).join(' ');
  for (const m of texts.matchAll(/\blooks?\s+about\s+(\d{2})\b/gi)) push(m[1], 'looks_about');
  for (const m of texts.matchAll(/\b(\d{2})[-\s]?(?:years?[-\s]old|yo|jahre|jährig\w*)\b/gi)) push(m[1], 'age_phrase');
  // v75: keine Pseudo-Alter aus Story-Text (205 etc.) übernehmen
  const ranges = rangeCandidates(texts);

  const numeric = candidates.filter((c) => c.n >= 21);
  if (!candidates.length && !ranges.length) return { age: 21, note: '' };
  if (!numeric.length) {
    // nur <21-Angaben oder nur Ranges → auf 21 heben
    return { age: 21, note: '' };
  }
  const pick = numeric[0];
  const conflicts = candidates.filter((c) => c.n !== pick.n && Math.abs(c.n - pick.n) > 5 && !isBogusAge(c.n));
  const conflictRanges = ranges.filter((r) => Math.abs(r.n - pick.n) > 5).filter((r) => !isBogusAge(r.n));
  const notes = [];
  // v75: „Bereichsangabe" (>120) wird NICHT mehr als Widerspruch gemeldet
  if (conflicts.length || conflictRanges.length) {
    const parts = [
      ...conflicts.map((c) => `${c.n} (${c.source})`),
      ...conflictRanges.map((r) => `${r.n} (Bereichsangabe)`),
    ];
    notes.push(`Alter widersprüchlich („${parts.join('“ / „')}“ vs. „${pick.n}“) – verwendet: ${pick.n}`);
  }
  return { age: pick.n, note: notes.join('; ') };
}

// v77/v78: Skalen zentral in apps/shared/figure.js (identisch zu profiles.js)
import { figureParts } from '../../apps/shared/figure.js';

/** Figure-Text aus figur-Zahlwerten (groesse, statur, kurven, oberweite, optional gewichtKg/unterbrustCm) */
function figureText(figur = {}, staturFromLook = '', model = '') {
  return figureParts(figur, { staturFromLook, model, translate: (t) => tidy(deToEn(t)) });
}

/** Segment ist reine Identitätsbeschreibung? (keine Kleidung, keine Handlung, keine Alters-Range) */
function isIdentitySeg(s) {
  if (!s) return false;
  if (CLOTHING_RX.test(s)) return false;
  // Alters-Ranges ("woman in her 20s") sind kein Aussehen – das numerische Alter kommt aus resolveAge
  RANGE_RX.lastIndex = 0;
  if (RANGE_RX.test(s)) return false;
  RANGE_RX.lastIndex = 0;
  if (/\b(parkplatzsex|exhibitionis\w*|liebt|steht auf|zeigt sich gern|mag)\b/i.test(s)) return false;
  return true;
}

/** Aus person.look einen kompakten Identitätstext (ohne Kleidung, ohne Handlung) */
export function collectIdentitySegs(profile = {}, resolved = {}, card = null) {
  const segs = [];
  const pl = profile.persona?.look || profile.look || {};
  const cl = card?.data?.extensions?.jeffa?.look || {};
  // 1. card-look (feinste Felder) zuerst nutzen, damit die Reihenfolge stabil bleibt
  const fieldPool = [];
  const pushField = (v) => { if (typeof v === 'string' && v.trim()) fieldPool.push(v); };
  pushField(pl.typ || cl.typ);
  pushField(pl.hair || cl.hair);
  pushField(cl.eyes);
  pushField(pl.skin || cl.skin);
  if (Array.isArray(pl.special)) fieldPool.push(...pl.special);
  pushField(pl.details);
  pushField(cl.details);
  // 2. resolved.identity als Ergänzung (enthält oft schon Face/Details)
  const rid = String(resolved.identity || resolved.look || '');
  for (const s of splitSegs(rid)) fieldPool.push(s);
  // 3. figur-Zahlen
  const fig = profile.persona?.figur || profile.figur || card?.data?.extensions?.jeffa?.figur || {};
  const staturFromLook = String(pl.statur || '').trim();
  const figure = figureText(fig, staturFromLook, profile.persona?.model || profile.model || '');
  segs.push(...figure);
  for (const f of fieldPool) for (const s of splitSegs(f)) segs.push(s);
  // dedupe + Kleidung/Ranges nochmals entfernen (Sicherheitsnetz)
  const out = [];
  const seen = new Set();
  for (const s of segs) {
    const clean = tidy(deToEn(String(s || '').replace(/\s{2,}/g, ' ').trim()));
    if (!clean || !isIdentitySeg(clean)) continue;
    // v75: deutsche Fragmente, Fremdpersonen, Anatomie, Kamera-Junk raus
    if (!isCleanIdentityFragment(clean)) continue;
    const k = low(clean);
    if (seen.has(k)) continue;
    seen.add(k); out.push(clean);
  }
  // v75: Haarfarbe aus deutschen Profilfeldern immer ergänzen (falls keine EN-Haarfarbe vorhanden)
  if (!out.some((s) => /\b(hair|haired|blonde|brunette|redhead|auburn)\b/i.test(s))) {
    const profileText = [
      pl.hair, pl.typ, pl.style, pl.details, cl.hair, resolved.styleText,
    ].map((t) => String(t || '')).join(' ');
    const hair = extractHairFromGerman(profileText);
    for (const h of hair) if (!out.some((s) => low(s) === low(h))) out.unshift(h);
  }
  return out;
}

/** Gender aus persona.gender (bevorzugt) oder look.typ ableiten */
function genderOf(profile = {}, card = null) {
  const pg = String(profile.persona?.gender || '').toLowerCase();
  if (pg === 'male' || pg === 'm') return { noun: 'adult man', pronoun: 'his' };
  if (pg === 'female' || pg === 'f') return { noun: 'adult woman', pronoun: 'her' };
  const t = String(profile.persona?.look?.typ || profile.look?.typ || card?.data?.extensions?.jeffa?.look?.typ || '').toLowerCase();
  if (/\bmann\b|\bman\b|\bmale\b|\bherr\b/.test(t)) return { noun: 'adult man', pronoun: 'his' };
  return { noun: 'adult woman', pronoun: 'her' };
}

/** v78: Subjekt-Helfer (noun + Label) für alle Aufrufer */
export function subjectOf(profile = {}, card = null) {
  const g = genderOf(profile, card);
  const sex = g.noun === 'adult man' ? 'man' : 'woman';
  return { noun: g.noun, label: 'The ' + sex, pronoun: g.pronoun, sex };
}

const SLOT_PATTERNS = {
  eyes: /\b(eyes|augen|iris)\b/i,
  hair: /\b(hair|haare|ponytail|bob|braid|curls|blonde|brunette|redhead|auburn)\b/i,
  skin: /\b(skin|haut|freckles|sommersprossen|pale|tanned?|fair|glowing|smooth)\b/i,
  body: /\b(\d{2,3} cm|tall|petite|slim|curvy|cup bust|hourglass|figure|bust|hips|waist|build)\b/i,
  tattoos: /\b(tattoo)\b/i,
  piercings: /\b(piercing|nipple ring|barbell|christina|clitoral)\b/i,
  face: /\b(face|brows|lips|nose|jaw|cheekbones|glasses|brille|eyes?)\b/i,
};

/**
 * Baut den finalen Identitätsblock. Regeln:
 * - Erste Zeile: "<noun>, N years old" (NIE <21)
 * - danach: face, hair, eyes, skin, body, tattoos, piercings – Reihenfolge stabil
 * - keine Kleidungs-Wörter, keine Alters-Ranges
 */
export function buildIdentity({ profile = {}, resolved = {}, card = null, adult = null } = {}) {
  const notes = [];
  const { age, note: ageNote } = resolveAge(profile, resolved);
  if (ageNote) notes.push(ageNote);
  const { noun } = genderOf(profile, card);
  // v78: Alters-Optik – immer "looks exactly N years old" (N >= 21)
  const segs = collectIdentitySegs(profile, resolved, card);

  // nicht-18+-Profile: FSK18-Merkmale aus der Identität entfernen
  const isAdultProfile = profile.adult === true || profile.fsk === true || profile.fsk18 === true;
  // v81: Request-`adult` ist maßgeblich; Herabstufen nur bei ausdrücklicher Profil-Sperre.
  const explicitlyNever = profile.adult === 'never' || profile.adultMode === false;
  const allowFsk = adult === true ? !explicitlyNever : (adult === false ? false : isAdultProfile);
  const visible = allowFsk ? segs : segs.filter((s) => !FSK18_ID_RX.test(s));

  const buckets = { face: [], hair: [], eyes: [], skin: [], body: [], tattoos: [], piercings: [] };
  for (const s of visible) {
    let placed = false;
    for (const [k, rx] of Object.entries(SLOT_PATTERNS)) if (rx.test(s)) { buckets[k].push(s); placed = true; break; }
    if (!placed) buckets.face.push(s);
  }
  const nameKey = low(String(profile.name || profile.id || ''));
  const lines = [`${noun}, looks exactly ${Math.max(21, +age || 21)} years old`];
  const picked = new Set([low(lines[0])]);
  // v75: mittelalterliche Floskel vermeiden, wenn numerisches Alter gewählt wurde
  const hasNumericAge = /^\d+$/.test(String(age));
  // v75: Skin-Konflikt – "fair glowing skin" vs. "tanned skin"; explizite Skin-Angabe gewinnt
  const skinTexts = buckets.skin.slice();
  const winningSkin = skinTexts.find((s) => /tanned/i.test(s)) ||
    skinTexts.find((s) => /\bfair\b/i.test(s)) ||
    skinTexts[0];
  const skinFiltered = winningSkin ? [winningSkin] : [];
  for (const k of ['face', 'hair', 'eyes', 'skin', 'body', 'tattoos', 'piercings']) {
    const src = k === 'skin' ? skinFiltered : buckets[k];
    for (const s of src) {
      const key = low(s);
      if (nameKey && key === nameKey) continue;
      if (/^(adult )?(woman|man|frau|mann)$/.test(key) || /^(adult (woman|man)|looks about \d+|looks exactly \d+ years old|\d+ years old|in (her|his) \d0s)$/.test(key)) continue;
      if (hasNumericAge && /middle[- ]aged|mid[- ]\d0s|elderly/i.test(key)) continue;
      if (picked.has(key)) continue;
      if (lines.some((l) => low(l) === key)) continue;
      picked.add(key); lines.push(s);
    }
  }
  return {
    identity: lines.join(', '),
    age,
    name: String(profile.name || profile.id || ''),
    notes,
  };
}

/**
 * Default-Outfit-Kandidat aus Profil-texten (beschreibende Kleidung aus style/beschreibung).
 * Wird nur aktiv, wenn Story nichts sagt UND kein Dropdown-Outfit gewählt ist.
 */
export function collectDefaultOutfitSegs(profile = {}, resolved = {}) {
  const pool = [
    resolved.styleText, resolved.look, resolved.identity,
    profile.persona?.look?.style, profile.persona?.look?.details, profile.persona?.look?.hair,
    profile.description,
  ].map((t) => String(t || ''));
  const out = [];
  for (const txt of pool) {
    for (const s of splitSegs(txt)) {
      if (!CLOTHING_RX.test(s)) continue;
      if (/\b(parkplatzsex|liebe|mag|zeigt|grins\w*|lächelt|smile)\b/i.test(s)) continue;
      if (RANGE_RX.test(s)) continue;
      out.push(tidy(deToEn(s)));
    }
  }
  return dedupe(out);
}

export { figureText, genderOf, CLOTHING_RX, FSK18_ID_RX };
