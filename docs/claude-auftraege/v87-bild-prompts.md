# v87 – Bild-Prompt-Fixes (Hub-Bildpipeline + Bild-App)

Repo: Cloudflare Pages, Vanilla JS + TS Functions. Tests: `node --test tests/*.test.mjs` (Node 22, built-in test runner, `node:assert/strict`).
Alle Figuren sind fiktive Erwachsene. Jugendschutz (scrubYouth, minorRisk, jugendfrei-Filter) bleibt unverändert.

## NICHT ändern
- Die v73-Regel „gespeichertes Dropdown-Outfit/-Pose gewinnt gegen Wunsch/Story“ (reconcile, `L.outfitPicked`, Notiz „Auswahl … hat Vorrang vor der Story“). Das ist eine offene Nutzer-Entscheidung.
- Gespeicherte Profildaten (nur Prompt-Zusammenbau ändern).
- `routeModel()`-Ergebnis für adult (Tests erwarten chroma) – Spar-Mix kommt als eigener Schritt (siehe 5).

## Wichtiger Fakt (Venice-Doku, geprüft 01.11.2026)
- `negative_prompt` wird von **chroma und z-image-turbo still ignoriert**; nur qwen-image-2*/qwen-image-3*, lustify, sd35 nutzen ihn.
  → Für chroma/z-image-turbo müssen die wichtigen „Default-Negatives“ zusätzlich als kurze POSITIVE Formulierung in den Prompt (siehe 6, 1).
- qwen-image-Familie (`qwen-image-3`, `qwen-image-2-1-turbo`, …) **lehnt `width`/`height` mit HTTP 400 ab** → `aspect_ratio: "1:1"` (+ `resolution: "1K"`) senden. `flux-2-pro` ist ein Aspect-Ratio-Modell (nur `aspect_ratio`). chroma/z-image-turbo/lustify: weiter width/height.
  Der Bild-Tester hat genau so (`aspect_ratio:'1:1'`, qwen zusätzlich `resolution:'1K'`) erfolgreich generiert.

## Aufgaben

### 1. Solo-Negative nur ohne Partner
Heute: `promptapp/index.js` hängt immer NEG_SOLO an (`extra people, second person, man, crowd`), `imgsvc-plan.js` mergeNegative hängt immer `'extra people, second person, man, crowd'` an. qwen gehorcht und lässt den Partner weg.
- In `buildImagePlan`: `partner = peopleAllowed(story, msgs)` (bereits als `allowed` berechnet) → an `buildPromptPlan` als `body.partner` (bool) und `body.partnerNames` (Array der Nicht-Frau-Einträge aus `story.present`, max 3, je ≤40 Zeichen) übergeben.
  Die `allowed`-Berechnung muss dafür VOR dem `buildPromptPlan`-Aufruf stehen (ist schon so).
- Solo-Terme (`extra people, second person, man, crowd, duplicate, extra persons, clone` bzw. Male-Variante) NUR wenn `!partner` – in promptapp UND in imgsvc-plan mergeNegative UND assemblePrompt (dort gibt es schon `solo`).
- Wenn partner: kein „man“/„second person“ in den Negatives; stattdessen positive Zeile im Prompt-Abschnitt `Action` oder eigener kurzer Abschnitt `People`: z. B. `two adults in the scene: the woman and Marc, an adult man` (Namen aus partnerNames; unbekannter Name → `her adult male partner`). Bei männlichem Profil (subjectOf(profile).noun==='man') sinngemäß gespiegelt.
- Wenn solo und Modell chroma/z-image-turbo: positive Kurzform `she is alone in the picture` (male: `he is alone …`) an die Pose/Action-Sektion anhängen (Negative wirkt dort nicht).

### 2. Comic/Manhwa-Stil in „hemmungslos“ (und generell)
Heute bekommt `buildPromptPlan` den Stil nicht; im Prompt steht nichts vom Comic.
- `buildImagePlan` übergibt `style` an `buildPromptPlan` (`body.style`).
- `formatPrompt`/`buildSections` bekommen eine neue Sektion `style` (Label `Style`, prio 1 = geschützt, steht DIREKT nach Framing, also vor Identität), Text = `STYLE[style]` aus imgsvc-core (`comic`: 'western comic book art style, bold ink outlines, flat vibrant colors'; manhwa analog – nimm den vorhandenen STYLE-Eintrag; wenn nicht importierbar ohne Zirkelimport, eigene Konstante in format.js mit denselben Texten) + `, illustration, not a photo`.
  Für `real`/`story`: KEINE Style-Sektion (Verhalten unverändert).
