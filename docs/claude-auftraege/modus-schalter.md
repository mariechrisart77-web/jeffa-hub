# Auftrag: Modus-Schalter „jugendfrei / hemmungslos“ pro Chat
Ziel-Modell: claude-opus-5-5 (LumiaRouter), Budget ≤ 8 $. Repo jeffa-app (Cloudflare Pages; Frontend apps/chat wird für hub und chat gebaut, Bild-Engine src/imgsvc-* läuft im hub und im bild-Service). Tests: `node --test tests/*.mjs` (ESM, node:test), `npx tsc --noEmit`.

## Ist
- Globaler Schalter isAdult() (apps/shared/fsk.js, localStorage `jeffa.settings.adult`) wählt systemPromptAdult vs. systemPrompt (chat.js ~545), Preset-Filter (photoopts adultOnly) und Bildmodell (body.adult → MODEL_TABLE safe/adult in src/imgsvc-core.js, Venice safe_mode).
- profile.adultMode === false schaltet ein Profil dauerhaft jugendfrei. Kein Schalter pro Chat, Server vertraut body.adult blind.
- Neue Profile aus der Server-Sync (D1 profiles_sync) erscheinen im Client nicht, wenn sie lokal fehlen (Profile `spanischlehrerin`, `spanischlehrer` liegen nur auf dem Server).

## Auftrag (echter, lauffähiger Code)
1. Neues Modul `apps/shared/mode.js`:
   - `MODES = { jugendfrei, hemmungslos }`
   - `chatMode(conv, profile)`:
     - Wert aus `conv.mode`.
     - Fehlt er, Default: jugendfrei. Ausnahme: Profile mit `adult === true` (18+-only, bestehendes Verhalten) bekommen hemmungslos.
   - `effectiveAdult(conv, profile) = isAdult() && chatMode(...) === 'hemmungslos' && profile.adultMode !== false && profile.adult !== 'never'`
   - Rein, testbar (isAdult injizierbar).
2. Chat-Header: Dropdown „Modus: jugendfrei / hemmungslos“ neben dem Modell-Button.
   - Nur sichtbar/aktivierbar, wenn isAdult() global an ist; sonst fest jugendfrei mit Hinweis.
   - Speichert `conv.mode`.
   - Beim Wechsel erscheint im Chat eine sichtbare Systemzeile („🔒 Modus: jugendfrei“ / „🔥 Modus: hemmungslos“), nicht an das LLM gesendet.
3. Alle Stellen, die heute isAdult() für Chat/Foto nutzen (chat.js Systemprompt + adult-Variable, Foto-Sheet optionsHtml/Knappheit, image-client.js photoFragments + body.adult), nutzen effectiveAdult(conv, profile).
4. Jugendfrei-Presets: im jugendfreien Modus bietet das Foto-Sheet nur:
   - freie Szene (Textfeld)
   - Richtung „elegant / locker / sportlich“ (neue Konstante SFW_DIRECTIONS mit englischen Prompts)
   - keine adultOnly-Posen/Outfits, kein Knappheits-Slider
5. Server erzwingt:
   - Client sendet `mode` in /api/chat und /api/image.
   - **Chat:** /api/chat hängt bei mode !== 'hemmungslos' eine feste SFW-Regel an den system-Text („Antworte jugendfrei: keine sexuellen oder expliziten Inhalte …“).
   - **Bild:** imgsvc-image.ts setzt body.adult = false, wenn mode !== 'hemmungslos'. Fehlt mode, bleibt das alte Verhalten (Abwärtskompatibilität, alte Clients).
   - Bestehender 21+-Schutz (scrubYouth, minorRisk, abgleich) unverändert aktiv.
6. Profil-Import: Client übernimmt Server-Profile mit `_adminRev`, die lokal fehlen, in die lokale Liste (ohne bestehende lokale Profile zu überschreiben, außer per bestehender adminNewer-Logik).

## Akzeptanzkriterien und Tests
- `tests/v78-mode.test.mjs`:
  - **chatMode-Defaults:** profile.adult false → jugendfrei; true → hemmungslos; conv.mode gewinnt.
  - **effectiveAdult:** false, wenn global aus oder jugendfrei.
  - **SFW_DIRECTIONS:** genau 3 Einträge mit nicht-leeren EN-Prompts.
  - **Server-Helfer:** `applyModeToSystem` (oder gleichwertig) hängt die SFW-Regel nur bei jugendfrei an; `enforceImageMode(body)` setzt adult=false bei mode 'jugendfrei', lässt es bei fehlendem mode.
  - **Profil-Import:** `mergeServerProfiles(local, serverList)` fügt fehlende hinzu und überschreibt keine vorhandenen.
- Alle bestehenden Tests grün, tsc sauber.
- Keine Secrets, keine Änderung gespeicherter Profile/Chats, keine Preset-Textänderungen.
