# Bild-Abgleich v83 – Identität, Szene, Pose/Kleidung/Umgebung

Dieses Dokument beschreibt die Abgleich-Logik der Bild-Pipeline in der Fassung v83.
Alle Funktionen sind rein (kein I/O), getestet über `node --test tests/*.test.mjs`.

## Harte Grenzen (unverändert)

- **Jugendschutz** bleibt vor jedem Abgleich: `minorRisk`, `youthRisk`, `scrubYouth` und die 21+-Sperre in `buildImagePlan`/`abgleich`/`buildPromptPlan`. Das gewählte Alter ist immer ≥ 21; wenn irgendeine Rohangabe < 21 ist oder `minorRisk` greift, bleibt der Block bestehen – auch wenn ein Einstellungsfeld ≥ 21 sagt.
- **Modus**: `adult` (Request-Flag nach `enforceImageMode`) ist maßgeblich. Herabgestuft wird nur bei `profile.adult === 'never'` oder `profile.adultMode === false`. `profile.adult|fsk|fsk18 === false` stuft NICHT herab.
- **Christians v73-Regel**: Eine Dropdown-Kleidung (`resolved.photo.outfit` / `photoOverride.outfit`) hat Vorrang vor Story-/Chat-Kleidung. Ausnahme nur im Modus jugendfrei, wenn nach dem FSK18-Filter kein echtes jugendfreies Kleidungsstück mehr übrig bleibt (Aufgabe 4).
- **Keine Extra-Personen**: Der Personenfilter läuft weiterhin nach jedem Abgleich.

## Aufgabe 1 – Ein Wert pro Merkmal (Identität)

Merkmale mit genau EINEM Wert: Alter, Haarfarbe, Hautton, Körpergröße (cm), Oberweite (Cup).

Priorität (höhere Quelle gewinnt):
1. **Profil-Einstellungsfeld**: `persona.look.age`, `persona.look.hair`, `persona.look.skin`/`details`, `persona.figur.groesse|oberweite`.
2. **Charakterkarte**: `card.data.extensions.jeffa.look|figur`.
3. **Freitext**: `persona.look.typ`, `resolved.identity` / `resolved.look`.

- Alter: `resolveAge` wählt das Einstellungsfeld (immer ≥ 21). Freitext-Segmente mit abweichendem Alter (> 5 Jahre, z. B. „looks about 25“, „in her 20s“) fliegen raus; Alterszeile ist immer „looks exactly N years old“.
- Haarfarbe/Hautton/Größe/Cup: Bei zwei verschiedenen Werten bleibt der Wert aus dem Einstellungsfeld, die anderen Segmente werden **entfernt**. Ohne Feld gewinnt die erste Quelle.
- Konservativ: Nur echte Widersprüche desselben Merkmals werden entfernt; alle anderen Segmente bleiben.
- Hinweise (deutsch), z. B. `Hautton: „tanned skin“ gilt (Einstellungsfeld) – „fair glowing skin“ entfernt`.
- Der Alters-Widerspruch wird in buildImagePlan nur noch EINMAL gemeldet (der doppelte Hinweis aus `abgleich()` entfällt, wenn die Prompt-App schon einen meldet).
- `abgleich()` selbst ist unverändert (21+-Sperre, Jugendwörter).

Umsetzung: `src/promptapp/reconcile-identity.js` (`reconcileIdentitySegs(segs, { profile, card, age, fieldSegs })` → `{ segs, notes }`), aufgerufen in `buildIdentity`.
Hinweis: Claudes erster Entwurf entfernte zu viel (z. B. alle Segmente mit „lang…“/„rot…“) und wurde in der QA durch diese konservative Fassung ersetzt.

## Aufgabe 2 – Wunsch-Szene hat Vorrang

`src/promptapp/consistency.js` mit `resolveSceneTarget({ wish, override, savedScene, parts, story, msgs })` → `{ scene, location, pose, source, locked, prevLocation }`.

Priorität:
1. `photoOverride.scene` dieses Requests (einmalige Auswahl)
2. Wunsch-Szene des Nutzers (`body.context.scene`)
3. aktueller Composer-Moment (`parts.background` / `parts.scene`) und neueste Chatnachricht
4. gespeicherter Story-Ort
5. gespeicherte Dropdown-Szene `resolved.photo.scene`
6. Profil-Default-Ort

Ortserkennung über `SCENE_MAP` (scene-map.js). Nennt die Wunsch-Szene keinen bekannten Ort, gilt der Composer-Hintergrund – NICHT ältere Chatnachrichten/Story.

