# Auftrag v82 – Chat-Paket: C1 Vorlesen Start/Stopp (+P6), C3 Identität, C4 Verlauf
Modell: claude-opus-5-5 via LumiaRouter · EIN Durchgang · danach eigene QA (Build, Tests, tsc, Diff, Vorschau).

Du bist Senior-Entwickler für die PWA "Jeffa Hub" (Cloudflare Pages, Plain-JS-ES-Module im Browser, Pages Functions in TS, Node-Tests `node --test tests/*.test.mjs`, Typcheck `npx tsc --noEmit` über functions/ + src/ mit allowJs). Setze GENAU die drei Aufgaben unten in EINEM Durchgang um. Keine anderen Änderungen, keine Refactorings, keine Umformatierung bestehender Zeilen.

## Harte Grenzen
- Jugendschutz unverändert: scrubYouth, minorRisk, 21+-Sperre, isAdult/effectiveAdult/chatMode, applyModeToSystem, die v81-Filterlogik (guardAdult/identity) NICHT anfassen. Der FSK18-Hinweis und personaChatText bleiben wie sie sind.
- Layout unverändert (Desktop und Handy ≤700px). Einzige sichtbare UI-Ergänzungen: Zustand am 🔊-Chip, ein nur WÄHREND des Vorlesens sichtbarer ⏹-Knopf im Chat-Kopf, ein kleiner „＋“-Knopf auf Profilkarten. Keine bestehenden CSS-Regeln ändern, nur neue anhängen.
- Keine Secrets/Keys in Code oder Logs. Gespeicherte Chats verlustfrei migrieren (nie localStorage-Daten löschen, bevor die neue Ablage erfolgreich geschrieben wurde).
- Browser-Code: kein Build-Schritt, keine npm-Pakete. Neue Browser-Module müssen auch in Node importierbar sein (kein top-level Zugriff auf window/document/localStorage/indexedDB ohne `typeof`-Prüfung).
- Server: TS muss `npx tsc --noEmit` bestehen. Reine JS-Helfer in src/*.js wie src/mode-server.js (aus TS normal importierbar, allowJs).

## Aufgabe 1 – C1 Vorlesen mit Start/Stopp (+ P6 Text säubern)
Ist-Zustand: `apps/shared/tts.js` – `stopSpeaking()` stoppt nur `speechSynthesis`; die Edge/HF-Wiedergabe läuft über ein lokales `new Audio()`, das nirgends gemerkt wird → laufendes Vorlesen ist NICHT stoppbar, mehrere Wiedergaben können sich überlagern, ein spät zurückkommender /api/tts-Fetch startet nach „Stopp“ trotzdem. In `apps/chat/chat.js` gibt es nur den Chip `🔊 Vorlesen` (startet immer neu) und Auto-Vorlesen (`profile.voice.autoRead`), ohne sichtbaren Zustand.
Soll:
1. Neue Datei `apps/shared/tts-clean.js` mit `export function cleanForTTS(text)` (rein, Node-testbar):
   - entfernt eine abschließende `[FOTO: …]`/`[BILD: …]`/`[PHOTO: …]`-Zeile;
   - Codeblöcke ``` … ``` → „(Codebeispiel)“; Inline-Code-Backticks entfernen (Text bleibt);
   - Regieanweisungen: Spannen in EINFACHEN Sternchen `*lächelt verschmitzt*` bzw. einfachen Unterstrichen `_zwinkert_` komplett entfernen (inkl. Inhalt); `**fett**`/`__fett__` → nur Text behalten;
   - Markdown: `#`-Überschriften-Marker, `>`-Zitatmarker, Listenmarker (`- `, `* `, `1. ` am Zeilenanfang), Tabellen-Pipes, Links `[Text](url)` → `Text`, nackte URLs → „(Link)“;
   - Emojis entfernen (`\p{Extended_Pictographic}`, Regional-Indicator-Flaggen, U+FE0F, U+200D, Hautton-Modifier U+1F3FB–1F3FF, Keycap U+20E3);
   - runde Klammern NICHT entfernen (die Spanischlehrerin setzt Übersetzungen in Klammern);
   - Mehrfach-Leerzeichen/Leerzeilen normalisieren, trimmen.
2. `apps/shared/tts.js`:
   - `speak(text, voiceCfg, lang, opts = {})` – `opts.id` (z. B. Nachrichten-ID). Bereinigt den Text mit `cleanForTTS`, ruft zuerst `stopSpeaking()`. Leerer Text nach Bereinigung → nichts tun.
   - Modul-Zustand: aktuelles `Audio`-Element, aktuelle Object-URL, `AbortController` für den /api/tts-Fetch, laufende Generation (Zähler) und aktuelle ID. Jeder asynchrone Schritt prüft die Generation – nach `stopSpeaking()` darf nichts mehr anfangen zu spielen (auch nicht der Browser-Fallback von speakEdge).
   - `stopSpeaking()`: speechSynthesis.cancel(), audio.pause() + src leeren, Object-URL freigeben, Fetch abbrechen, offene Promise auflösen (nicht ablehnen), Zustand auf „aus“.
   - Exporte zusätzlich: `isSpeaking()`, `speakingId()`, `onTtsChange(cb)` (gibt Abmelde-Funktion zurück). Bei jedem Zustandswechsel: Listener aufrufen und, falls `window` existiert, `window.dispatchEvent(new CustomEvent('jeffa:tts', { detail: { speaking, id } }))`. Zustand „an“ ab Start (auch während Fetch lädt), „aus“ bei Ende, Fehler oder Stopp.
   - Bestehende Exporte (`listBrowserVoices`, `pickNaturalVoice`, `speak`, `stopSpeaking`, `stop`) bleiben kompatibel (persona.js ruft `speak(text, cfg, lang)` für Stimmproben).
   - Muss in Node importierbar bleiben (kein top-level window-Zugriff).
3. `apps/chat/chat.js`:
   - Der lazy Import von tts.js bleibt (v63). Neuer Helfer `toggleSpeak(msg, profile)`: läuft gerade diese Nachricht → stoppen; sonst diese Nachricht vorlesen (`speak(msg.content, profile.voice, profile.language, { id: msg.id })`).
   - Chip: `🔊 Vorlesen` ↔ `⏹ Stopp` mit Klasse `speaking` und `aria-pressed="true"`, wenn `msg.id` gerade vorgelesen wird – auch nach `renderMessages()` korrekt (Zustand im Modul merken, aus `jeffa:tts` aktualisieren). Zustandswechsel aktualisieren nur die Chips + Kopf-Knopf per DOM, kein komplettes Re-Render.
   - Im Chat-Kopf in `.hdr-actions` VOR `#photo-btn`: `<button class="btn-icon hidden" id="tts-stop" title="Vorlesen stoppen" aria-label="Vorlesen stoppen">⏹</button>`; sichtbar nur solange vorgelesen wird (auch beim Auto-Vorlesen); Klick stoppt. Die Klasse `hidden` existiert bereits global.
   - Auto-Vorlesen übergibt `{ id: a.id }`.
   - Vorlesen stoppen bei: Chat wechseln (`loadConv`), neuem Chat, Absenden einer neuen Nachricht.
   - Fehler beim Vorlesen → `toast('Vorlesen nicht möglich')` statt unbehandelter Rejection.
4. CSS: nur anhängen an `apps/chat/chat.css`: `.chip.speaking { background: var(--accent, #8b5cf6); }`.

## Aufgabe 2 – C3 Identitätsverwechslung (Coder hält sich für „Lena“)
Analyse (bereits eingegrenzt, bitte so umsetzen):
- (a) Globale Besetzung: `cast` (localStorage `jeffa.cast`) ist app-weit. `generateReply` hängt für JEDES Profil – auch Coder/Assistent/Anwalt – „In Geschichten vorkommende Figuren: Lena, …“ an den Systemprompt.
- (b) Globales Gedächtnis: `src/memory.ts` speichert Fakten ohne gültigen `scope:"profile"` im gemeinsamen Scope `user`. Das Extraktions-Modell legt Sätze wie „Der Nutzer nennt mich Lena“/„Lena ist die Freundin des Nutzers“ dort ab; `relevantMemories` hängt sie jedem Profil als „Gedächtnis“ an.
- (c) `system.slice(-4000)` in `generateReply` schneidet bei langen Prompts (Stilvorlage, Persona) den ANFANG ab – also genau „Du bist …“.
- (d) Es gibt keinen expliziten Identitätsanker.
Soll:
1. Neue Datei `apps/chat/sysprompt.js` (rein, Node-testbar):
   - `castLine(profile, castIds, getProfile)` → '' wenn das Profil keine Figur ist (`!profile.persona`) oder nach Abzug des eigenen Profils niemand übrig bleibt; sonst `\n\nIn Geschichten können außerdem diese ANDEREN Figuren vorkommen (das bist nicht du): A, B.`
   - `otherProfileNames(profile, allProfiles)` → Namen aller anderen Profile (ohne eigenen Namen, eindeutig, max. 12, je max. 40 Zeichen).
   - `identityAnchor(profile, otherNames)` → `\n\n[Identität: Du bist ${name}${description ? ' – ' + description : ''}. Bleib immer ${name}. ${others ? `${others} sind andere Figuren dieser App, nicht du – übernimm nie deren Namen, Rolle oder Erinnerungen.` : ''}]` (sauber formatiert, ohne doppelte Leerzeichen).
   - `capSystem(system, max = 4000)` → unverändert wenn ≤ max; sonst Anfang (erste 1600 Zeichen) + `\n…\n` + Ende, Gesamtlänge ≤ max. So bleiben Identität (Anfang) und Anker/Foto-Regel (Ende) erhalten.
2. `chat.js` `generateReply`: `castLine(...)` statt des bisherigen Cast-Blocks; `identityAnchor(profile, otherProfileNames(profile, getProfiles()))` direkt VOR der Foto-Regel anhängen; `system: capSystem(system)` statt `system.slice(-4000)`; im Agent-Pfad (`runAgent`) `capSystem(system, 3000)` statt `system.slice(0, 3000)`. streamChat-Body zusätzlich `profileName: profile.name, otherNames`.
   `learnMemory` schickt zusätzlich `profileName` und `otherNames` an `/api/memory/extract`.
3. Neue Datei `src/memory-scope.js` (rein, Node-testbar, mit JSDoc-Typen):
   - `mentionsName(text, names)` → true, wenn einer der Namen (≥2 Zeichen) als ganzes Wort (Unicode, case-insensitiv, Umlaute/Akzente korrekt; Regex-Sonderzeichen escapen) vorkommt.
   - `scopeForFact(requestedScope, fact, { profileId, profileName, otherNames })` → `p:<profileId>` wenn `profileId` und (requestedScope === 'profile' ODER der Fakt den eigenen Namen oder einen anderen Profilnamen nennt ODER sich auf die KI bezieht, z. B. /\b(KI|Assistent(in)?|Bot)\b/i oder „nennt mich“/„heißt du“); sonst 'user'.
   - `filterForProfile(memories, { profileId, otherNames })` → entfernt Einträge mit scope 'user', die einen der `otherNames` nennen (Altlasten), und alle Einträge mit fremdem `p:`-Scope. Einträge `p:<profileId>` bleiben.
4. `src/memory.ts`: `relevantMemories(env, profileId, query, max, maxChars, otherNames?: string[])` filtert mit `filterForProfile`; `extractMemories(env, profileId, messages, opts?: { profileName?: string; otherNames?: string[] })` nutzt `scopeForFact` (Signaturen abwärtskompatibel). Im Extraktions-Systemprompt zusätzlich: „Niemals Name, Rolle oder Eigenschaften der KI-Figur als Nutzer-Fakt speichern.“
5. `functions/api/chat.ts`: Body-Felder `profileName?: string`, `otherNames?: string[]` (validieren: Array ≤ 20, Strings, je auf 40 Zeichen kürzen) an `relevantMemories` durchreichen. Gedächtnis-Überschrift ändern zu: `Gedächtnis (Fakten über den NUTZER – nicht über dich; nur nutzen wenn relevant):`.
6. `functions/api/memory/[[route]].ts` (extract): `profileName`/`otherNames` genauso validieren und an `extractMemories` geben.

## Aufgabe 3 – C4 Verlauf (Sprachlehrerin) geht verloren
Analyse (bereits eingegrenzt):
- (a) Hauptursache: Alle Chats liegen als EIN JSON in `localStorage['jeffa.conversations']`. Generierte Bilder werden als komplette `data:image/webp;base64,…`-URL (`msg.imageUrl`, aus image-client.js `r.dataUrl`) und Foto-Anhänge als Base64 (`msg.images[].data`) mitgespeichert. Ab ~5 MB (iOS-Safari-Limit) wirft `localStorage.setItem` QuotaExceededError; `persist()` fängt das nur mit `console.warn` ab → ab dann wird NICHTS mehr gespeichert, nach Neuladen/Schließen der PWA ist alles seit dem Überlauf weg. Die Sprachlehrerin (Comic-/Foto-Bilder) trifft es zuerst.
- (b) iOS-PWA feuert `pagehide` beim Wegwischen oft nicht; `persist()` ist 400 ms entprellt → letzte Antwort kann fehlen.
- (c) Profilkarte antippen ruft IMMER `startNewChat` → leerer neuer Chat, der alte Verlauf wirkt „weg“. Der „↩ Letzter Chat“-Knopf erscheint nie, weil `profile.lastConversationId` nirgends gesetzt wird. Nach Neuladen öffnet die App den global neuesten Chat statt des zuletzt offenen.
Soll:
1. Neue Datei `apps/chat/convstore.js`:
   - rein/Node-testbar: `liteCopy(convs)` → tiefe Kopie ohne große Binärdaten: `imageUrl`/`videoUrl`, die mit `data:` beginnen, entfernen und `stripped: true` an der Nachricht setzen; `images` (Base64-Anhänge) entfernen und `stripped: true` setzen. Alles andere (Text, Rollen, IDs, Titel, gen-Metadaten, summary, mode, model) bleibt. Original NICHT verändern.
   - `mergeStores(primary, secondary)` → Vereinigung nach `id`; bei gleicher ID gewinnt die Version mit neuerem `updatedAt` (bei Gleichstand primary); fehlen der Gewinner-Nachricht wegen `stripped` `imageUrl`/`images`, werden sie aus der anderen Version (gleiche Nachrichten-ID) ergänzt. Rückgabe ohne Duplikate.
   - `pickConvForProfile(convs, profileId, preferredId)` → preferredId, wenn er zu diesem Profil gehört und existiert, sonst neuester Chat dieses Profils (updatedAt), sonst null.
   - IndexedDB-Helfer `idbGet(key)` / `idbSet(key, value)` (DB `jeffa-chats`, Store `kv`), die bei fehlendem `indexedDB` sauber `null` bzw. `false` liefern und nie werfen.
2. `chat.js` Speicherung:
   - `loadStore()`: Primär IndexedDB (`idbGet('conversations')`, Wert wie bisher: Array oder verschlüsselter Blob `{ct,…}` → `decryptJSON`), sekundär `localStorage['jeffa.conversations']` (Alt-Bestand voll ODER neue Lite-Kopie). Beide → `mergeStores(idb, ls)`. Fehlerverhalten wie bisher (unlesbar → `.unreadable` sichern). Die v68-Neuspeicherung bleibt.
   - `persist()`: Voll-Stand nach IndexedDB (verschlüsselt, wenn `isEncryptOn()`), PLUS `liteCopy` nach `localStorage['jeffa.conversations']` (Format wie bisher: Array bzw. verschlüsselter Blob – die Bild-App liest dort Story-Text). Schlägt localStorage trotzdem fehl (Quota): erneut mit nur den letzten 80 Nachrichten pro Chat versuchen. Schlägt BEIDES (IDB und LS) fehl → einmalig pro Sitzung `toast('⚠️ Chat konnte nicht gespeichert werden – Speicher voll? Alte Chats mit Bildern löschen.')`. Nie still scheitern.
   - Sofort speichern (`persist(true)`) bei `visibilitychange` → hidden, zusätzlich zu `pagehide`, und am Ende jeder fertigen Antwort (finally-Block in `generateReply`).
   - Bilder: Nachrichten mit `stripped` und ohne `imageUrl` zeigen statt Bild `<div class="hint">🖼 Bild nur auf dem Ursprungsgerät gespeichert</div>` (nur falls nach dem Merge wirklich kein Bild da ist).
3. `chat.js` Wiederherstellen:
   - In `loadConv(id)`: `localStorage['jeffa.currentConv'] = id` und Map `localStorage['jeffa.lastConvByProfile']` (`{ [profileId]: convId }`) aktualisieren (try/catch). KEIN `updateProfile` dafür (würde Server-Sync auslösen).
   - Start (`render()`): Chat aus `jeffa.currentConv` öffnen, falls vorhanden, sonst neuester (wie bisher).
   - `openLastChat(profileId)`: `pickConvForProfile(listConversations(), profileId, lastConvByProfile[profileId])`; nichts da → neuer Chat.
   - `createNewConv()`: Ist der neueste Chat des aktiven Profils noch leer (keine Nachrichten), diesen öffnen statt einen weiteren leeren anzulegen.
   - Neuer Export `lastConvIdFor(profileId)` (für profiles.js).
4. `apps/chat/profiles.js` `renderProfileList`: Karte antippen → `handlers.onOpenLastChat(profile.id)` (macht bei fehlendem Verlauf automatisch einen neuen Chat). In `.profile-actions` statt des nie sichtbaren ↩-Knopfs: `<button class="btn-icon new-chat-btn" data-id="…" title="Neuer Chat" aria-label="Neuer Chat">＋</button>` → `handlers.onStartChat(id)`. (`onOpenLastChat`/`onStartChat` sind in app.js schon verdrahtet.) Sonst nichts an profiles.js ändern.

## Tests (neue Datei `tests/v82-chat.test.mjs`, nur node:test + assert, keine DOM-Bibliotheken)
- cleanForTTS: Emojis/Flaggen weg; `*lächelt*` weg, `**wichtig**` → „wichtig“; `# Titel` → „Titel“; `[Link](https://x)` → „Link“; `[FOTO: …]` am Ende weg; Klammern-Übersetzung „Hola (Hallo)“ bleibt; Codeblock → „(Codebeispiel)“.
- tts.js mit Fake-Globals (`globalThis.fetch`, `Audio`, `URL.createObjectURL/revokeObjectURL`, `speechSynthesis`, `window`): Edge-Wiedergabe startet → `isSpeaking()` true, `speakingId()` = id; `stopSpeaking()` pausiert das Audio, `isSpeaking()` false, Promise löst auf; Stopp während laufendem Fetch → danach wird KEIN Audio abgespielt; zweites `speak` stoppt das erste. Globals nach dem Test zurücksetzen.
- sysprompt: Coder (persona null) + cast [lena] → castLine leer; Lora + cast [lena, lora] → nur „Lena“, mit „nicht du“; identityAnchor enthält eigenen Namen, nicht als „andere Figur“; capSystem: 6000 Zeichen → ≤4000, beginnt mit dem Original-Anfang, endet mit dem Original-Ende.
- memory-scope: „Der Nutzer nennt mich Lena“ mit profileId 'coder', otherNames ['Lena'] → 'p:coder'; „Nutzer heißt Christian und wohnt in Spanien“ → 'user'; requested 'profile' ohne profileId → 'user'; filterForProfile entfernt user-Fakt mit „Lena“ für Coder, behält p:coder, entfernt p:lena; mentionsName respektiert Wortgrenzen („Lenas“ zählt nicht als „Lena“? → festlegen und testen: ganzes Wort, „Lenas“ = kein Treffer) und Akzente („Lucía“).
- convstore: liteCopy entfernt data:-URLs/Base64, behält Text, Original unverändert, Größe deutlich kleiner; mergeStores ergänzt Bild aus anderer Version und nimmt neueres updatedAt; pickConvForProfile (preferred passt / gehört anderem Profil / nichts da → null); idbGet/idbSet ohne indexedDB → null/false ohne Exception.
- Quelltext-Checks (readFileSync): chat.js enthält `visibilitychange`, `capSystem(`, `identityAnchor(`, `castLine(`, kein `system.slice(-4000)` mehr, `id="tts-stop"`; profiles.js ruft bei Kartenklick `onOpenLastChat`; chat.ts übergibt otherNames an relevantMemories.
- Bestehende 281 Tests müssen grün bleiben – prüfe besonders bestehende Quelltext-Checks auf chat.js/tts.js/profiles.js/memory.ts (z. B. Erwartungen an `system.slice`, `speak`-Signatur, `startNewChat`), passe NUR dann einen alten Test an, wenn er genau das geänderte Verhalten festschreibt, und begründe es in notes.

## Antwortformat (strikt)
Antworte NUR mit einem JSON-Objekt, ohne Text davor/danach:
{"edits":[{"file":"pfad/relativ/zum/repo","find":"exakter, EINDEUTIGER Ausschnitt aus der aktuellen Datei","replace":"neuer Text"}],
 "new_files":[{"file":"…","content":"…"}],
 "append":[{"file":"apps/chat/chat.css","content":"…"}],
 "notes":"kurze Zusammenfassung auf Deutsch, inkl. evtl. angepasster alter Tests"}
- Jedes `find` muss GENAU EINMAL in der Datei vorkommen (Zeichen für Zeichen, inkl. Einrückung) – lieber kurze, eindeutige Ausschnitte. Mehrere Edits pro Datei werden nacheinander angewendet (später Edits sehen das Ergebnis früherer).
- Für tts.js darfst du die Datei komplett als new_files neu schreiben (Exporte kompatibel halten).
