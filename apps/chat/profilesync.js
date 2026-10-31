// v47 AP8+AP9: keep free-text identity and controls consistent. Pure, deterministic (no LLM).
// Identity text describes WHO she is. Clothing, light and place belong to the photo controls;
// bust and build belong to the Figur sliders, so they are removed from free text.
const OUTFIT_MAP = [[/\bbikini\b/i, 'bikini'], [/\blatex\b/i, 'latex'], [/evening dress|abendkleid/i, 'abendkleid'], [/swimsuit|badeanzug/i, 'badeanzug'], [/\brobe\b|morgenmantel/i, 'bademantel'], [/summer dress|sommerkleid/i, 'sommer'], [/\b(nude|naked|nackt)\b/i, 'nackt']];
const OUTFIT_ANY = /\b(wearing|outfit|dress|bikini|latex|lingerie|catsuit|stockings|heels|swimsuit|robe|shirt|top|panties|thong|kleid|dessous|unterwäsche|trägt)\b/i;
const LIGHT_MAP = [[/golden hour|goldene stunde/i, 'golden'], [/\bneon\b/i, 'neon'], [/candle|kerzen/i, 'kerzen'], [/\bflash\b|blitz/i, 'blitz'], [/window light|fensterlicht/i, 'fenster'], [/daylight|tageslicht/i, 'tag']];
const LIGHT_ANY = /golden hour|goldene stunde|\b(lighting|beleuchtung|licht)\b|\b(soft|studio|warm|natural|dim|golden|neon|candle|window|day|rim|back|moody)\s*light\b/i;
const PLACE_MAP = [[/\bbed(room)?\b|schlafzimmer/i, 'schlafzimmer'], [/\bbeach\b|\bstrand\b/i, 'strand'], [/\bpool\b/i, 'poolnacht'], [/hotel room/i, 'hotel'], [/\bsauna\b|\bspa\b/i, 'spa'], [/parking lot/i, 'parkplatz'], [/\bkitchen\b/i, 'loft'], [/\brooftop\b/i, 'dach'], [/concrete wall|betonwand/i, 'betonwand']];
const PLACE_ANY = /\b(background|setting|hintergrund|backdrop)\b|\b(bedroom|on a bed|beach|pool|hotel room|sauna|parking lot|kitchen|rooftop|concrete wall)\b/i;
export const BUST_RX = /\s*\b(with\s+)?(an?\s+)?((very|extremely|super|rather|quite)\s+)?(small|tiny|medium|average|big|large|huge|enormous|massive|full|heavy|ample|perky|natural)(\s+(full|round|natural|perky|heavy))?\s+(bust|breasts|boobs|chest|brüste|oberweite)\b|\s*\b[a-h]{1,2}[- ]?(cup|körbchen)(\s+bust)?\b|\s*\bbusty\b/gi;
export const BUILD_RX = /\b((very|extremely|sehr)\s+)?(petite|slim|slender|skinny|thin|curvy|curvaceous|voluptuous|athletic|chubby|plump|zierlich|schlank|kurvig|mollig|sportlich)\b\s*/gi;

const first = (map, s) => (map.find(([rx]) => rx.test(s)) || [])[1];
const tidy = (s) => s.replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').replace(/^[\s,;.]+|[\s,;]+$/g, '').replace(/,\s*,/g, ',');

/** split free text into clauses; drop clothing/light/place clauses (-> controls), strip bust/build words */
export function textToControls(text = '') {
  const controls = {}, moved = [];
  const kept = String(text).split(/(?<=[,;.])\s*/).filter(c => {
    const s = c.replace(/[,;.]\s*$/, '');
    if (!s.trim()) return false;
    if (OUTFIT_ANY.test(s)) { controls.outfit ??= first(OUTFIT_MAP, s); moved.push(s.trim()); return false; }
    if (LIGHT_ANY.test(s)) { controls.light ??= first(LIGHT_MAP, s); moved.push(s.trim()); return false; }
    if (PLACE_ANY.test(s)) { controls.scene ??= first(PLACE_MAP, s); moved.push(s.trim()); return false; }
    return true;
  });
  for (const k of Object.keys(controls)) if (!controls[k]) delete controls[k];
  const out = tidy(stripBody(kept.join(' ')));
  return { text: out, controls, moved };
}

/** remove bust/build wording only (sliders own these) */
export function stripBody(text = '') { return tidy(String(text).replace(BUST_RX, '').replace(BUILD_RX, '')).replace(/\b(an?) (adult)/gi, (m, a, b) => (/^[aeiou]/i.test(b) ? 'an ' : 'a ') + b); }

/** on save: clean identity fields, fill empty photo controls from detected words; returns list of moved clauses */
export function syncProfileText(profile) {
  const L = profile.persona?.look || {}, lk = profile.looks || {}, P = profile.photo = { ...(profile.photo || {}) }, moved = [];
  const fix = (o, k) => { if (typeof o[k] !== 'string' || !o[k]) return; const r = textToControls(o[k]); o[k] = r.text; moved.push(...r.moved); for (const [c, v] of Object.entries(r.controls)) if (!P[c]) P[c] = v; };
  for (const k of ['typ', 'style', 'details']) fix(L, k);
  fix(lk, 'refLook');
  if (Array.isArray(L.special)) L.special = L.special.map(s => textToControls(s).text).filter(Boolean);
  return moved;
}