- Bei comic/manhwa: Negative ohne `cartoon` und ohne alle NEG_ADULT_REAL-Teile (cartoon, 3d render, cgi, doll, …); stattdessen `photorealistic, photo, photograph, realistic skin texture` ins Negative. Die Quality-Zeile bei comic: `clean ink lines, high detail, no text, no letters, no speech bubbles`.
- `dedupeText`/Konflikt-Schutz: kein Negativ-Segment darf ein Wort des Stil-Textes negieren.

### 3. Widersprüche nackt/Bikini im Prompt
- Garment-Spec muss zum TATSÄCHLICH gerenderten Outfit passen: Wenn `renderOutfitPhrase(...)` „nude, no clothes“ ergibt (outfit_state nude/naked), dann `garment = GARMENT_SPECS.nude` (keine Bikini-Tags, keine `topless/bare breasts/nude`-Negatives).
- Neue Funktion `dropNegativeConflicts(negative, positiveOutfitText)` (garments.js oder util.js, exportiert): entfernt Negativ-Segmente, deren Kernbegriff im positiven Outfit-Text (outfitText + garmentTags) vorkommt (Wortgrenzen, case-insensitive; Synonyme nude/naked, topless/bare breasts). Auf die finale Negative in promptapp anwenden UND nach dem mergeNegative in imgsvc-plan (dort mit `appParts.outfit` + Prompt-Outfit-Abschnitt).
- `bikini top worn, both triangles on` (Garment-Tag UND imgsvc-plan `bikiniActive`-Zusatz) nur, wenn das finale Outfit tatsächlich ein Bikini ist UND nicht nackt. Der imgsvc-plan-Zusatz darf nicht doppelt zur promptapp-Garment-Tag hinzukommen.

### 4. Porträt-Ausschnitt erzwingt keine Pose
- Porträt-Erkennung NUR aus nutzergesteuerten Quellen: Wunsch-Szene (`body.context.scene` = sceneReq), Ausschnitt-Dropdown `res.photo.frame`, `body.camera`, `photoOverride.frame`, Pose-Dropdown, das selbst Porträt ist (z. B. 'close-up portrait, head and shoulders').
  Regex (de+en): `porträt|portrait|nahaufnahme|close-?up|kopf und schultern|head and shoulders|headshot|brustbild|gesicht in nahaufnahme`.
- Die vom LLM-Composer gelieferte `parts.camera` darf allein KEIN Porträt auslösen: enthält sie close-up/portrait, ohne dass eine der Nutzerquellen Porträt sagt, werden die close-up/portrait-Wörter entfernt (Framing bleibt Standard-Ganzkörper). (Grund: LLM schrieb „close-up“ für „kniet auf dem Bett“.)
- Ist Porträt aktiv:
  - `parts.camera` = Nutzer-Frame oder `close-up portrait, head and shoulders`; `framingFor` liefert dann den Close-up-Rahmen.
  - Pose: KEINE Intensitäts-Pose (`poseForKind/intensityPose` in imgsvc-plan überspringen), gespeicherte Dropdown-Pose wird für dieses Bild NICHT in den Prompt geschrieben (Notiz in `abgleich`: `Pose „…“ für Porträt-Ausschnitt weggelassen`); Pose-Text = `head and shoulders, facing the camera` (+ Ausdruck/Action wie gehabt). Auch `fitPoseToScene`/`wishPose`/`storyPose` dürfen danach keine Ganzkörper-Pose zurückschreiben.
  - Keine FRAMING-/Ganzkörper-Terme aus `intensityNegatives` (pinFrame) – gibt es schon für close-up, muss aber die Porträt-Erkennung oben nutzen.
  - sharpTags (Outfit-Zusätze der Intensität) bleiben erlaubt.
