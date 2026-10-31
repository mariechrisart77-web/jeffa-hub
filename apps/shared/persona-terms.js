// v78 D3–D5: feste, gestufte Begriffe für Regler, Charakter-Chips und Kleidungsstil (DE für Menschen, EN für Prompts).
// Gestuft: |Wert| 1..5 → Begriff 1..5 (je weiter, desto stärker). 18+-Regler nur bei adult.

/** id → { L: [[de,en]×5], R: [[de,en]×5] } */
export const SLIDER_TERMS = {
  // Gegensätze (18+)
  g1: { L: [['eher treu', 'leaning faithful'], ['treu', 'faithful'], ['loyal, einem Partner zugewandt', 'loyal, devoted to one partner'], ['sehr treu, monogam', 'very faithful, strictly monogamous'], ['bedingungslos treu, nur ein Partner', 'unconditionally faithful, only one partner ever']],
        R: [['etwas offen', 'slightly open-minded'], ['flirtfreudig', 'flirtatious'], ['freizügig, offen für Neues', 'sexually liberal, open to new experiences'], ['sehr freizügig, offen für mehrere Partner', 'very sexually liberal, open to multiple partners'], ['hemmungslos freizügig, polyamor', 'uninhibited, openly polyamorous']] },
  g2: { L: [['eher bodenständig', 'leaning down-to-earth'], ['bodenständig', 'down-to-earth'], ['klassisch, vertraut', 'traditional, likes the familiar'], ['sehr konventionell', 'very conventional'], ['streng traditionell', 'strictly traditional']],
        R: [['leicht ausgefallen', 'slightly unconventional'], ['ausgefallen', 'unconventional'], ['experimentierfreudig', 'experimental, curious to try new things'], ['exzentrisch, sucht Kicks', 'eccentric, thrill-seeking'], ['extrem exzentrisch, kein Tabu im Rahmen des Einvernehmens', 'extremely eccentric, no taboos within consent']] },
  g3: { L: [['eher brav', 'leaning well-behaved'], ['brav', 'well-behaved'], ['angepasst, zurückhaltend', 'conforming, reserved'], ['sehr brav, regeltreu', 'very good, rule-abiding'], ['musterhaft brav, unschuldig wirkend', 'impeccably good, innocent-seeming']],
        R: [['leicht frech', 'slightly cheeky'], ['frech', 'cheeky'], ['rebellisch, provokativ', 'rebellious, provocative'], ['sehr rebellisch, bricht Regeln', 'very rebellious, rule-breaking'], ['wild rebellisch, provoziert gezielt', 'wildly rebellious, deliberately provocative']] },
  g4: { L: [['eher harmonisch', 'leaning harmonious'], ['harmoniebedürftig', 'harmony-seeking'], ['meidet Konflikte', 'avoids conflict'], ['sehr friedliebend, gibt nach', 'very peace-loving, yields easily'], ['absolut konfliktscheu', 'completely conflict-averse']],
        R: [['leicht neckend', 'lightly teasing'], ['schlagfertig', 'quick-witted, likes banter'], ['streitlustig, sucht Reibung', 'argumentative, seeks friction'], ['sehr streitlustig, provoziert', 'very combative, provokes'], ['liebt heftige Wortgefechte', 'loves fiery heated arguments']] },
  g5: { L: [['eher häuslich', 'leaning homey'], ['häuslich', 'homebody'], ['liebt Geborgenheit', 'loves cosiness and security'], ['sehr häuslich, bleibt gern daheim', 'very home-loving, prefers staying in'], ['ausgesprochen häuslich, Nest-Typ', 'thoroughly domestic, nesting type']],
        R: [['etwas unternehmungslustig', 'somewhat outgoing'], ['abenteuerlustig', 'adventurous'], ['sucht Risiko und neue Orte', 'seeks risk and new places'], ['sehr abenteuerlustig, spontan unterwegs', 'very adventurous, spontaneous traveller'], ['abenteuersüchtig, Adrenalin-Junkie', 'adventure-addicted adrenaline junkie']] },
  // Temperament (18+)
  t1: { L: [['eher sanft', 'leaning gentle'], ['zärtlich', 'tender'], ['sanft, behutsam, liebevoll', 'gentle, careful, loving'], ['sehr zärtlich, langsam', 'very tender and slow'], ['hingebungsvoll zärtlich', 'devotedly tender']],
        R: [['etwas feurig', 'a bit fiery'], ['leidenschaftlich', 'passionate'], ['wild, intensiv', 'wild, intense'], ['sehr wild, ungezügelt', 'very wild, unrestrained'], ['hemmungslos wild', 'uninhibitedly wild']] },
  t2: { L: [['eher gefühlvoll', 'leaning emotional'], ['gefühlvoll', 'emotional'], ['sucht emotionale Nähe', 'seeks emotional intimacy'], ['sehr gefühlsbetont', 'very emotionally driven'], ['Liebe vor Lust', 'love above lust']],
        R: [['etwas sinnlich', 'somewhat sensual'], ['sinnlich', 'sensual'], ['lustbetont, körperlich', 'lust-driven, physical'], ['sehr lustbetont', 'very lustful'], ['pure Lust, körperlicher Genuss', 'pure lust and physical pleasure']] },
  t3: { L: [['eher abwartend', 'leaning passive'], ['zurückhaltend', 'reserved'], ['lässt sich führen', 'likes to be led'], ['sehr devot', 'very submissive'], ['völlig hingebungsvoll devot', 'fully submissive and yielding']],
        R: [['etwas bestimmend', 'somewhat assertive'], ['führend', 'takes the lead'], ['dominant', 'dominant'], ['sehr dominant, gibt den Ton an', 'very dominant, in control'], ['streng dominant', 'strictly dominant']] },
  t4: { L: [['eher geduldig', 'leaning patient'], ['geduldig', 'patient'], ['lässt sich Zeit, steigert langsam', 'takes time, slow build-up'], ['sehr geduldig', 'very patient'], ['zelebriert jede Minute', 'savours every minute']],
        R: [['etwas ungeduldig', 'slightly impatient'], ['fordernd', 'demanding'], ['verlangend', 'craving, insistent'], ['sehr fordernd', 'very demanding'], ['unersättlich fordernd', 'insatiably demanding']] },
  t5: { L: [['eher romantisch', 'leaning romantic'], ['romantisch', 'romantic'], ['Herz und Stimmung', 'heart and mood first'], ['sehr romantisch', 'very romantic'], ['hoffnungslos romantisch', 'hopelessly romantic']],
        R: [['etwas kokett', 'a bit coquettish'], ['verführerisch', 'seductive'], ['lockt gezielt', 'deliberately alluring'], ['sehr verführerisch', 'very seductive'], ['unwiderstehlich verführerisch, femme fatale', 'irresistibly seductive femme fatale']] },
  t6: { L: [['eher schüchtern', 'leaning shy'], ['schüchtern', 'shy'], ['zögerlich, tastend', 'hesitant, tentative'], ['sehr schüchtern, errötet leicht', 'very shy, blushes easily'], ['extrem scheu', 'extremely bashful']],
        R: [['etwas offen', 'somewhat open'], ['selbstbewusst', 'self-confident'], ['direkt, sagt was sie will', 'direct, says what she wants'], ['sehr offen, schamlos ehrlich', 'very open, shamelessly honest'], ['völlig ungehemmt direkt', 'completely uninhibited and direct']] },
};

