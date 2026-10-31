# Auftrag v84b – Hub: Kacheln sortieren (H1), Face ID auf dem iPhone (H2), Restguthaben je Anbieter
Modell: claude-opus-5-5 via LumiaRouter · EIN Durchgang · danach eigene QA (Build, Tests, tsc, Diff, Vorschau).

Du bist Senior-Entwickler für die PWA "Jeffa Hub" (Cloudflare Pages, Plain-JS-ES-Module ohne Bundler, Pages Functions in TS, Node-Tests `node --test tests/*.test.mjs`, Typcheck `npx tsc --noEmit` mit allowJs über src/ und functions/). `scripts/build.mjs` kopiert `apps/hub`, `apps/chat`, `apps/waechter` flach nach `dist/hub/` und `apps/shared/` nach `dist/hub/shared/`. Browser-Code in apps/hub importiert Shared-Code als `./shared/…`; Server-Code (src/, functions/) relativ; Tests importieren `../apps/shared/…` bzw. `../src/….js`.

Setze die drei Aufgaben unten in EINEM Durchgang um. Keine sonstigen Refactorings, keine Umformatierung bestehender Zeilen, bestehende Exporte bleiben kompatibel (alle 327 Tests müssen grün bleiben). Die Altersgrenze 18+ in der Bild-Pipeline ist bereits erledigt – dort nichts ändern.

## Harte Grenzen
- Niemals Schlüssel ausgeben: keine API-Keys, Tokens, `apiKeys`-Felder o. ä. aus Anbieter-Antworten an den Client, in Logs oder Fehlertexte. Nur Zahlen (Guthaben/Verbrauch) und feste Hinweistexte.
- PIN bleibt immer als Rückfall nutzbar. Bestehende Passkeys in KV (`auth:cred:<id>`) müssen weiter funktionieren (kein Datenformat-Bruch; nur ergänzen).
- Layout Desktop/Handy (v81, Kopf mit horizontal scrollender `nav.tabs-nav`) bleibt; Drag-&-Drop darf das normale Scrollen/Tippen der Leiste nicht stören.
- Keine neuen npm-Pakete, keine Netzaufrufe in Tests. Neue Logik REIN (ohne DOM/localStorage/fetch) und Node-testbar in `.js`-Dateien; DOM-Code bleibt dünn.
- Beschriftung: Anbieter `vnaipro` heißt überall „Claude Gateway (VNAIPro)“ (bereits gesetzt; nicht zurückändern).

## Aufgabe H1 – Kacheln (Tabs) im Hub per Drag & Drop umsortieren
Die „Kacheln“ sind die `.tab-btn` in `nav.tabs-nav` (apps/hub/index.html).
- Neues reines Modul `apps/shared/taborder.js`: `applyTabOrder(ids, saved)` → Reihenfolge: zuerst gespeicherte IDs, die es gibt (in gespeicherter Reihenfolge), dann neue/unbekannte in Standard-Reihenfolge; Duplikate/Unsinn ignorieren. `moveId(list, fromIdx, toIdx)` → neue Liste. `TAB_ORDER_KEY = 'jeffa.tabOrder'`.
- apps/hub/app.js: beim Start gespeicherte Reihenfolge anwenden (Buttons per `appendChild` in der neuen Reihenfolge in die nav hängen – dieselben Elemente, keine Neuerzeugung, damit Klick-Handler/News-Badges bleiben). 
- Bedienung (Pointer Events, ein Code für alle):
  - Touch/Stift: langes Drücken (≈450 ms, Bewegung < 8 px) startet den Ziehmodus (leichte Vibration `navigator.vibrate?.(15)`, Kachel hebt sich: Klasse `dragging`, Leiste Klasse `reordering`). Bewegt sich der Finger vorher > 8 px → normales Scrollen, kein Ziehen.
  - Maus: Ziehen startet nach > 6 px Bewegung mit gedrückter linker Taste (kein Langdrücken nötig).
  - Während des Ziehens: `touch-action:none`/`preventDefault` nur im Ziehmodus; die Kachel wird live an die Stelle unter dem Zeiger verschoben (anhand der Mittelpunkte der anderen `.tab-btn`), Auto-Scroll der Leiste am linken/rechten Rand. Loslassen → Reihenfolge in localStorage speichern, Toast/kurzer Hinweis „Reihenfolge gespeichert“. Der Klick direkt nach einem Ziehen darf den Tab NICHT wechseln.
  - Escape/`pointercancel` bricht ab und stellt die vorherige Reihenfolge wieder her.