- Kein Porträt: Verhalten wie bisher.

### 5. Modellwahl „hemmungslos“: Spar-Mix wiederherstellen
Heute: MODEL_TABLE adult → immer chroma.
- Neue exportierte Funktion in imgsvc-core.js: `sparMixModel({ adult, quality, partner, male })` → `null` oder `{ model, cost }`:
  - nur wenn `adult` und `quality` ∈ {spar, mittel, qualitaet}
  - `partner || male` → `{ model:'chroma', cost:0.01 }` (chroma schafft als einziges zuverlässig 2 Personen)
  - solo: spar → `z-image-turbo` 0.01, mittel → `qwen-image-2-1-turbo` 0.02, qualitaet → `qwen-image-3` 0.04
- In `buildImagePlan` NACH der `allowed`-Berechnung (und nach dem v75-fsk18-Override) anwenden, wenn `route.kind==='gen'` und `!route.edit && !route.mix` und style !== 'comicpage': `route.model/cost` setzen, `route.steps = undefined`. Der v75-fsk18-chroma-Override bleibt nur für quality single/auto relevant – für spar/mittel/qualitaet gewinnt der Spar-Mix (auch wenn die Qualität aus dem Profil kommt).
  `male` = subjectOf(profile).noun === 'man' (Import aus promptapp/identity.js ist ok).
- `plannedModel` (Format-Tabelle) muss das neue Modell nutzen – also Spar-Mix VOR `buildPromptPlan` bestimmen.
- `modelLabel`/UI: apps/chat/look.js Text der Bildqualität-Auswahl anpassen: Spar „z-image-turbo allein, chroma mit Partner (FSK18)“, Mittel/Qualität analog („FSK18 mit Partner: chroma“); den Hinweis „FSK18: Bilder werden immer mit chroma gemalt …“ ersetzen durch „🔞 FSK18: allein je nach Stufe z-image/qwen, sobald ein Mann im Bild ist chroma (0,01 $)“. Jugendfrei-Qualität: „Qualität – flux-2-pro, ca. 0,03 $“ (siehe 7).

### 6. Feste Default-Negatives (+ positive Kurzform für chroma/z-image)
- Immer (alle Modi, alle Stile) früh in der Negative-Liste (VOR outfit-/sfw-spezifischen Teilen, weil Venice bei 800 Zeichen abschneidet!): `broken hands, broken fingers, bad teeth, crooked teeth, navel piercing, belly button piercing`; plus nur solo: `duplicate person, extra persons`.
  Navel-Teil NICHT, wenn Identität oder Outfit selbst navel/belly(-button) piercing / Bauchnabelpiercing nennt.
- Negative-Reihenfolge so sortieren, dass Kern (NEG_BASE-Kern, die neuen Defaults, Solo-Teil, Garment-Negatives) zuerst kommt, Wiederholungen/Varianten später; nach Dedupe ≤ 800 Zeichen für Prompt-App-Modelle (Venice schneidet bei 800). Bitte prüfen, dass bei Seraphina S1 alle neuen Defaults innerhalb der ersten 800 Zeichen landen.
- Für chroma/z-image-turbo zusätzlich am Ende der Pose/Action-Sektion (prio ≥2, nicht Quality, damit nichts weggekürzt wird) die Kurzform: `natural hands with five fingers, natural even teeth` + (wenn Navel-Default aktiv) `bare navel without jewelry`.