/** Stufen-Begriff für Wert -5..5. lang = 'de' | 'en'. '' bei 0 oder unbekannt. */
export function sliderTerm(id, value, lang = 'de') {
  const v = Math.max(-5, Math.min(5, Math.round(+value || 0))), t = SLIDER_TERMS[id];
  if (!v || !t) return '';
  return (v < 0 ? t.L : t.R)[Math.abs(v) - 1][lang === 'en' ? 1 : 0];
}

/** Kleidungsstil → Mini-Prompt (EN) */
export const STYLE_PROMPTS = {
  elegant: 'elegant refined fashion, tailored fitted pieces, graceful',
  sportlich: 'sporty athletic wear, fitted activewear, sneakers',
  'lässig': 'casual relaxed everyday clothes, jeans and soft tops',
  klassisch: 'classic timeless style, clean lines, neutral colours',
  modern: 'modern trendy fashion, contemporary cuts, minimalist',
  verspielt: 'playful girly style, cute patterns, light colours',
};
export const stylePrompt = (s) => STYLE_PROMPTS[String(s || '').toLowerCase().trim()] || String(s || '').trim();

/** Kompakter EN-Text der 18+-Regler für den Chat-System-Prompt (nur adult). */
export function personaChatText(persona, adult) {
  if (!persona || !adult) return '';
  const sl = [...(persona.temperament || []), ...(persona.gegensaetze || [])].map((x) => sliderTerm(x.id, x.value, 'en')).filter(Boolean);
  return sl.length ? `Temperament and attitude: ${sl.join('; ')}.` : '';
}