- Einstellungen (apps/hub/settings.js, Karte mit Face-ID-Schalter oder eine passende vorhandene Karte): Knopf „↺ Kachel-Reihenfolge zurücksetzen“ (löscht `jeffa.tabOrder`, Seite neu ordnen über ein exportiertes `resetTabOrder()` aus app.js ODER `location.reload()`), plus Hinweiszeile „Kacheln oben lange drücken (Handy) bzw. mit der Maus ziehen, um sie umzusortieren.“
- CSS (apps/hub/app.css, am Ende anhängen): `.tab-btn.dragging{opacity:.85;transform:scale(1.08);box-shadow:…;z-index:2}`, `nav.tabs-nav.reordering .tab-btn{transition:transform .12s}`, `-webkit-user-select:none;-webkit-touch-callout:none` auf `.tab-btn` (verhindert iOS-Kontextmenü beim Langdrücken). Keine bestehenden Regeln ändern.

## Aufgabe H2 – Face ID / WebAuthn auf iPhone-Safari reparieren (PIN bleibt Rückfall)
Bekannte Ursachen im heutigen Code (bitte alle beheben):
1. iOS-Safari verlangt, dass `navigator.credentials.create/get` direkt in der Nutzer-Geste läuft. Heute wird vorher per `await api(...options)` geladen → die Geste ist verbraucht → `NotAllowedError`. Lösung in apps/shared/auth.js: `prefetchWebAuthn(kind)` lädt die Options VORAB (beim Öffnen des Modals/Rendern des Knopfs), speichert sie mit Zeitstempel; der Klick-Handler ruft `navigator.credentials.get/create` SOFORT synchron mit den vorab geladenen Options auf (erst danach `await`). Fehlen sie oder sind sie älter als 240 s, wird nachgeladen und der Nutzer bekommt „Bitte nochmal tippen“ (kein create/get außerhalb der Geste). Nach jedem Versuch neue Options vorladen (Challenges sind einmalig).
2. Einrichten macht heute `registerWebAuthn()` und direkt danach `loginWebAuthn()` (zweite Abfrage ohne Geste → schlägt auf iOS fehl). Lösung: `/api/auth/webauthn/register/verify` gibt nach erfolgreicher Registrierung zusätzlich ein Admin-Session-Token zurück (`{ ok:true, token, role:'admin' }`; sicher, weil Registrier-Options nur ein Admin oder die Ersteinrichtung bekommen) – der Client setzt die Session; kein zweites `get`.
3. `ensureAdmin()`: `modal.querySelector('.webauthn-btn').onclick = …` wirft, wenn der Knopf fehlt (PIN gesetzt, Face ID-Schalter aus) → der PIN-Knopf bekommt dann nie seinen Handler. Null-sicher machen. Face-ID-Knopf zeigen, wenn `state.passkeys > 0 && faceIdEnabled()`; ohne Passkey und ohne PIN: Knopf „🔐 Face ID einrichten“ (register). `faceIdEnabled()` (apps/shared/api.js): Standard AN, wenn die Einstellung nie gesetzt wurde (`faceId !== false`); der Schalter in den Einstellungen zeigt das entsprechend (`get().faceId !== false`). Gleiches in `lockScreen()`.
4. Server src/webauthn.ts `createRegistrationOptions`: zufällige `user.id` (16 Byte) statt lauter Nullen (sonst überschreibt iOS den Passkey bei jeder Neu-Registrierung), `authenticatorSelection: { authenticatorAttachment:'platform', residentKey:'preferred', requireResidentKey:false, userVerification:'required' }`, `pubKeyCredParams` ES256 (-7) und zusätzlich RS256 (-257) nur in der Liste (Verifikation bleibt ES256; RS256-Credentials mit klarer Meldung ablehnen – bestehendes Verhalten), `excludeCredentials` aus dem Index (unten).
5. Credential-Index: zusätzlich zu `auth:cred:<id>` eine Liste `auth:credidx` (JSON-Array der IDs) pflegen (beim Registrieren ergänzen). `createLoginOptions` und `getAuthState` (src/auth.ts) nutzen den Index ∪ `KV.list({prefix:'auth:cred:'})` (KV.list ist eventual consistent – direkt nach dem Einrichten sonst leer). Reine Hilfsfunktion `mergeCredIds(indexIds, listedIds)` in einer neuen `src/webauthn-util.js` (testbar).
6. rpId: reine Funktion `rpIdFor(hostname, envRpId)` in `src/webauthn-util.js`: `envRpId` wenn gesetzt; sonst für `*.jeffa-hub.pages.dev` und `jeffa-hub.pages.dev` → `'jeffa-hub.pages.dev'` (pages.dev ist Public-Suffix, Unterdomains der Vorschau dürfen die Haupt-rpId nutzen → dieselben Passkeys auf Vorschau und Live); sonst `hostname`. In functions/api/auth/[[route]].ts überall verwenden. Der Origin-Check bleibt exakt (request-origin).
7. Fehlertexte im Client: `NotAllowedError` → „Face ID abgebrochen oder nicht erlaubt – bitte nochmal tippen (oder PIN nutzen)“; `InvalidStateError` → „Dieses Gerät ist schon eingerichtet“; `SecurityError` → „Face ID geht nur auf https://jeffa-hub.pages.dev bzw. der Vorschau-Adresse“. Reine Funktion `webauthnErrorText(err)` in apps/shared/auth.js ODER apps/shared/webauthn-msg.js (testbar ohne DOM).
8. Tresor (apps/hub/tresor.js) „Neuen Passkey registrieren“: nutzt ebenfalls vorab geladene Options (Prefetch beim Rendern), Erfolgstext „Face ID eingerichtet ✓“, setzt die Einstellung faceId auf true.
- Signaturprüfung (derToRaw, CBOR) NICHT umbauen.