### 7. jugendfrei: kein qwen-image-3
Venice verpixelt qwen-image-3 bei safe_mode (Fehlalarm). flux-2-pro war im Test sauber (0,03 $).
- MODEL_TABLE: `qualitaet.safe` und `hq.safe` → `{ model:'flux-2-pro', cost:0.03 }`. Tests v42/v68, die `qwen-image-3` für safe erwarten, bewusst anpassen.
- Sicherheitsnetz: In buildImagePlan (und im Bild-App-Handler src/bild/image-handler.ts) gilt: `!adult && model === 'qwen-image-3'` → `flux-2-pro`, cost 0.03.
- `PROMPTAPP_MODELS` + `FORMAT` um `flux-2-pro` erweitern (prose, maxPrompt 1500, maxNegative 800).
- Bild-App (`src/bild/image-handler.ts`): `hq` safe → flux-2-pro 0.03; `body.model==='qwen-image-3'` bei safeMode → flux-2-pro; flux-2-pro in die erlaubte Modell-Liste für safeMode; Kosten-Mapping. apps/bild/core.js Qualitäts-Map: `qualitaet` → `adult ? 'qwen-image-3' : 'flux-2-pro'` (Server bleibt Wahrheit). apps/chat/photoopts.js QUALITY.qualitaet → model 'flux-2-pro', cost 0.03 (nur jugendfrei relevant – prüfe, wie QUALITY genutzt wird; adult bleibt Spar-Mix-Logik serverseitig). apps/hub/settings.js HQ-Label anpassen (Standard: flux-2-pro ≈ 0,03 $). apps/shared/module-models.js IMAGE_MODULE_MODELS.normal: 'qwen-image-3' → 'flux-2-pro'.
- **Größen-Parameter** (beide Generatoren: `genOne` in src/imgsvc-image.ts und `gen` in src/bild/image-handler.ts):
  - `qwen-image*` → `aspect_ratio` + `resolution:'1K'`, KEIN width/height.
  - `flux-2-pro` → nur `aspect_ratio`.
  - sonst wie bisher width/height.
  - aspect_ratio aus width/height ableiten (Bild-App: dims) → nächster erlaubter Wert aus `1:1, 3:4, 4:3, 2:3, 3:2, 9:16, 16:9` (flux: `1:1, 3:2, 16:9, 21:9, 9:16, 2:3, 3:4, 4:5`). Als kleine reine exportierte Helper-Funktion `sizeParamsFor(model, width, height)` in einer neuen Datei `src/venice-size.js` (von beiden importiert, Node-testbar).

### Nebenbefund A – kleine Oberweite verstärken (nur Prompt-Bau)
- Wenn die Identität eine kleine Oberweite nennt (`\b(AA|A)-cup\b`, `small … bust`, `flat chest`; Quelle figur.oberweite ≤ 1 bzw. Text), dann in promptapp nach `buildIdentity`:
  - dieses Segment direkt hinter `…looks exactly N years old` verschieben,
  - ergänzen um `small breasts, flat petite chest` (nicht doppelt),
  - bei `curvy`/`hourglass` in derselben Identität: `curves in the hips and waist, not the bust` anhängen,
  - Negative: `large breasts, big breasts, busty, huge breasts` (früh einsortieren; dropNegativeConflicts beachten).
  Nur wenn adult (in jugendfrei filtert FSK18_ID_RX „cup bust“ bereits – dort nur `slim petite figure` hinzufügen, keine Brust-Wörter).
### Nebenbefund B – Alter
- Das Profil-Altersfeld (resolveAge) gewinnt bereits in der Identität. Neu: Sicherheitsnetz `stripConflictingAge(text, age)` (exportiert) auf ALLE übrigen Prompt-Sektionen (scene, action, pose, mood, outfit) und auf das finale Prompt außerhalb der Identitätszeile: entfernt `in her/his 20s|30s…`, `mid[- ]twenties`, `twenty-something`, `\b\d{2}[- ]year[- ]old\b`/`aged NN`, `young woman`/`young man` wenn NN ≠ profile age; ersetzt durch nichts (Kommas aufräumen). Notiz in abgleich nur wenn etwas entfernt wurde.

