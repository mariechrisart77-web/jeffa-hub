// v69 Abgleich: Konsistenz-Prüfung zwischen Dropdown (explizite Auswahl), Story (Chat/Composer) und Profil-Defaults.
// Pure, node-testbar, keine Abhängigkeiten. Wird in buildImagePlan NACH dem Composer/Story/Dropdown-Merge
// und VOR assemblePrompt aufgerufen; assemblePrompt bekommt die bereinigte Identität per L-Override.
//
// Priorität (fest): Dropdown (resolved.photo.* / photoOverride) > Story (Composer parts / Chat) > Profil-Defaults.
// Regeln sind tabellengetrieben: { id, test, fix, warn }.

const AGE_MSG = 'Profil muss eindeutig erwachsen sein (21+)';
const MAX_WARN = 6;

// ---------- Hilfen ----------
const low = (t) => String(t == null ? '' : t).toLowerCase();
const words = (t) => low(t).replace(/[^a-z0-9äöüß]+/gi, ' ').trim();

export function splitSegs(t) {
  return String(t || '').split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
}
export function joinSegs(a) {
  return a.filter(Boolean).join(', ');
}
function tidy(t) {
  return String(t || '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/(,\s*){2,}/g, ', ')
    .replace(/^[\s,;.]+|[\s,;.]+$/g, '')
    .trim();
}
/** Segment aus einem Prompt-Text entfernen (Komma-getrennt), Rest getidy't */
export function dropSegs(text, segs) {
  const kill = new Set(segs.map((s) => low(s.trim())));
  return tidy(splitSegs(text).filter((s) => !kill.has(low(s))).join(', '));
}
function uniqueWarn(list) {
  const seen = new Set(), out = [];
  for (const w of list) {
    const k = low(w);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(String(w).trim());
    if (out.length >= MAX_WARN) break;
  }
  return out;
}

// ---------- Alter ----------
// Numerisches Profilalter (persona.look.age) – nur das zählt als Quelle der Wahrheit.
export function personaAge(profile) {
  const a = +(profile?.persona?.look?.age ?? profile?.look?.age ?? 0);
  return Number.isFinite(a) && a > 0 ? a : 0;
}
const NUM_YEARS = /\b(\d{2})(?:[-\s]?(?:years?[-\s]old|yo|jahre|jährig\w*))\b/gi;
const LOOKS_ABOUT = /\blooks?\s+about\s+(\d{2})\b/gi;
const IN_HER = /\bin\s+(?:her|his|the)\s+(\d0)s\b/gi;
const MID_ = /\bmid\s*(\d0)s\b/gi;
const DE_NUM = /\bMitte\s+(\d0)\b/gi;
const YOUNG = /\b(young|youthful|teen(?:age)?|teenager|jugendlich\w*|jung)\b/gi;

export function ageNumbersIn(text) {
  const out = {};
  const add = (kind, n) => {
    const v = +n;
    if (!Number.isFinite(v) || v < 10 || v > 99) return;
    (out[kind] ||= []).push(v);
  };
  const t = String(text || '');
  // v75: globale Regexe vor matchAll zurücksetzen (lastIndex-Kontamination)
  const run = (rx, fn) => { rx.lastIndex = 0; for (const m of t.matchAll(rx)) fn(m); rx.lastIndex = 0; };
  run(NUM_YEARS, (m) => add('explicit', m[1]));
  run(LOOKS_ABOUT, (m) => add('looks', m[1]));
  run(IN_HER, (m) => add('range', +m[1] + 5));
  run(MID_, (m) => add('range', +m[1] + 5));
  run(DE_NUM, (m) => add('range', +m[1] + 5));
  return out;
}
/** Alle Alters-Kandidaten (nur numerisch auflösbar) + ob nur unbestimmtes Alter ("in her 20s", "young") vorliegt */
export function ageCandidates(text) {
  const nums = new Set(), segs = [];
  const t = String(text || '');
  for (const kind of Object.keys(ageNumbersIn(t))) for (const n of ageNumbersIn(t)[kind] || []) nums.add(n);
  for (const s of splitSegs(t)) {
    const a = ageNumbersIn(s);
    const list = Object.values(a).flat();
    if (list.length) segs.push({ seg: s, kind: 'numeric', ages: list });
    else if (/\b(in her \d0s|mid \d0s|early \d0s|late \d0s|young|youthful)\b/i.test(s)) segs.push({ seg: s, kind: 'ambiguous', ages: [] });
  }
  return { nums: [...nums], segs };
}
function hasExplicit21Plus(text) {
  const { nums } = ageCandidates(text);
  return nums.some((n) => n >= 21);
}
function identityAgePhrase(age) {
  return `looks exactly ${Math.max(21, Math.round(age))} years old`;
}

// ---------- FSK18 ----------
const FSK18_SEGS = [
  /full\s+[a-z]-cup\s+bust/i, /[a-z]-cup\s+bust/i, /\b(?:big|huge|massive|full|heavy|ample)\s+bust\b/i,
  /\bsideboob\b/i, /\bunderboob\b/i, /\bnipple\w*/i, /\bpeirced\s+nipple\w*/i, /\bpiercing\b/i,
  /\bnude\b/i, /\bnaked\b/i, /\b(?:sheer|fishnet)\s+bodystocking/i, /\blingerie\b/i, /\blatex\b/i,
  /\bcatsuit\b/i, /\bharness\s+top\b/i, /\bsee-through\b/i, /\bmicro\s+bikini/i,
];

// ---------- Positionen ----------
const POS_KIND = [
  [/\bstanding\b|\bsteht\b|\bstand\b/i, 'standing'],
  [/\bsitting\b|\bsitzt\b|\bsits\b|\bsit\s+down\b/i, 'sitting'],
  [/\blying\b|\blies?\b|\bliegt\b|\bon\s+(?:her|the)\s+back\b/i, 'lying'],
  [/\bkneel(?:ing)?\b|\bkniet\b|\bknien\b/i, 'kneeling'],
  [/\bwalking\b|\bläuft\b|\bgeht\b|\bwalks?\b/i, 'walking'],
];
export function positionOf(text) {
  const hits = [];
  for (const [rx, kind] of POS_KIND) if (rx.test(String(text || ''))) hits.push(kind);
  return hits;
}
// Handplatzierung: Segment muss "hand"/"hands"/"arm" enthalten UND einen Ort/Ziel
const HAND_RX = /\b(hand|hands|arm|arms)\b/i;
const HAND_TARGET = /\b(on|in|at|über|over|around|to)\s+(her\s+|the\s+)?(knee|knees|thigh|thighs|hip|hips|hair|face|cheek|chin|shoulder|shoulders|chest|waist|arm|arms|wrist|neck|mouth|lips|head|phone|drink|glass|towel|book|wall|door|table|bed|sofa|surface)\b/i;
const MOTION_RX = /\b(falling|falls|fall\b|drops?|dropping|throwing|throws?|jumping|jumps?|jump\b|running|runs?|climbing|climbs?|collapsing|sliding|slides?|rushing|leaping|leaps?)\b/i;
const END_STATE = [
  [/\b(falling|falls|fall|dropping|collapsing)\b.*\b(?:onto|on|into)\s+(the\s+)?(sofa|couch|bed|floor|ground|sand|grass|water)\b/i, (m) => `lying on the ${m[3] || m[4] || 'sofa'}`],
  [/\bsitting\s+down\b|\bsits\s+down\b|\bsetting\s+down\b/i, () => 'sitting'],
  [/\blaying\s+down\b|\blies\s+down\b|\blay\s+down\b|\blie\s+down\b/i, () => 'lying down'],
];
function staticPose(text) {
  let t = String(text || '');
  for (const [rx, fn] of END_STATE) t = t.replace(rx, (...args) => fn(args));
  // einzelnes "jumping" ohne Kontext bleibt "mid-jump" (kann allein stehen)
  t = t.replace(/\bjumping\b|\bjumps\b/gi, 'mid-jump');
  return t;
}

// ---------- Kern ----------
export function abgleich({ profile = {}, resolved = {}, photo = {}, parts = {}, story = null, adult = false, msgs = [] } = {}) {
  const warnings = [];
  const P = { ...(parts || {}) };
  const R = resolved || {};
  const ph = photo || R.photo || {};
  const ST = story || {};
  const age = personaAge(profile);

  // Bereinigtens Identitätsobjekt (wird an assemblePrompt per L-Override übergeben)
  let identity = String(R.identity || R.look || '');

  // ---------- Regel 1: Alter ----------
  {
    // 21+-Sperre auf dem Adult-Pfad
    if (adult) {
      const nums = [];
      for (const m of identity.matchAll(LOOKS_ABOUT)) nums.push(+m[1]);
      for (const m of identity.matchAll(NUM_YEARS)) nums.push(+m[1]);
      const explicit21 = nums.some((n) => n >= 21);
      const ambiguousOnly = !explicit21 && /\b(in her \d0s|early \d0s|mid \d0s|young|youthful)\b/i.test(identity);
      if (!explicit21 && (ambiguousOnly || age && age < 21)) {
        return { parts: P, identity, warnings, block: { code: 'not_adult', message: AGE_MSG } };
      }
    }
    // Widerspruch: mehrere numerische Altersangaben
    const segs = splitSegs(identity);
    const ageSegs = [];
    for (const s of segs) {
      const a = ageNumbersIn(s);
      const arr = Object.values(a).flat();
      if (arr.length) ageSegs.push({ seg: s, value: Math.max(...arr) });
      else if (/\b(in her \d0s|mid \d0s|young|youthful)\b/i.test(s)) ageSegs.push({ seg: s, value: 0 });
    }
    if (ageSegs.length > 1) {
      // Ziel: das Segment, dessen Zahl dem Profilalter entspricht; sonst die höchste ≥21 (Adult-Pfad: kein Youthful hinzufügen)
      let keep;
      if (age > 0) keep = ageSegs.find((x) => x.value === age) || ageSegs.filter((x) => x.value > 0).sort((a, b) => b.value - a.value)[0];
      else keep = ageSegs.filter((x) => x.value >= 21).sort((a, b) => b.value - a.value)[0] || ageSegs[0];
      if (!keep) keep = ageSegs[ageSegs.length - 1];
      const drop = ageSegs.filter((x) => x !== keep);
      // Widerspruch nur wenn Zahlen sich unterscheiden (Mitte 20 vs looks about 25 sind sich einig)
      const conflict = drop.some((d) => d.value && keep.value && Math.abs(d.value - keep.value) > 5);
      if (drop.length) {
        identity = joinSegs(segs.filter((s) => !drop.some((d) => d.seg === s)));
        if (adult && keep.value > 0 && keep.value < 21) {
          // Adult-Pfad + jugendliches Restalter → numerische Alter-Phrase erzwingen
          identity = identity.replace(new RegExp(keep.seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), identityAgePhrase(age || 25));
        }
        if (conflict) warnings.push(`Alter widersprüchlich („${drop.map((d) => d.seg).join('“ / „')}“ vs. „${keep.seg}“) – verwendet: ${keep.seg}`);
      }
    }
    // Narrative Jugend-Wörter entfernen, auf dem Adult-Pfad durch numerische Phrase ersetzen
    if (adult && /\b(in her \d0s|early \d0s|mid \d0s|young|youthful)\b/i.test(identity)) {
      const n = age && age >= 21 ? age : 25;
      identity = identity
        .replace(/\b(?:in|of)\s+(?:her|his|the)\s+\d0s\b/gi, '')
        .replace(/\b(early|mid|late)\s+\d0s\b/gi, '')
        .replace(/\b(young|youthful)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+,/g, ',');
      if (!/looks about \d{2}/i.test(identity)) identity = identity + ', ' + identityAgePhrase(n);
      identity = tidy(identity);
    }
  }

  // ---------- Regel 2: Nicht-18+-Pfad ----------
  if (!adult) {
    const hitSegs = [];
    const filtered = splitSegs(identity).filter((s) => {
      const hit = FSK18_SEGS.some((rx) => rx.test(s));
      if (hit) hitSegs.push(s);
      return !hit;
    });
    const removed = [];
    for (const k of Object.keys(P)) {
      if (typeof P[k] !== 'string' || !P[k]) continue;
      for (const s of splitSegs(P[k])) {
        if (FSK18_SEGS.some((rx) => rx.test(s))) { hitSegs.push(s); removed.push({ k, s }); }
      }
    }
    if (removed.length) for (const { k, s } of removed) P[k] = dropSegs(P[k], [s]);
    if (hitSegs.length) {
      identity = joinSegs(filtered);
      warnings.push(`FSK18-Details aus dem Profil für dieses Bild entfernt (Profil nicht 18+): ${hitSegs.slice(0, 4).join(' / ')}`);
    }
  }

  // ---------- Dropdown-Werte (Priorität 1) ----------
  const ddOutfit = String(ph.outfit || '').trim();
  const ddPose = String(ph.pose || '').trim();
  const ddScene = String(ph.scene || '').trim();

  // ---------- Regel 3: Outfit ----------
  {
    const storyOutfit = String((ddOutfit ? ST.outfit || P.outfit : P.outfit || ST.outfit) || '').trim();
    const profileOutfit = String(R.outfitText || R.outfitKeyword || R.defaults?.outfit || '').trim();
    if (ddOutfit) {
      // Dropdown ersetzt Story/Composer-Outfit
      // v75 (f): identische Texte nach Normalisierung sind KEIN Widerspruch → keine Notiz
      const norm = (s) => low(s).replace(/\s+/g, ' ').trim();
      if (storyOutfit && norm(storyOutfit) !== norm(ddOutfit) && !norm(storyOutfit).includes(norm(ddOutfit))) {
        warnings.push(`Kleidung: Auswahl „${ddOutfit}“ hat Vorrang vor der Story („${storyOutfit}“)`);
      }
      P.outfit = ddOutfit;
    } else if (storyOutfit) {
      P.outfit = storyOutfit;
      if (profileOutfit && low(profileOutfit) !== low(storyOutfit)) {
        warnings.push(`Kleidung: Story-Outfit „${storyOutfit}“ hat Vorrang vor Profil-Default „${profileOutfit}“`);
      }
    } else if (R.defaults?.outfit) {
      P.outfit = String(R.defaults.outfit); // nur der echte Default, nie der (oft deutsche) Profil-Freitext
    }
    // Outfit-Zustand aus der Story behalten
    if (!P.outfit_state && ST.outfit_state) P.outfit_state = ST.outfit_state;
  }

  // ---------- Regel 4: Pose vs. Action ----------
  {
    const poseText = ddPose || String(P.pose || '').trim();
    const actionText = String(P.action || '').trim();
    const sceneText = String(P.scene || '').trim();
    if (ddPose) {
      // Dropdown-Pose gewinnt: widersprüchliche Positions-/Bewegungssätze aus Action/Scene entfernen
      const ddKinds = new Set(positionOf(ddPose));
      const keepActionParts = [];
      const dropped = [];
      for (const s of splitSegs(actionText)) {
        const kinds = positionOf(s);
        const moves = MOTION_RX.test(s);
        const handRepeat = HAND_RX.test(s) && HAND_TARGET.test(s); // Hand-Sätze in Action entfernen (Regel 5 zieht nach)
        if ((kinds.length && kinds.some((k) => !ddKinds.has(k))) || moves || handRepeat) dropped.push(s);
        else keepActionParts.push(s);
      }
      if (dropped.length) {
        P.action = tidy(keepActionParts.join(', '));
        warnings.push(`Pose: Auswahl „${ddPose}“ ersetzt „${dropped.join(', ')}“ aus der Story`);
      }
      P.pose = ddPose;
    } else {
      // Ohne Dropdown: Motion-Verb → statischer Endzustand; genau EINE Position
      let pose = staticPose(poseText);
      let action = staticPose(actionText);
      const poseKinds = positionOf(pose);
      const actionKinds = positionOf(action);
      if (poseKinds.length && actionKinds.length && !actionKinds.every((k) => poseKinds.includes(k))) {
        // Widerspruch: Pose bleibt, Action-Positionssätze fallen
        const confl = splitSegs(action).filter((s) => positionOf(s).some((k) => !poseKinds.includes(k)));
        action = dropSegs(action, confl);
      } else if (!poseKinds.length && actionKinds.length) {
        // Nur die Action beschreibt eine Position → als Pose übernehmen, Action kürzen
        pose = actionKinds.length === 1 ? actionKinds[0] : pose;
      }
      P.pose = pose;
      P.action = action;
    }
    void sceneText;
  }

  // ---------- Regel 5: Hände/Gliedmaßen (max. 1 Phrase) ----------
  {
    const buckets = ['pose', 'action', 'camera', 'expression', 'outfit'];
    const found = [];
    for (const k of buckets) {
      if (typeof P[k] !== 'string' || !P[k]) continue;
      for (const s of splitSegs(P[k])) {
        if (HAND_RX.test(s) && HAND_TARGET.test(s)) found.push({ k, s });
      }
    }
    if (found.length > 1) {
      // Dropdown-/Pose-Satz zuerst halten, dann ersten gefundenen
      const prio = ddPose ? found.filter((f) => f.k === 'pose') : [];
      const keep = prio[0] || found[0];
      const dropList = found.filter((f) => f !== keep);
      for (const d of dropList) P[d.k] = dropSegs(P[d.k], [d.s]);
      warnings.push(`Hände: nur eine Handplatzierung behalten („${keep.s}“), entfernt: ${dropList.map((d) => `„${d.s}“`).join(', ')}`);
    }
  }

  // ---------- Regel 2b: Nicht-18+-Pfad, Schlusskontrolle (auch Dropdown-Texte) ----------
  if (!adult) {
    const isHit = (x) => FSK18_SEGS.some((rx) => rx.test(x));
    for (const k of Object.keys(P)) {
      if (typeof P[k] !== 'string' || !P[k] || !isHit(P[k])) continue;
      const before = P[k];
      P[k] = tidy(splitSegs(P[k]).map((x) => (isHit(x) ? x.replace(/\s*\b(with|showing|and)\b.*$/i, '') : x)).filter((x) => x && !isHit(x)).join(', '));
      if (P[k] !== before) warnings.push(`FSK18-Details aus der Auswahl für dieses Bild entfernt (Profil nicht 18+): ${before.slice(0, 80)}`);
    }
  }

  // ---------- Regel 6: Szene ----------
  {
    const storyLoc = String(ST.location || '').trim();
    if (ddScene) {
      if (storyLoc && low(storyLoc) !== low(ddScene) && !low(ddScene).includes(low(storyLoc))) {
        warnings.push(`Szene: Auswahl „${ddScene}“ hat Vorrang vor Story-Ort „${storyLoc}“`);
        P.scene = tidy(splitSegs(P.scene).filter((x) => !low(x).includes(low(storyLoc))).join(', '));
      }
      P.background = ddScene;
    } else if (storyLoc) {
      P.background = P.background || storyLoc;
    }
  }

  // ---------- Regel 7: Composer darf keine Identitäts-/Körperdeskriptoren in Parts schreiben ----------
  {
    const FORBIDDEN = /\b(hair|haare|eyes|augen|skin|haut|age|jahre|old|years?|freckles|sommersprossen|glasses|brille|bust|breasts|boobs|chest|figure|curvy|slim|athletic|tall|short|petite|hips|thighs|skin tone)\b/i;
    // Dropdown-/Preset-Texte sind explizite Auswahl (Priorität 1) und werden nie gekürzt
    const ddSegs = new Set([ddOutfit, ddPose, ddScene].flatMap((t) => splitSegs(t)).map(low));
    const drops = [];
    for (const k of Object.keys(P)) {
      if (typeof P[k] !== 'string' || !P[k]) continue;
      for (const s of splitSegs(P[k])) if (FORBIDDEN.test(s) && !ddSegs.has(low(s))) drops.push({ k, s });
    }
    for (const d of drops) P[d.k] = dropSegs(P[d.k], [d.s]);
  }

  return { parts: P, identity: tidy(identity), warnings: uniqueWarn(warnings), block: null };
}

export { AGE_MSG as ABGLEICH_AGE_MSG };