## Aufgabe B – Restguthaben je Anbieter auf den Kacheln (Tresor + Wächter)
- functions/api/balances.ts erweitern (bestehende Struktur, `requireRole(context,'read')`, KV-Cache 300 s – Cache-Schlüssel auf `balances:v84` ändern). Rückgabe je Anbieter (gemini, openrouter, venice, hf, xai, vnaipro, groq, mistral, runware):
  `{ ok:boolean, available:boolean, balanceUsd?, usedUsd?, limitUsd?, unit?:'USD'|'DIEM', note? }`.
  - openrouter: wie heute (credits → balanceUsd).
  - venice: `balances.USD` → balanceUsd (unit USD); nur `DIEM` → `balance` als Zahl mit `unit:'DIEM'` (NICHT als Dollar anzeigen).
  - vnaipro (Claude Gateway, OpenAI-kompatibles new-api/one-api): `GET {base}/v1/dashboard/billing/subscription` (`hard_limit_usd`) und `GET {base}/v1/dashboard/billing/usage` (`total_usage` in Cent) → `limitUsd`, `usedUsd`, `balanceUsd = limit - used` wenn beide Zahlen da. Basis-URL wie heute.
  - runware: `POST https://api.runware.ai/v1` mit Body `[{"taskType":"accountManagement","taskUUID":<crypto.randomUUID()>,"operation":"getDetails"}]`, Header `Authorization: Bearer <key>` → `data[0].balance.amount` (+ `freeBalance`) → balanceUsd (Summe), unit = `balance.currency`. NUR diese Zahlen übernehmen (die Antwort enthält auch `apiKeys` – nie weitergeben).
  - gemini, hf, xai, groq, mistral: kein Guthaben per API → `{ ok:true, available:false, note:'Guthaben nicht abrufbar' }`.
  - Kein Key: `{ ok:false, available:false, note:'Kein API-Key' }`. Netz-/HTTP-Fehler: `{ ok:false, available:false, note:'Guthaben nicht abrufbar' }` (nie den Fehlertext des Anbieters).
  - Die Antwort-Auswertung als reine Funktionen in neuer Datei `src/balance-parse.js` (`parseOpenRouter(keyJson, creditsJson)`, `parseVenice(json)`, `parseVnaipro(subJson, usageJson)`, `parseRunware(json)`, `NO_BALANCE_API` Liste), balances.ts macht nur fetch + Aufruf. Timeouts 6 s, parallel (`Promise.all`).
