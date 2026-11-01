// v74 Prompt-App: kleine, reine Helfer (kein I/O). Werden von allen Sub-Modulen genutzt.
export const low = (t) => String(t == null ? '' : t).toLowerCase();
export const tidy = (t) => String(t || '')
  .replace(/\s{2,}/g, ' ')
  .replace(/\s+([,.;])/g, '$1')
  .replace(/(,\s*){2,}/g, ', ')
  .replace(/^[\s,;.]+|[\s,;.]+$/g, '')
  .trim();

export function splitSegs(t) {
  return String(t || '').split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
}
export function joinSegs(a) { return a.filter(Boolean).join(', '); }

export function dedupe(list) {
  const seen = new Set(), out = [];
  for (const x of list) {
    const k = low(String(x || '').trim());
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(String(x).trim());
  }
  return out;
}
export function dedupeText(t) { return dedupe(splitSegs(t)).join(', '); }

const AGE_PHRASE_RX = [
  /\b(?:in|of) (?:her|his) (?:early |mid |late )?(?:\d0s|twenties|thirties|forties|fifties|sixties)\b/gi,
  /\b(?:early|mid|late)[- ](?:20s|30s|40s|50s|twenties|thirties|forties|fifties|sixties)\b/gi,
  /\btwenty[- ]something\b/gi,
  /\b\d{2}[- ]years?[- ]old\b/gi,
  /\baged \d{2}\b/gi,
];
/** v87: widersprüchliche Altersangaben aus einem NICHT-Identitäts-Text entfernen (das Profilalter gilt). */
export function stripConflictingAge(text, age) {
  let t = String(text || '');
  for (const rx of AGE_PHRASE_RX) t = t.replace(rx, '');
  const n = +age;
  if (Number.isFinite(n) && n >= 30) t = t.replace(/\byoung (woman|man)\b/gi, '$1');
  return t.replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').replace(/(,\s*){2,}/g, ', ').replace(/^[\s,;.]+|[\s,;.]+$/g, '').trim();
}

export function truncateSegs(text, max) {
  const s = String(text || '');
  if (s.length <= max) return s;
  let out = '';
  for (const seg of splitSegs(s)) {
    const n = out ? out + ', ' + seg : seg;
    if (n.length > max) break;
    out = n;
  }
  return out || s.slice(0, max);
}

/** Segment(e) aus einem Text entfernen (Komma-getrennt) */
/** v87: Negative gegen den positiven Text abgleichen – Segmente entfernen, die genau das Positive verbieten.
 *  nackt → nude/naked/topless/bare breasts raus; topless → topless/bare breasts raus; Comic/Manhwa → cartoon/illustration raus.
 *  „bikini top worn“ im Positiv lässt „topless“ im Negativ ausdrücklich stehen. */
const CONF_GROUPS = [
  { pos: /\b(nude|naked|nackt|no clothes|unclothed)\b/i, kill: ['nude', 'naked', 'nackt', 'no clothes', 'unclothed', 'without clothes', 'topless', 'bare breasts', 'bare chest', 'oben ohne'] },
  { pos: /\b(topless|bare breasts|oben ohne)\b/i, kill: ['topless', 'bare breasts', 'bare chest', 'oben ohne'] },
  { pos: /\b(comic|manhwa|webtoon|illustration|ink outlines|cel shading|line art)\b/i, kill: ['cartoon', 'comic', 'illustration', 'drawing', 'anime', 'manga', 'line art', 'cel shading', 'painting', '3d render', 'cgi'] },
];
export function dropNegativeConflicts(negative, positiveText) {
  const pos = String(positiveText || '');
  if (!pos.trim()) return String(negative || '');
  const kill = new Set();
  for (const g of CONF_GROUPS) if (g.pos.test(pos)) for (const w of g.kill) kill.add(w);
  if (!kill.size) return String(negative || '');
  return splitSegs(negative).filter((s) => {
    const l = low(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    return ![...kill].some((w) => l === w || l === 'no ' + w || l === w + ' only' || l === w + ' woman' || l === w + ' body');
  }).join(', ');
}

export function dropSegs(text, segs) {
  const kill = new Set(segs.map((s) => low(String(s).trim())));
  return tidy(splitSegs(text).filter((s) => !kill.has(low(s))).join(', '));
}

/** Deutsch → Englisch; Tabellen aus v68/v69 zusammengeführt und erweitert. */
const DE_EN = [
  [/\bSommersprossen\b/gi, 'freckles'],
  [/\bSprossen\b/gi, 'freckles'],
  [/\bBrille\b/gi, 'glasses'],
  [/\bblaue Augen\b/gi, 'blue eyes'], [/\bgrüne Augen\b/gi, 'green eyes'], [/\bbraune Augen\b/gi, 'brown eyes'], [/\bgraue Augen\b/gi, 'grey eyes'],
  [/\bblonde\b/gi, 'blonde'], [/\bblond\b/gi, 'blonde'], [/\bschwarze\b/gi, 'black'], [/\bschwarzen\b/gi, 'black'],
  [/\bbraune\b/gi, 'brown'], [/\brothaarig\w*/gi, 'red-haired'], [/\brote\b/gi, 'red'], [/\brot\b/gi, 'red'],
  [/\blange\w*\b/gi, 'long'], [/\bkurze\w*\b/gi, 'short'], [/\bglatte\w*\b/gi, 'straight'],
  [/\bHaare\b/gi, 'hair'], [/\bHaaren\b/gi, 'hair'], [/\bAugen\b/gi, 'eyes'], [/\bHaut\b/gi, 'skin'],
  [/\bzierlich\w*/gi, 'petite'], [/\bschlank\w*/gi, 'slim'], [/\bkurvig\w*/gi, 'curvy'], [/\bmollig\w*/gi, 'chubby'],
  [/\bweiblich\w*/gi, 'feminine'],
  [/\bgroß\b/gi, 'tall'], [/\bklein\b/gi, 'short'],
  [/\bOberweite\b/gi, 'bust'], [/\bBrüste\b/gi, 'breasts'], [/\bFigur\b/gi, 'figure'], [/\bTaille\b/gi, 'waist'],
  [/\bTattoo(s)?\b/gi, 'tattoo$1'], [/\bNarben\b/gi, 'scars'],
  [/\bNippel\s*-?\s*Piercing\w*/gi, 'nipple piercings'],
  [/\bPiercing(s)?\b/gi, 'piercing$1'],
  [/\bgebräunte?\w*/gi, 'tanned'], [/\bFrau\b/gi, 'woman'], [/\bMann\b/gi, 'man'], [/\bMädchen\b/gi, 'woman'],
  [/\berwachsen\w*/gi, 'adult'],
  [/\bMitte (\d0)\b/gi, 'mid $1s'],
  [/\bEnde (\d0)\b/gi, 'late $1s'],
  [/\bAnfang (\d0)\b/gi, 'early $1s'],
  [/\bträgt\b/gi, 'wearing'], [/\bangezogen\b/gi, 'dressed'],
];
export function deToEn(t) {
  let o = String(t || '');
  for (const [r, v] of DE_EN) o = o.replace(r, v);
  return o;
}

/** Freitext bereinigen (Markdown-Reste, Anführungszeichen) */
export function cleanText(t, n = 400) {
  return String(t || '').replace(/[#*_`>"„“]/g, '').replace(/\s{2,}/g, ' ').trim().slice(0, n);
}

/** deterministischer RNG aus einem Seed (für Tests: 0..1) */
export function seededRandom(seed) {
  let s = (Number(seed) >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0xffffffff; };
}