- buildImagePlan übergibt die Wunsch-Szene, buildPromptPlan nutzt `resolveSceneTarget`; ein roher deutscher Chat-Satz landet nicht mehr als Szene im Prompt.
- Story-Erkennung: Segmente älteste → neueste (alte Nachrichten, Story-Ort, Composer-Parts, Wunsch-Szene).
- `storyStep`/`ruleComposer`: Ortserkennung zusätzlich über `SCENE_MAP`; bei Ortswechsel werden `action`/`pose` verworfen, wenn die neue Nachricht keine eigenen liefert.
- Gespeicherte Dropdown-Szene gilt nur, wenn die Wunsch-Szene keinen Ort nennt (`photoOverride.scene` gilt immer).
- Composer-Input kennzeichnet die Wunsch-Szene als höchste Priorität; der gespeicherte `setting:`-Fixtext wird weggelassen, wenn die Wunsch-Szene einen Ort nennt.
- Rückgabe-`story` wird mit dem aufgelösten `location` aktualisiert (bei Ortswechsel ohne neue Pose: `action`/`pose` geleert).
- Nennt die Wunsch-Szene eine Haltung („sie steht zwischen den Bücherregalen“, „sie sitzt im Sand“), schlägt sie die gespeicherte Dropdown-Pose. Eine einmalige Pose-Auswahl (`photoOverride.pose`) gewinnt weiterhin. Im Modus hemmungslos bleiben ortsunabhängige Details der Dropdown-Pose erhalten (z. B. „legs spread“).

## Aufgabe 3 – Pose/Kleidung/Umgebung gegen die Szene

`fitPoseToScene({ pose, action, location, sceneText, adult })` → `{ pose, action, notes }`.

- Requisiten-Tabelle `PROPS` (Auto, Bett, Sofa, Schreibtisch, Tisch, Bank, Geländer, Pool, Dusche, Küchentheke, Bücherregal, Sand) mit erlaubten Orten.
- Nennt Pose/Action ein ortsfremdes Requisit → nur das ortsgebundene Segment wird ersetzt (Tabelle SIT_AT/STAND_AT/LIE_AT/LEAN_AT); ein Segment ohne Körperhaltung (z. B. „hand on the car hood“) entfällt. Nennt die Szene das Requisit selbst (z. B. Parkplatz mit Auto), bleibt es.
- Gilt für Dropdown-Pose und Story-Pose, in beiden Modi. In jugendfrei filtert danach der bestehende SFW-Filter.
- Kleidung: Enthält ein Outfit-Text ein getragenes Kleidungsstück UND alleinstehende `nude`/`naked`-Segmente, gewinnt das Kleidungsstück (`reconcileOutfitNudity` in garments.js). `classifyOutfit`/`specFor` liefern in diesem Fall kein `nude`. Garment-Tags, die schon im Outfit stehen, werden nicht doppelt angehängt (`dedupeGarmentTags`).

## Aufgabe 4 – Outfit in jugendfrei

Nach dem FSK18-Filter (`guardAdult`, `abgleich` Regel 2/2b, `stripFsk18`, `applySfwToParts`) bleibt nur ein echtes jugendfreies Kleidungsstück im Outfit (dress|skirt|jeans|…|one-piece swimsuit; NICHT bikini/latex/lingerie/string/thong).

Bleibt kein Kleidungsstück übrig, wird ersetzt (Reihenfolge): Wunsch-Szene → Story-Outfit (wenn jugendfrei-tauglich) → Profil-Default → szenenpassender Standard (Strand: light summer dress, Büro: smart blouse and skirt, sonst casual summer outfit). Notiz:
`Kleidung: Auswahl im Modus jugendfrei komplett gefiltert – verwendet: „red summer dress“ (Wunsch-Szene)`.

SFW-Rest-Phrasen (`skimpy`, `barely concealed`, `through the thin fabric`, `distinct bumps`, `string bottom`, `tie-side`, `v-front`, `stretched taut`, `exposed`, `wet-look`, `glossy reflections`) wurden der Liste in `sfw.js` hinzugefügt – nur im jugendfrei-Pfad.

## Aufgabe 5 – hemmungslos: kein FSK-Filter

Bei `effectiveAdult === true` (Request-Flag `adult` && Profil ohne `'never'` / `adultMode:false`) findet KEINE FSK18-Filterung/Entschärfung statt – unabhängig von `profile.adult|fsk|fsk18`. Gefundene Stellen im adult-Pfad: `finalNegative` in buildPromptPlan (SFW_NEGATIVES nur bei !effectiveAdult) und `applySfwToParts`/`stripFsk18` in Schritt 7 (nur bei !effectiveAdult). Erlaubt bleiben ausschließlich Jugendschutz und `'never'`/`adultMode:false`.