- Reine Anzeige-Funktion `balanceLabel(b)` in neuer `apps/shared/balance.js`: `$12.34` (USD), `123.4 DIEM`, bei nur used/limit „$x von $y genutzt“, sonst `b.note || 'Guthaben nicht abrufbar'`; `null/undefined` → „Guthaben nicht abrufbar“. Negative Salden auf 0 klemmen.
- Wächter (apps/waechter/waechter.js): jede Provider-Kachel zeigt eine Zeile `tile-info` mit `balanceLabel(balance)` (wenn `state.balances` geladen; ohne Login wie heute nichts/Schloss-Hinweis). Detailansicht: Abschnitt „Guthaben“ immer zeigen (auch bei `available:false` mit dem Hinweistext), DIEM korrekt.
- Tresor (apps/hub/tresor.js): beim Laden zusätzlich `api('/api/balances', { auth:true }).catch(()=>null)`; jede Anbieter-Karte bekommt unter der Quelle eine Zeile „💰 <balanceLabel>“. Fehler beim Laden → Zeile „💰 Guthaben nicht abrufbar“, kein Toast.

## Tests (neue Datei tests/v84b-hub.test.mjs, node:test + assert, ohne Netz)
1. applyTabOrder: gespeicherte Reihenfolge, unbekannte IDs ignoriert, neue hinten, Duplikate; moveId vor/zurück/Rand.
2. app.js-Smoke (Text): nutzt `applyTabOrder`, `TAB_ORDER_KEY`, `pointerdown`, `pointercancel`; app.css hat `.tab-btn.dragging` und `-webkit-touch-callout:none`.
3. rpIdFor: preview-v84.jeffa-hub.pages.dev → jeffa-hub.pages.dev; jeffa-hub.pages.dev → gleich; localhost → localhost; envRpId gewinnt. mergeCredIds: Vereinigung ohne Duplikate.
4. webauthnErrorText für NotAllowedError/InvalidStateError/SecurityError/sonstiges.
5. auth.js-Smoke (Text): `prefetchWebAuthn`, kein `await loginWebAuthn()` direkt nach `await registerWebAuthn()`; ensureAdmin null-sicher (`?.onclick` oder if); api.js `faceId !== false`.
6. webauthn.ts-Smoke (Text): `residentKey`, kein `new Uint8Array(16)` mehr als user.id, `auth:credidx`; Route gibt nach register/verify `token` zurück und nutzt `rpIdFor`.
7. balance-parse: OpenRouter, Venice USD/DIEM, VNAIPro (limit/used → balance), Runware (amount+freeBalance, currency; Ergebnis enthält KEIN `apiKeys`/keinen Schlüssel – prüfe `JSON.stringify(result)` gegen den Fake-Key aus der Eingabe), kaputte Eingaben → available:false mit 'Guthaben nicht abrufbar'.
8. balanceLabel: USD, DIEM, used/limit, note, null.
9. balances.ts-Smoke (Text): alle 9 Anbieter, `balances:v84`, `Guthaben nicht abrufbar`.
Bestehende Tests müssen grün bleiben. Wenn ein alter Test bewusst geändertes Verhalten prüft, passe ihn minimal an und nenne ihn in notes.