## Tests (neue Datei tests/v87-bild-prompts.test.mjs)
Mit Fixture = gekürzte Kopie des Seraphina-Profils (fiktiv, im Test inline, keine echten Personen; Name „Seraphina“ ok) – nutze `buildImagePlan` aus `../src/imgsvc-core.js` mit `composeLLM: null`, `rnd: () => 0.5`. Mindestens:
1. Solo (S1-ähnlich) → Negative enthält `second person`; Partner-Szene (story.present ['the woman','Marc'], letzte Nachricht „zusammen mit ihm“) → Negative enthält weder `second person` noch `, man,`; Prompt enthält `Marc`.
2. style comic + adult → Prompt enthält `comic book`/`ink`; Negative ohne `cartoon`, mit `photorealistic`.
3. outfit_state nude → Prompt ohne `bikini top worn`, Negative ohne `nude`/`topless`; Bikini-Outfit → `bikini top worn` genau 1×.
4. Wunsch „Porträt … Nahaufnahme von Kopf und Schultern“ + gespeicherte Pose „sitting on the edge of the bed, legs spread“ → Prompt ohne `legs spread`/`edge of the bed`, Framing close-up; LLM-ähnliche camera „close-up“ ohne Porträt-Wunsch → Framing `full body`.
5. sparMixModel-Tabelle + buildImagePlan: adult spar solo → z-image-turbo; adult spar Partner → chroma; mittel solo → qwen-image-2-1-turbo; qualitaet solo → qwen-image-3; jugendfrei qualitaet → flux-2-pro; safe hq → flux-2-pro.
6. Default-Negatives vorhanden und in den ersten 800 Zeichen; Navel-Teil fehlt, wenn Identität „navel piercing“ enthält; chroma-Prompt enthält `natural hands with five fingers`.
7. sizeParamsFor: qwen-image-3 → {aspect_ratio:'1:1', resolution:'1K'} ohne width; flux-2-pro → {aspect_ratio}; chroma → {width:768?} nein: chroma → width/height wie übergeben.
8. A-cup: Identität beginnt nach dem Alter mit dem Brust-Segment; Negative enthält `large breasts`. Alter: Szene-Text „a woman in her 20s“ → nicht im Prompt.
Bestehende Tests nur anpassen, wenn das Verhalten hier bewusst geändert wird (qwen-image-3 safe → flux-2-pro; ggf. Solo-Negative-Assertions). Alle anderen 393 Tests müssen grün bleiben.

---
## QA-Log v87 (Bot, 01.11.2026)
- Claude-Job (LumiaRouter, claude-opus-5-5): 3 Aufrufe nötig. Versuch 1 brach nach 3,5k Tokens mit kaputtem JSON ab ($0.2516), Versuch 2 lieferte nur eine Rückfrage (fehlende Volltexte, $0.1947), Versuch 3 mit kompletten Dateien + Klarstellungen lieferte 48 Edits + 2 neue Dateien ($0.6055). Summe $1.05.
- Eigene Nacharbeit: Debug-Reste entfernt (plannedModel0, routeAfter, leere IIFE, busMirror/poseLine-Stubs); dropNegativeConflicts neu (Claudes Version hätte bei „bikini top worn“ „topless“ aus dem Negativ gelöscht); Altersfilter lief auf dem ganzen Prompt und hätte „looks exactly 34 years old“ aus der Identität gelöscht → jetzt vor dem Format nur auf Szene/Pose/Outfit; Negativ-Reihenfolge Defaults → Solo → (jugendfrei: SFW) → Garment → Brust → Rest, Kürzung segmentweise auf 800; SFW-Negatives stehen früh und werden in jugendfrei nie per Konfliktabgleich entfernt; Garment-Tags nicht doppelt („nude, no clothes, nude, no clothes“); positive Spiegel-Kurzform nur in promptapp (kein Doppel in imgsvc-plan), „bare navel“ nur hemmungslos; Männer-Erkennung war schon seit v78 kaputt (noun 'adult man' ≠ 'man') → jetzt `sex === 'man'`.
- Selbst ergänzt (Claude ließ es offen): sizeParamsFor in genOne (Hub) und gen (Bild-App), Bild-App HQ/Modellliste jugendfrei → flux-2-pro, UI-Texte (look.js, photoopts.js, settings.js, bild/core.js, module-models.js, site-apply.js), Kurzlabel flux-pro.
- Tests: tests/v87-bild-prompts.test.mjs (12 Tests; Claudes Tests 1/4/6/8 korrigiert), angepasst: imgsvc.test (qualitaet-Kosten 0.03), v42 + v68-prompt (safe qualitaet/hq → flux-2-pro). Gesamt 405/405 grün, tsc grün.
- Nicht geändert (Vorgabe): v73-Regel Wunsch-Outfit/Pose vs. gespeichertes Dropdown.