## Antwortformat (strikt)
Antworte NUR mit einem JSON-Objekt, ohne Text davor/danach:
{"edits":[{"file":"pfad/relativ/zum/repo","find":"exakter, EINDEUTIGER Ausschnitt aus der aktuellen Datei","replace":"neuer Text"}],
 "new_files":[{"file":"…","content":"…"}],
 "append":[{"file":"…","content":"…"}],
 "notes":"kurze Zusammenfassung auf Deutsch: was wo, angepasste alte Tests, offene Punkte"}
- Jedes `find` muss GENAU EINMAL in der Datei vorkommen (Zeichen für Zeichen inkl. Einrückung) – kurze, eindeutige Ausschnitte. Mehrere Edits pro Datei werden nacheinander angewendet (spätere finds sehen den bereits geänderten Text).
- Code-Auszüge unten sind exakt (Zeilenbereiche angegeben); ändere nur, was du gesehen hast.
- Halte die Antwort kompakt (keine kompletten bestehenden Dateien neu schreiben; neue Dateien vollständig).

---
## Hinweis
Bilder 21→18 (Punkt „Bilder 18+“) hat der Bot selbst umgesetzt (mechanisch, vor dem Claude-Job); Claude-Job B enthielt nur H1, H2 und Guthaben.

## QA-Protokoll (Bot, nach Claude-Job B)
Claude: claude-opus-5-5 über LumiaRouter, 30 708 Prompt- + 18 758 Antwort-Tokens, Kosten $0.498. Alle Edits passten (0 Fehler).

Gefundene und behobene Fehler:
1. tsc: `unit`-Typ in balances.ts zu eng (Runware liefert Währung) → `unit?: string; currency?: string`.
2. tsc: `mergeCredIds` in src/auth.ts nicht importiert → Import ergänzt.
3. **Ursache des iPhone-Face-ID-Fehlers (schon seit Baseline):** verifyRegistration übersprang die 16-Byte-AAGUID im authData nicht (`pos = 37` statt `53`) → jede echte Registrierung scheiterte mit „Schlüsseltyp wird nicht unterstützt“. Behoben.
4. **Sicherheitslücke (schon seit Baseline, durch Claudes „Session nach register/verify“ verschärft):** Login- und Registrierungs-Challenges lagen im selben KV-Namensraum; eine frei abrufbare Login-Challenge hätte eine Registrierung (und jetzt eine Admin-Session) erlaubt. Behoben: Challenge trägt `kind`, verify prüft es; register/verify prüft zusätzlich dieselbe Schranke wie register/options.
5. getAuthState wertete KV-Fehler als „0 Passkeys“ (hätte die Ersteinrichtungs-Schranke geöffnet) → Fehler wird jetzt durchgereicht.
6. Einstellungen „Face ID einrichten“: rief create() nach einem await (ensureAdmin) und ohne Prefetch auf → auf iOS immer abgelehnt. Jetzt: Prefetch beim Öffnen; ohne Admin erst entsperren, dann zweiter Tipp; setzt faceId=true.
7. H1 Touch: nach dem Langdruck hätte iOS beim Ziehen gescrollt und pointercancel ausgelöst → `touchmove` (passive:false) blockiert im Zieh-Modus; Kontextmenü unterdrückt; Autoscroll nutzte veraltete Position.
8. Claudes Tests: 4 falsche Erwartungen (moveId-Randfall, CSS-Leerzeichen, user.id-Prüfung, Anbieterliste in balance-parse.js) korrigiert.

Eigene Tests: tests/v84b-webauthn-e2e.test.mjs (esbuild-Bundle von src/webauthn.ts + src/auth.ts; echter P-256-Schlüssel, Mock-KV: Registrierung → Index → Login, Einmal-Challenge, Challenge-Art, falsche Herkunft, fehlendes UV, fremde Signatur, KV-Fehler) + QA-Tests in v84b-hub (Touch, Schranke, AAGUID, 18+-Grenze).

Ergebnis: Build ok, 349/349 Tests grün, tsc ohne Fehler, Undefined-Name-Check der gebauten Hub-Dateien sauber. Layout: nur 7 CSS-Zeilen angehängt (Kacheln), index.html unverändert; Jugendschutz-Wortliste (MINOR_RX) unverändert, Grenze jetzt <18.
