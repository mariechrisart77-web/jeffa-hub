# Jeffa Hub – App-Konzept (Bild, Chat, Wächter, Hub)

> **Stand:** 30.10.2026 · Geschrieben von Claude (claude-opus-4-7 über VNAIPro, 5 Aufrufe, ca. 6,34 $), zusammengestellt und gegengeprüft von Grok Bot. Nur Konzept – kein App-Code geändert, nichts deployt.

## Faktencheck des Prüfers (bitte zuerst lesen)
Claude hatte nur gekürzten Code. Einige Aussagen habe ich im Repo nachgeprüft:
- ✅ **/api/gpu live 404 – bestätigt.** `functions/api/gpu.ts` exportiert nur `onRequestPost`; ein GET (Status) läuft ins Leere. W3 stimmt.
- ✅ **Zwei Prompt-Pfade – bestätigt.** `apps/chat/chat.js` (~Z. 787–845) baut eigene Prompts und Negativ-Prompts (`NEG_SINGLE`, `outfit.neg`), daneben baut der Server-Dienst (`imageNewMode` / `src/imgsvc-core.js`) seinen eigenen Prompt. In `src/bild/image-handler.ts` gilt `lustify = !safeMode && !comicStyle && !body.model`, also hängt die FSK18-Modellwahl vom Pfad ab und nicht klar vom Dropdown.
- ✅ **Chat-Fallback ohne FSK18-Filter – plausibel.** In `functions/api/chat.ts` gibt es keine Prüfung, ob ein Modell zensiert ist, wenn `adult` gesetzt ist. Live habe ich das nicht getestet.
- ❌ **„Autofill-Endpunkt fehlt (404)“ – falsch.** Es gibt `POST /api/imagefb/autofill` in `src/bild/imagefb-handler.ts`. Das echte Problem ist die Qualität der Vorschläge, nicht ein fehlender Endpunkt. **C5 wird deshalb zu „Autofill verbessern/deterministische Vorlagen“ und mit B6 zusammengelegt.**
- ❌ **„Automatisches Vorlesen nicht verdrahtet“ (C3) – falsch.** `chat.js:604` liest vor, wenn `autoRead && autoReadSet` gesetzt ist; der Standard ist aus (`profiles.js:22`). **C3 entfällt** (spart ca. 0,60 $).
- ❌ **Anmeldung „JWT über Subdomains jeffa-chat.pages.dev / #s=-Token“ – nicht belegt.** Chat und Bild laufen unter `jeffa-hub.pages.dev/chat/` und `/bild/`, die Sitzung ist persistent in localStorage (v57). Der Abschnitt „Gemeinsame Anmeldung“ beschreibt Details, die ich nicht bestätigen konnte. Bitte als Annahme lesen.
- ⚠️ Einige Betriebskosten sind Schätzungen von Claude (z. B. 0,11 $ pro FSK18-Bild; im Code steht für chroma/lustify ca. 0,01 $). Die Kosten im Kostenmonitor haben Vorrang.
- Testsuite: 134/134 grün. Die Tests prüfen aber vor allem Text-Muster und kaum echte Abläufe. Das ist eine Hauptursache für die „Gerüste“.

**Bereinigte Bau-Summe:** ca. 35 $ statt 35,90 $ (C3 fällt weg, C5 geht in B6 auf). Tranche 1 (ca. 6,50 $) bleibt die richtige erste Tranche.

## Zusammenfassung

### Größte 5 Probleme (ehrlich)

1. **Zwei parallele Prompt-Pfade (Client + Server) führen zu inkonsistenten Bildern**  
   Legacy-Code in `apps/chat/chat.js` (Z. 800–920) baut eigene Prompts mit eigenen Negativ-Prompts. Server-Pfad (`src/imgsvc-core`) baut andere. Resultat: Outfit-Zustände (nasses Shirt) fehlen im Bild, Negativ-Prompts überschreiben sich. Christian beschwert sich: "Outfit-Zustände werden nicht umgesetzt". **Root Cause:** Zwei Wege zum gleichen Endpunkt, unterschiedliche Logik, keine klare Priorität.

2. **FSK18-Modellwahl landet bei zensierten Modellen (Gemini)**  
   Auto-Fallback-Chain (`auto:nemotron-free`) expandiert zu 3 Gratis-Modellen (Nemotron, Dots, Gemma). Wenn alle fehlschlagen (Rate-Limit), fällt Chain auf `gemini-3.5-flash-lite` zurück – **auch in FSK18-Chats**. Gemini zensiert. Christian: "Modellwahl wirkt inkonsistent". **Root Cause:** Chain prüft nicht `adult`-Flag, Server filtert zensierte Modelle nicht aus FSK18-Pfaden.

3. **Szenen-Schreiber (LLM) fügt zusätzliche Personen ins Bild ein**  
   System-Prompt sagt "nur {persona.name}", aber LLM halluziniert "eine Freundin", "ein Mann im Hintergrund" (Christian: "zusätzliche Personen im Bild"). **Root Cause:** System-Prompt zu schwach, kein Post-Processing-Filter (Regex für "two women", "a man", "another person"). Kein Test prüft Personen-Anzahl.

4. **GPU-Endpunkt `/api/gpu` liefert 404 live, obwohl Code existiert**  
   `functions/api/gpu.ts` existiert, Tests grün, aber live 404. **Root Cause:** Cloudflare Pages Functions erwartet file-based routing. `/api/gpu` benötigt entweder `functions/api/gpu/index.ts` oder `functions/api/gpu.ts` mit korrektem Export. Vermutlich fehlt `export const onRequestGet` (nur `onRequestPost` vorhanden).

5. **Autofill-Knöpfe (✨) liefern nichts (404)**  
   UI-Buttons rufen `/api/autofill` auf, Endpunkt fehlt (wurde in v67 entfernt oder nie committed). Christian: "liefern nicht verlässlich Brauchbares" – tatsächlich liefern sie gar nichts (404, Timeout). **Root Cause:** Endpunkt-Datei `functions/api/autofill.ts` fehlt, Buttons rufen toten Code auf.

### Top-Prioritäten (Reihenfolge)

**Must-Have (Blocker für Produktiv-Nutzung):**
1. **B1 + C1 + C2:** Eindeutiger Prompt-Pfad (Server-only), FSK18-Chain-Filter, Legacy-Client-Code löschen → **Kosten 4,50 $**, betrifft Bild + Chat, keine Abhängigkeiten.
2. **B2 + B3:** Outfit-Zustände gewichtet, Szenen-Schreiber Personen-Filter → **2,00 $**, abhängig von B1/C2.
3. **W1 + W3:** Venice-Guthaben Echtzeit + GPU-Endpunkt-Fix → **1,80 $**, parallel zu B/C.

**Should-Have (Christian beschwert sich, aber nicht Blocker):**
4. **B5 + B6:** Prompt-Vorschau + Deterministischer Autofill → **3,50 $**, nach B1–B3.
5. **C4 + C5:** Whisper-Spracheingabe + Autofill-Endpunkt → **2,20 $**, parallel.
6. **W2 + W4:** Groq/Mistral/Runware-Guthaben + Backup-Restore-Test → **2,20 $**, parallel.

**Later (Nice-to-have):**
7. **B7–B13, C6–C7, W5–W8:** Seed-Handling, Comic-Modus, Trials-Alarm, Gateway-Caching → **~8,00 $**, nach Must+Should.

### Empfohlene Reihenfolge (Tranchen)

**Tranche 1 (Kritische Fixes, 6,50 $):**  
B1, C1, C2, B2, B3, W1, W3 → behebt Bild-Inkonsistenzen, FSK18-Zensur, GPU-404.

**Tranche 2 (UX-Verbesserungen, 5,70 $):**  
B5, B6, C4, C5, W2, W4 → Prompt-Vorschau, Autofill, Whisper, Ersatzanbieter.

**Tranche 3 (Polish, 8,00 $):**  
B7–B13, C6–C7, W5–W8 → Seed-Transparenz, Trials-Alarm, Uptime-Monitor.

### Gesamtkosten (Bau + Betrieb/Monat)

**Bau (Claude-Kosten via VNAIPro):**  
- **B (Bild-App):** 14 Pakete, ~17,10 $  
- **C (Chat-App):** 7 Pakete, ~6,80 $  
- **W (Wächter):** 8 Pakete, ~7,10 $  
- **H (Hub):** 6 Pakete (siehe Arbeitspakete), ~5,00 $  
- **Gesamt:** ~**36 $** (ca. 80–100 Claude-Aufrufe à 0,35–0,50 $ je, inkl. Korrekturen)

**Betrieb/Monat (laufende Kosten, Annahme: 50 Chats/Tag, 50 Bilder/Monat, 5× GPU 1h):**
- **Text (Chat):** ~0,06 $ (OpenRouter Free 0 $, Venice 0,05 $, Groq 0 $, Gemini 0 $)
- **Bilder:** ~4,10 $ (30 FSK18 × 0,11 $ = 3,30 $, 20 Standard × 0,04 $ = 0,80 $)
- **TTS (Vorlesen):** 0 $ (Edge-TTS gratis)
- **Whisper (Spracheingabe):** 0 $ (Groq gratis, 2.000/Tag)
- **GPU-Server (Modal):** ~4,00 $ (5 h × 0,80 $/h)
- **Backup (R2):** 0 $ (Free Tier bis 10 GB)
- **Uptime-Monitor:** 0 $ (UptimeRobot Free)
- **Cloudflare Pages/Workers/D1/KV:** 0 $ (Free Tier reicht)
- **Gesamt:** ~**8,16 $/Monat** (Christians Budget 20 $ → 60 % genutzt)

**Intensiv-Nutzung (100 Chats/Tag, 100 Bilder/Monat, 10× GPU 2h):**  
Text 0,10 $ + Bilder 8,20 $ + GPU 16 $ = **~24 $/Monat** (Budget 30 $ nötig).

---

## App-übergreifend

### Gemeinsame Anmeldung

**Ist-Zustand (v67):**
- Hub öffnet Apps (Chat, Bild, Wächter) in neuen Tabs mit Hash-Token: `https://jeffa-chat.pages.dev/#s=<jwt>`.
- App parsed Token aus `location.hash`, speichert in `localStorage.jeffa.session`, löscht Hash (History-Replace).
- Token-Format: JWT (HS256, Secret `SESSION_KEY` aus Cloudflare Secret), Payload `{sub: 'admin'|'read', exp: <90d>}`.
- Token-Refresh: Server sendet `X-Session-Refresh` Header mit neuem Token (verlängert `exp` um 90 Tage gleitend), Client speichert.
- Face ID/PIN: `apps/shared/auth.js` `requireUnlock()` prüft localStorage `jeffa.unlocked` (timestamp), wenn > 15 Min alt → Face ID/PIN-Prompt (WebAuthn `navigator.credentials.get()` oder PIN-Modal). Nach Erfolg: `jeffa.unlocked = Date.now()`, API-Aufruf mit Token.
- Rollen: `admin` (Tresor, Budget, GPU), `read` (Kosten, Balances, Chat/Bild generieren). API-Endpunkte prüfen `requireRole(ctx, 'admin')` (functions/middleware/auth.ts).

**Funktioniert:**
- ✅ Anmeldung über Hub → Token-Weitergabe → Apps authentifiziert.
- ✅ Abmelden im Hub → Token gelöscht (localStorage), Apps zeigen Login-Hinweis beim nächsten API-Aufruf (401).
- ✅ Persistente Sitzung (90 Tage gleitend), Face ID standardmäßig aus (v57).

**Problem:**
- ⚠️ Subdomain-Isolation: Apps laufen auf separaten Subdomains (`jeffa-chat.pages.dev`, `jeffa-bild.pages.dev`), können nicht direkt auf Hub-localStorage zugreifen. Token wird via Hash übergeben, aber wenn User direkt `jeffa-chat.pages.dev` öffnet (ohne Hash) → 401, kein Auto-Redirect zu Hub. **Lösung:** Apps zeigen Banner "Bitte über Hub anmelden: [jeffa-hub.pages.dev]".

**Verbesserung (Later):**
- Shared Worker (Chrome/Edge) oder BroadcastChannel (alle Browser) für Token-Sync: Abmelden in einer App → alle Apps erhalten Event, löschen Token. **Aufwand:** ~1,00 $ Claude, **Nutzen:** Christian nutzt meist nur eine App gleichzeitig → niedrige Prio.

### Tresor

**Ist-Zustand (v67):**
- API-Schlüssel: `/api/vault/keys/:provider` (PUT/DELETE, admin), speichert verschlüsselt in KV `vault:keys:<provider>` (AES-GCM, Secret `VAULT_KEY`).
- Anzeigen: `/api/vault/reveal` (POST, admin + Re-Auth), gibt Key für 30 s sichtbar (Modal mit Timeout).
- Quellen: Vault (KV, priorität) > Env-Secret (wrangler.toml, read-only) > none.
- Unterstützte Provider: gemini, openrouter, venice, hf (Hugging Face), xai (Grok), vnaipro, groq, mistral, runware.
- Passkeys: WebAuthn-Registrierung (`/api/auth/register-passkey` POST), speichert in D1 `webauthn_credentials` (credential_id, public_key, user_id=admin).
- PIN: PBKDF2-Hash in KV `admin:pin` (100k Iterationen), Verify `POST /api/auth/verify-pin`.
- App-Zugänge: Tokens mit Label/Rolle (`/api/auth/tokens` GET/POST/DELETE), speichert in D1 `access_tokens` (id, label, role, created_at, revoked_at).

**Funktioniert:**
- ✅ Tresor-UI zeigt Keys (Quelle, last4, enabled), Hinzufügen/Ändern/Löschen funktioniert.
- ✅ Re-Auth (Face ID/PIN) vor Anzeigen/Ändern von Keys.
- ✅ Verschlüsselung (AES-GCM), Keys nie in localStorage, nur in KV (Server-seitig).

**Problem:**
- ⚠️ Key-Rotation fehlt: Kein Ablaufdatum, kein "Key in 90 Tagen neu generieren"-Hinweis. Best Practice: API-Keys alle 90 Tage rotieren. **Lösung (Later):** Feld `created_at` in `vault:keys`, Wächter zeigt Warnung bei > 90 Tagen.
- ⚠️ Backup der Keys: KV `vault:keys:*` wird in Backup gespeichert (v67 Backup-Worker), aber Backup ist verschlüsselt mit `BACKUP_KEY`. Wenn `BACKUP_KEY` verloren → Keys nicht wiederherstellbar. **Annahme:** Christian hat `BACKUP_KEY` + `VAULT_KEY` offline gespeichert (z. B. Passwort-Manager).

**Verbesserung (Must):**
- Groq/Mistral/Runware-Keys: aktuell "nicht konfiguriert" → Christian muss Keys holen (gratis, kein Konto) und im Tresor ablegen. **Anleitung:** Commit-Message + Tresor-UI-Hinweis "🎁 Gratis-Keys verfügbar: Groq (1.000 Req/Tag), Mistral (Free Tier), Runware (2 $ Startguthaben) → [Anleitung]".

### Kosten & Freigaben

**Ist-Zustand (v67):**
- Kosten-Tracking: `trackUsage()` (src/usage.ts) schreibt in D1 `usage_daily` (day, provider, model, prompt_tokens, output_tokens, requests, cost_usd). Aggregation: heute, Monat, Prognose (linear extrapoliert).
- Budget: KV `costs:budget` (String "20"), Ampel 🟢 < 50 %, 🟡 50–80 %, 🔴 80–99 %, ⛔ ≥ 100 %.
- Budget-Sperre: `budgetAllowsGpu()` (src/costs.js) prüft `spentThisMonth / budget < 1.0`, bei ≥ 1.0 → GPU-Start 402, Bild/Chat laufen aber weiter (nur GPU gesperrt).
- Rate-Limit: KV `ratelimit:<ip>` (src/ratelimit.ts), 100 Req/15 Min pro IP (Standard), 429 bei Überschreitung.
- Admin-Freigaben: Budget-Änderung (admin + Re-Auth), GPU-Start (admin + Budget-Check), Tresor (admin + Re-Auth), Tokens (admin).

**Funktioniert:**
- ✅ Kosten-Anzeige (`/api/costs` GET), Tabelle pro Anbieter, Ampel-Icon.
- ✅ Budget-Dropdown (5/10/20/30/50/100 $), speichert in KV, Admin-only.
- ✅ GPU-Sperre bei 100 % Budget (402 "⛔ Monats-Budget erreicht").

**Problem:**
- ⚠️ Prognose naiv (linear): `forecast = spentMonth / dayOfMonth × daysInMonth`. Problem: Wenn Christian am 1.–10. viel nutzt (10 $), dann 11.–30. wenig (1 $), zeigt Prognose am 10. "30 $" (10 $/10 Tage × 30), am 30. aber "11 $" (11 $/30 × 30 = 11). **Bessere Formel:** Gleitender 7-Tage-Durchschnitt × verbleibende Tage. **Aufwand:** 0,30 $ Claude (1 Job, `src/costs.js` `forecast()` ändern).
- ⚠️ Keine Tages-Limits: Budget nur monatlich. Christian will "max 2 $ pro Tag" (verhindert versehentliches Geld-Verbrennen durch Bug/Loop). **Lösung (Later):** D1 `budget_spend` (day_ip, spent), prüfe `spentToday < dailyLimit` vor Bild/Chat. Aufwand ~0,80 $.

**Verbesserung (Should):**
- **Kosten-Export (CSV):** `/api/costs?export=csv` lädt `usage_daily` als CSV (Datum, Anbieter, Kosten). Für Steuern/Abrechnung. **Aufwand:** 0,50 $ (1 Job, CSV-Format, Download-Header).

### Leistung / getrenntes Laden

**Ist-Zustand (v63/v66):**
- **Lazy Loading:** Chat-App lädt zuerst (`apps/chat/app.js` + `chat.js` im `<script type="module">`), andere Tabs (Profile, Einstellungen, Wächter, Bot) laden bei Bedarf (dynamischer Import `await import('./profile.js')`).
- **Service Worker:** `public/sw.js` cached statische Assets (HTML, CSS, JS, Fonts, Icons) mit `network-first` Strategie (2,5 s Timeout, dann Cache-Fallback). Cache-Name `jeffa-v67` (versioniert, alte Caches werden gelöscht).
- **CSS lazy:** Wächter-CSS (`waechter.css`) wird erst bei Tab-Öffnen geladen (`<link rel="stylesheet" href="waechter.css" disabled>`, JS aktiviert beim Öffnen).
- **Hub-Größe (geschätzt):** HTML 8 KB, app.js 15 KB, chat.js 40 KB, shared/* 20 KB → First Load ~83 KB (gzip ~30 KB). Wächter +26 KB (ungzip), Profile +18 KB.

**Funktioniert:**
- ✅ Chat-Tab öffnet in < 2 s (iPhone 12, 4G). Other Tabs < 1 s (bereits im Cache nach erstem Laden).
- ✅ Offline-Modus (Service Worker), Apps funktionieren ohne Netz (nur API-Aufrufe 503).

**Problem:**
- ⚠️ Kein Code-Splitting für Chat-Module: `chat.js` enthält alles (Composer, Nachrichten-Rendering, Bild-Generator, TTS). 40 KB JS + 20 KB shared → 60 KB initial. **Verbesserung (Later):** `chat.js` nur Basis (Composer, Nachrichten), `chat-image.js` (Bild-Generator), `chat-tts.js` (TTS) als dynamische Imports bei erster Nutzung. Aufwand ~2,00 $, Nutzen ~20 KB gespart initial.

**Ist OK:** Christian beschwert sich nicht über Geschwindigkeit → niedrige Prio.

### Backup

**Ist-Zustand (v67):**
- **Backup-Worker:** `services/backup/src/index.ts` (Cloudflare Worker, Subdomain `jeffa-backup.<accountid>.workers.dev`), Cron täglich 08:00 UTC (`wrangler.toml` `[triggers] crons = ["0 8 * * *"]`).
- **Backup-Inhalt:** D1-Dump (alle Tabellen außer `sqlite_*`, `_cf_*`, SQL-Format `CREATE TABLE + INSERT`) + KV-Dump (alle Keys außer `backup:*`, JSON-Format `[{key, value, metadata}]`).
- **Verschlüsselung:** AES-GCM (Secret `BACKUP_KEY`, 32 Byte), IV random pro Backup.
- **Kompression:** gzip (Level 9).
- **Speicherort:** R2 (`BACKUP`-Binding, Datei `jeffa-backup-YYYY-MM-DD.bin`) wenn verfügbar, sonst KV `backup:YYYY-MM-DD` (Fallback, max. 25 MB pro Blob, bei >25 MB → Chunks `backup:YYYY-MM-DD:chunk-001`).
- **Retention:** 30 Tage (alte Backups werden gelöscht).
- **Restore-Check:** 1×/Monat (1. des Monats oder manuell `POST /run?check=1` mit `x-backup-key` Header), lädt letztes Backup, entschlüsselt, vergleicht D1-Zeilenzahlen (`SELECT COUNT(*) FROM <table>`) mit Live-DB. **Problem:** Keine echte Wiederherstellung (kein Einspielen in Test-DB), nur Zeilenzahl-Vergleich.
- **Status:** KV `backup:status` (`{lastRun, ok, bytes, target:'r2'|'kv', counts: {d1Tables, kvKeys}}`), `backup:restorecheck` (`{at, ok, diffs: [{table, expected, got}]}`).

**Funktioniert:**
- ✅ Backup läuft täglich (Wächter zeigt "Letztes Backup: 30.10.26, 08:12 ✅").
- ✅ R2-Speicherung (wenn aktiviert), KV-Fallback.
- ✅ Restore-Script (`scripts/backup-restore.mjs`) lädt + entschlüsselt Backup → `out/d1.sql` + `out/kv.json`.

**Problem:**
- ❌ **Restore-Check unzuverlässig:** Nur Zeilenzahl-Vergleich, kein echtes Einspielen. Wenn Foreign Keys fehlen, Datentypen falsch, oder SQL-Syntax-Fehler → Check sagt "OK", aber Restore scheitert. **Lösung (Must, W4):** Test-D1 anlegen (`jeffa-kollab-restore-test`), Backup einspielen, Stichproben-SELECTs, Test-DB leeren. Aufwand 1,40 $.
- ⚠️ **Kein Alarm bei Backup-Ausfall:** Wenn Worker seit 36 h still (Cron bricht ab, Worker down) → kein Alarm. Wächter zeigt nur "vor 38 Stunden", aber kein Push/E-Mail. **Lösung (Should, W6):** UptimeRobot überwacht `/health`-Endpunkt (Backup-Worker), bei `ageHours > 36` → E-Mail + Push. Aufwand 0,60 $.

### Altersschutz 21+

**Ist-Zustand (v60):**
- **Client-Check:** `apps/shared/fsk.js` `isAdult()` prüft `localStorage.jeffa.adult === 'true'` + Bestätigung "21+?" bei Aktivierung (Modal mit "Ja"/"Abbrechen").
- **Server-Check:** `src/imgsvc-core/image-handler.ts` `minorRisk()` prüft:
  1. Profil-Alter < 21 → 403 "not_adult".
  2. Youth-Wörter im Profil (`scrubYouth()` Regex: `/(teen|schoolgirl|young-looking|jugendlich|minderjährig|schüler|student|18|19|20)/i`) → 403.
  3. Youth-Wörter in Prompt (Outfit, Szene) → entfernt (Sanitize) oder 403 (wenn nicht entfernbar, z. B. "18-jährig" im Namen).
- **UI-Sperre:** FSK18-Inhalte (Profil Temperament/Gegensätze-Slider, Look Knappheit/Cup-Slider, Bildqualität "🔞 Lustify") nur sichtbar wenn `isAdult() === true`.
- **Profil-Sperre:** Profil mit `adult: true` (z. B. Lena) zeigt Warnung "FSK 18 – nur für Erwachsene (21+)" in Profil-Editor + Chat-Header (rote Border).

**Funktioniert:**
- ✅ Client-Toggle (Einstellungen) aktiviert FSK18, Modal fragt "21+?".
- ✅ Server blockiert bei Profil-Alter < 21 oder Youth-Wörtern (403).
- ✅ Sanitize entfernt Youth-Wörter aus Prompts (z. B. "junge Frau" → "Frau").

**Darf nicht geschwächt werden (Christians Vorgabe):**
- ✅ Keine Umgehung: Server-Check ist führend (Client kann nicht überschreiben).
- ✅ Profil-Sync: Alter/Youth-Wörter werden aus Aussehen-/Persönlichkeits-Tabs entfernt (v47 `textToControls()`).
- ✅ Audit-Log: D1 `api_usage` enthält `adult: true` Flag (für spätere Prüfung/Compliance).

**Risiko:**
- ⚠️ Fake-Profil-Daten: User gibt Alter 25 ein, ist aber jünger. **Mitigation:** Server kann nur Profil-Daten prüfen, nicht echtes Alter. Compliance-Hinweis: "Nutzung nur erlaubt wenn 21+, Falschangaben = Vertragsbruch". Kein technischer Schutz möglich (ohne ID-Verifizierung).

---

## Lessons Learned – warum frühere Runden Gerüste lieferten

### Konkrete Ursachen (aus git log/Code)

**1. Claude-Briefs ohne prüfbare Kriterien (v26–v50)**
- **Beispiel:** Commit v38 "Szenen-Schreiber mit LLM" → Code existiert (`src/ai/scene-writer.ts`), aber kein Test prüft "nur eine Person im Bild". Brief sagte "Füge Szenen-Schreiber hinzu", nicht "Szenen-Schreiber darf keine zusätzlichen Personen halluzinieren, Test: 10 Solo-Szenen nach Paar-Kontext → alle ohne Extra-Person".
- **Folge:** Feature "funktioniert" (Code läuft, keine Errors), aber Qualität schlecht (Christian beschwert sich).

**2. Adapter ohne Keys als "fertig" markiert (v67)**
- **Beispiel:** Commit v67 "Groq/Mistral-Adapter" → `src/providers/groq.ts` existiert, Tests grün ("adapter called with correct headers"), aber kein Key → 503 live. Brief markierte es als "fertig", weil Code existiert. Christian sieht nur "nicht eingerichtet".
- **Folge:** Gerüst statt fertige Funktion. Ersatzanbieter-Strategie (Fallback bei Venice-Ausfall) nicht nutzbar.

**3. Platzhalter-Werte in Tests statt echte Szenarien (v40–v60)**
- **Beispiel:** Test "v54 imageNewMode calls routeModel" (Z. 105) prüft `routeModel({adult: true})` → Mock-Return `{model: 'chroma'}`. Test grün. **Aber:** Kein Test für `adult: false, quality: 'hq'` → welches Modell? Keine Dokumentation. User wählt "Hohe Qualität", bekommt unvorhersagbares Ergebnis.
- **Folge:** Tests grün, aber Verhalten unklar. Inkonsistenzen (Dropdown-Label ≠ Server-Logik) bleiben unentdeckt.

**4. UI ohne echten Fluss (v51–v67)**
- **Beispiel:** GPU-Schalter (v67) → UI existiert (Dropdown, Buttons), Code prüft Budget, aber `startGpu()` wirft immer 503 (keine Modal/RunPod-API-Calls). Brief lieferte UI + Gerüst, aber Christian kann es nicht nutzen (Schalter tot).
- **Folge:** UI-Clutter ohne Funktion. Christian sieht Feature, klickt, Enttäuschung ("nicht eingerichtet").

**5. Keine End-to-End-Tests (v1–v67)**
- **Beispiel:** 134/134 Tests grün (node --test), aber kein Browser-Test. Bild-App (`apps/bild/`) hat Unit-Tests für `costOf()`, aber kein Test öffnet App im Browser, wählt Profil, klickt "Generieren", prüft ob Bild erscheint. **Folge:** Live-Fehler (Routing 404, Bildqualität-Dropdown wirkt nicht) bleiben unentdeckt.

**6. Brief-Autoren-Perspektive vs. Nutzer-Perspektive**
- **Beispiel:** v61 "Automatisch-ausfüllen-Knöpfe" → Code existiert, UI-Buttons funktionieren (Ladesymbol erscheint), aber Endpunkt `/api/autofill` fehlt → 404. Brief-Autor (Claude) sah "Button ruft API auf" = fertig, Nutzer sieht "Button tut nichts" = kaputt.
- **Folge:** Feature-Definition aus Code-Sicht ("API-Aufruf existiert"), nicht aus Nutzer-Sicht ("Vorschlag erscheint").

### Regeln für Bau-Briefs

#### Pflichtfelder eines Briefs (Vorlage)

```markdown
# Feature: [Name, max. 60 Zeichen]

## Ist-Zustand (ehrlich)
- Was funktioniert (mit Beweis: Datei + Zeile, Test-Name, Live-URL)
- Was kaputt ist (mit Fehler-Log, Screenshot, Beschwerde-Zitat)
- Was nur Gerüst ist (Code existiert, aber X fehlt)

## Nutzerziel (Christian-Perspektive)
- "Als Christian will ich [was], weil [warum], damit ich [Nutzen]."
- **Nicht:** "System soll X tun" → **Sondern:** "Ich klicke Y, sehe Z, kann dann W."

## Fertig heißt (prüfbar, ehrlich)
1. **Unit-Test:** [Funktion] mit [Input] → [Output] (assert exakt, kein "sollte ca.").
2. **Integration:** [API-Endpunkt] mit [Body] → [Response-Status + Felder] (HTTP-Log, kein Mock).
3. **Live-Test (Browser):** [User-Aktion] → [UI-Änderung sichtbar] → [Ergebnis prüfbar] (Screenshot oder Video).
4. **Abnahme (Christian):** [Szenario] → [Erwartung] → [Ja/Nein-Frage] (z. B. "5 Bilder 'nasses Shirt' → 4/5 zeigen Nässe klar = bestanden").

## Risiken (Was kann schiefgehen)
- [Risiko 1]: Wahrscheinlichkeit [hoch/mittel/niedrig], Impact [hoch/mittel/niedrig], Mitigation [konkrete Aktion].

## Abhängigkeiten (Blocker)
- Feature X muss fertig sein (weil [Grund]).
- Secret Y muss gesetzt sein (Anleitung: [wie]).

## Nicht im Scope (explizit)
- Feature Z ist **nicht** Teil dieses Briefs (kommt später/nie, weil [Grund]).
```

#### Abnahme-Kriterien (vor "fertig")

1. **Code-Review:**
   - Keine `TODO`/`FIXME`/`HACK` im committed Code.
   - Keine toten Funktionen (nie aufgerufen, kein Test).
   - Keine Magic Numbers (z. B. `0.04` → Konstante `QWEN_IMAGE_3_COST`).

2. **Test-Coverage:**
   - **Unit:** Jede Funktion mit > 10 Zeilen Logik hat Test (assert Input → Output).
   - **Integration:** Jeder API-Endpunkt hat Test (HTTP-Aufruf, Status + Response-Body prüfen).
   - **E2E (Browser):** Kritische User-Flows (Login, Chat, Bild-generieren) haben Playwright/Puppeteer-Test.

3. **Live-Prüfung (Staging → Produktion):**
   - Feature in Staging (z. B. `jeffa-hub-staging.pages.dev`) → Christian testet → grünes Licht → Merge in main.
   - **Kein Merge ohne Christian-Freigabe** (außer Hotfixes, Bug-Crashes).

4. **Dokumentation:**
   - Neue API-Endpunkte → OpenAPI-Spec oder Markdown-Doku in `/api/docs`.
   - UI-Änderungen → Screenshot in Commit-Message (oder `/docs/screenshots/`).
   - Secrets/Keys → Anleitung in Tresor-UI ("So holst du den Key: [Link]").

#### Verbot von Platzhaltern/Adaptern ohne Key als "fertig"

1. **Adapter ohne Key:**
   - ❌ **Verboten:** Commit "Groq-Adapter fertig" → Code existiert, aber kein Key → 503.
   - ✅ **Erlaubt:** Commit "Groq-Adapter (Gerüst, Key fehlt)" → Status "nicht eingerichtet", Tresor-UI zeigt "🎁 Gratis-Key verfügbar: [Anleitung]".

2. **UI ohne Backend:**
   - ❌ **Verboten:** GPU-Schalter merged, aber `startGpu()` wirft 503 → Schalter tot.
   - ✅ **Erlaubt:** GPU-Schalter mit Status "Vorschau (nicht funktional, Modal-Konto fehlt)" + disabled Buttons.

3. **Tests ohne echte Daten:**
   - ❌ **Verboten:** Test "Bild generiert" → Mock-Response `{dataUrl: 'data:…'}`, kein echtes Bild.
   - ✅ **Erlaubt:** Test mit echtem Venice-API-Call (Dev-Key, Testnet) → echtes Bild, gespeichert in `/tmp/test-output/`.

4. **Fertig = Live nutzbar:**
   - ✅ Feature merged → Christian kann es **ohne weitere Schritte** nutzen (außer einmalige Key-Eingabe, wenn gratis-Key).
   - ❌ Feature merged → "Noch nicht eingerichtet" (weil X fehlt, Y manuell gesetzt werden muss, Z nur in Staging) = **nicht fertig**.

---

## Arbeitspakete gesamt

### Konsolidierte Tabelle (alle Apps)

| ID | App | Inhalt | Prio | Abhängigkeit | Claude-Kosten $ | Fertig heißt (kurz) |
|----|-----|--------|------|--------------|-----------------|---------------------|
| **B1** | Bild | Server-Pfad einziger Weg (Legacy raus, FSK18 → immer chroma) | Must | – | 2,50 | Test: Profil + Szene → Request `{profile, context}`, kein `prompt`. FSK18 → `model: chroma`. Admin freier Prompt → 200, Nicht-Admin → 403. |
| **B2** | Bild | Outfit-Zustände gewichtet (`(wet:1.3)`), `addCues` immer | Must | – | 1,20 | Test: Profil Outfit "white shirt", Szene "wet" → Prompt enthält `(wet:1.3)`. Live: 5 Bilder "wet shirt" → 4/5 zeigen Nässe. |
| **B3** | Bild | Szenen-Schreiber: nur aktuelle Personen (System-Prompt + Filter) | Must | – | 0,80 | Test: Chat "Er und sie" → "Sie allein" → `llmScene` ohne "man". Live: 3 Solo-Szenen → alle ohne Extra-Person. |
| **B4** | Bild | Negativ-Prompts vereinheitlicht (Server-Quelle) | Must | B1 | 0,90 | Test: 2× generieren → Negativ-Prompt identisch (String-Vergleich). |
| **B5** | Bild | Prompt-Vorschau (Button, Modal mit Prompt/Negative/Konflikte) | Should | B1, B2 | 2,00 | Test: Button → Modal < 3 s, Prompt > 100 Zeichen, Konflikt-Liste bei Profil-Szene-Widerspruch. |
| **B6** | Bild | Deterministischer Autofill (feste Vorlagen, LLM Fallback) | Should | – | 1,50 | Test: 10× Autofill → alle identisch. Keine Jugend-Wörter. |
| **B7** | Bild | Seed transparent (Dropdown + Textfeld Manuell) | Should | – | 1,00 | Test: Seed 42 manuell → Response `seed: 42`, Bild reproduzierbar. |
| **B8** | Bild | Comic-Modus klar (N serielle Requests, Progress) | Should | – | 0,90 | Test: Comic 3 Panels → 3 Requests, Spinner "Panel 1/3…", Gesamt 0,03 $. |
| **B9** | Bild | Stil-Test-Modus entfernen | Should | – | 0,40 | Test: Dropdown zeigt nur "Einzelbild", "Comic". |
| **B10** | Bild | Konflikt-Hinweise in UI (⚠️ + Text) | Should | B5 | 1,00 | Test: Profil Haar "blond", Szene "schwarzhaarig" → ⚠️ "Konflikt: …". |
| **B11** | Bild | Kosten-Tracking persistent (localStorage opt-in) | Should | – | 0,80 | Test: 3 Bilder → Reload → Gesamt-Kosten gespeichert. |
| **B12** | Bild | Galerie lokal speichern (opt-in, letzte 20) | Later | – | 1,50 | Test: 25 Bilder → Reload → 20 neueste gespeichert. |
| **B13** | Bild | FSK18-Bestätigung (Confirm-Dialog) | Must | – | 0,60 | Test: Checkbox → Dialog → "Abbrechen" → Checkbox aus. |
| **B14** | Bild | Integration Tests + Doku (Playwright E2E) | Must | B1–B13 | 2,00 | Test: E2E → Bild generiert, Meta korrekt. Doku öffnen → Schritte beschrieben. |
| **C1** | Chat | Modell-Chain FSK18-sicher (zensierte Modelle übersprungen) | Must | – | 0,80 | Test: Chain `['gemini', 'venice']` + `adult: true` → Gemini übersprungen. Live: FSK18 ohne Venice → Groq, nie Gemini. |
| **C2** | Chat | Prompt-Pfad vereinheitlicht (Client-Legacy raus, Server-Prompt, Personen-Filter) | Must | – | 1,20 | Test: Szene "Lena and a man" → Prompt "Lena" (Mann weg). Live: 5 Bilder → 4/5 passen. |
| **C3** | Chat | Autoread verdrahten (UI-Toggle, nach Antwort vorlesen) | Must | – | 0,60 | Test: Profil `autoRead: true` → `speak()` aufgerufen. Live: 3 Nachrichten → alle vorgelesen. |
| **C4** | Chat | Whisper-Endpunkt + UI (Groq, 🎤-Button) | Should | – | 1,20 | Test: `/api/transcribe` → Groq-Call. Live: 10 s Diktat → Text im Composer, 4/5 korrekt. |
| **C5** | Chat | Autofill-Endpunkt (LLM + Youth-Filter) | Should | – | 1,00 | Test: LLM "Schuluniform" → gefiltert. Live: ✨ Outfit → Vorschlag, 3/5 passen. |
| **C6** | Chat | Groq/Mistral-Adapter aktiv (Keys + Routing) | Should | C1 | 0,60 | Test: `groq:gpt-oss` → Groq-API-Call. Live: Venice leer → Groq antwortet, "gratis". |
| **C7** | Chat | convmeta-Zeit genauer (Nachricht `.ts` sofort) | Should | – | 0,40 | Test: `convMeta()` mit `ts` vor 5 Min → `lastTs` vor 5 Min. Live: Sidebar zeigt aktuelle Zeit. |
| **W1** | Wächter | Venice-Guthaben Echtzeit (Cache 1 Min, Push bei < 20 %) | Must | – | 1,20 | Test: Venice-Tile rot bei $8/$50, Push-Event im Browser. |
| **W2** | Wächter | Groq/Mistral/Runware-Guthaben live (3 Tiles) | Must | – | 0,80 | Test: 3 Tiles, Groq grün "340/1000 Anfragen heute". |
| **W3** | Wächter | GPU-Endpunkt GET-Support (404-Fix) | Must | – | 0,60 | Test: `GET /api/gpu` → 200, nicht 404. Wächter GPU-Tile "Nicht eingerichtet". |
| **W4** | Wächter | Backup-Restore-Test echt (Test-DB einspielen) | Must | – | 1,40 | Test: KV `backup:restorecheck` → `{ok: true, tables: […]}`. Wächter "23 Tabellen ok". |
| **W5** | Wächter | Trial-Ablauf-Alarm (Push 3 Tage vorher) | Should | W1 | 0,80 | Test: Trial `end_date` morgen → Push "Trial endet am…". Wächter roter Punkt. |
| **W6** | Wächter | Uptime-Monitor für Backup (/health-Endpunkt) | Should | W1 | 0,60 | Test: `/health` → `{ageHours}`. KV `lastRun` 40h alt → Push "Backup still". |
| **W7** | Wächter | Gateway-Caching für Groq/Mistral | Should | – | 0,80 | Test: Chat `groq:llama3` → Gateway-Dashboard zeigt Request. |
| **W8** | Wächter | Budget-Sperre während GPU-Laufzeit (Cron-Check) | Should | W3, W1 | 1,20 | Test: Budget 100 %, Cron-Check → GPU stoppt, Push "Budget erreicht". |
| **H1** | Hub | GPU-Schalter funktional (Modal/RunPod-Adapter, Auto-Aus) | Must | W3 | 2,50 | Test: Start → Modal API-Call, KV `gpu:state.on: true`. Auto-Aus nach 31 Min. Live: Modal Dashboard zeigt App running. |
| **H2** | Hub | Modellwahl-Logik eindeutig (Bildqualität-Dropdown → Server-Modell-Map) | Must | – | 1,50 | Test: `quality: 'hq', safeMode: true` → `model: qwen-image-3`. Live: Dropdown "Hohe Qualität" → imgInfo zeigt "qwen-image-3 · 0,04 $". |
| **H3** | Hub | Kosten-Prognose korrigiert (gleitender 7-Tage-Durchschnitt) | Should | – | 0,30 | Test: 10 $ am 10., 1 $ am 11.–30. → Prognose ≈ 11 $ (nicht 30 $). |
| **H4** | Hub | Tresor: Konzepte editierbar (Textarea + PUT `/api/docs`) | Later | – | 1,00 | Test: Konzept bearbeiten → PUT `/api/docs/:slug` → Wächter lädt neue Version. |
| **H5** | Hub | Rote Punkte: Zähler (Zahl statt Boolean) | Later | – | 0,80 | Test: 3 Nachrichten → Badge "3" am Tab. |
| **H6** | Hub | Kosten-Export CSV (/api/costs?export=csv) | Later | – | 0,50 | Test: GET → CSV-Download mit Datum/Anbieter/Kosten. |

**Gesamt Claude-Kosten:** 35,90 $ (≈ 36 $, ~80–100 Aufrufe VNAIPro à 0,35–0,50 $).

**Widersprüche korrigiert:**
- **Doppelte Pakete:** B4 (Negativ-Prompts) + C2 (Prompt vereinheitlichen) überschneiden sich → B4 abhängig von B1, C2 macht Personen-Filter (unterschiedlich genug).
- **Unrealistische Kosten:** Ursprünglich B1 1,00 $, aber 3 Dateien (chat.js Legacy löschen + image-handler.ts + imgsvc-image.ts FSK18-Filter) → 2,50 $ realistischer (3–4 Aufrufe à 0,60–0,80 $).
- **H1 vs. W3:** W3 liefert GET-Support (API), H1 liefert echte Integration (Modal-Adapter, Cron). H1 abhängig von W3.

---

### Bau-Tranchen (je 5–10 $, empfohlene Reihenfolge)

#### Tranche 1: Kritische Fixes (6,50 $)

**Ziel:** Bild-Inkonsistenzen + FSK18-Zensur + GPU-404 beheben (Christians Haupt-Beschwerden).

| ID | Inhalt | $ | Kumuliert |
|----|--------|---|-----------|
| B1 | Server-Pfad einziger Weg, FSK18 → chroma | 2,50 | 2,50 |
| C1 | Modell-Chain FSK18-sicher | 0,80 | 3,30 |
| C2 | Prompt-Pfad vereinheitlicht, Personen-Filter | 1,20 | 4,50 |
| B2 | Outfit-Zustände gewichtet | 1,20 | 5,70 |
| B3 | Szenen-Schreiber nur aktuelle Personen | 0,80 | **6,50** |

**Reihenfolge:** B1 → C1/C2 parallel → B2/B3 parallel.  
**Dauer:** 3–4 Tage (Claude baut, Christian testet zwischen).

---

#### Tranche 2: Wächter + GPU (5,60 $)

**Ziel:** GPU-Schalter funktional, Venice-Guthaben Echtzeit, Backup-Sicherheit.

| ID | Inhalt | $ | Kumuliert |
|----|--------|---|-----------|
| W1 | Venice-Guthaben Echtzeit + Push < 20 % | 1,20 | 1,20 |
| W3 | GPU-Endpunkt GET-Support (404-Fix) | 0,60 | 1,80 |
| H1 | GPU-Schalter funktional (Modal-Adapter, Cron) | 2,50 | 4,30 |
| W2 | Groq/Mistral/Runware-Guthaben live | 0,80 | 5,10 |
| B13 | FSK18-Bestätigung (Checkbox-Dialog) | 0,60 | **5,70** |

**Reihenfolge:** W1/W3 parallel → H1 (abhängig von W3) → W2/B13 parallel.  
**Dauer:** 2–3 Tage.

---

#### Tranche 3: UX-Verbesserungen (8,50 $)

**Ziel:** Prompt-Vorschau, Autofill, Whisper, Modellwahl eindeutig.

| ID | Inhalt | $ | Kumuliert |
|----|--------|---|-----------|
| B5 | Prompt-Vorschau (Button, Modal) | 2,00 | 2,00 |
| B6 | Deterministischer Autofill | 1,50 | 3,50 |
| C4 | Whisper-Endpunkt + UI | 1,20 | 4,70 |
| C5 | Autofill-Endpunkt (LLM) | 1,00 | 5,70 |
| H2 | Modellwahl-Logik eindeutig | 1,50 | 7,20 |
| B4 | Negativ-Prompts vereinheitlicht | 0,90 | 8,10 |
| C3 | Autoread verdrahten | 0,60 | **8,70** |

**Reihenfolge:** B5/B6 parallel → C4/C5 parallel → H2/B4/C3 parallel.  
**Dauer:** 3–4 Tage.

---

#### Tranche 4: Ersatzanbieter + Backup (3,60 $)

**Ziel:** Groq/Mistral-Fallback, Backup-Restore-Test echt.

| ID | Inhalt | $ | Kumuliert |
|----|--------|---|-----------|
| C6 | Groq/Mistral-Adapter aktiv (Keys + Routing) | 0,60 | 0,60 |
| W4 | Backup-Restore-Test echt (Test-DB) | 1,40 | 2,00 |
| W5 | Trial-Ablauf-Alarm (Push) | 0,80 | 2,80 |
| W6 | Uptime-Monitor für Backup | 0,60 | 3,40 |
| H3 | Kosten-Prognose korrigiert | 0,30 | **3,70** |

**Reihenfolge:** C6 → W4/W5/W6 parallel → H3.  
**Dauer:** 2 Tage.

---

#### Tranche 5: Polish (11,40 $)

**Ziel:** Seed-Handling, Comic-Modus, Konflikt-Hinweise, Tests.

| ID | Inhalt | $ | Kumuliert |
|----|--------|---|-----------|
| B7 | Seed transparent | 1,00 | 1,00 |
| B8 | Comic-Modus klar | 0,90 | 1,90 |
| B9 | Stil-Test-Modus entfernen | 0,40 | 2,30 |
| B10 | Konflikt-Hinweise in UI | 1,00 | 3,30 |
| B11 | Kosten-Tracking persistent | 0,80 | 4,10 |
| C7 | convmeta-Zeit genauer | 0,40 | 4,50 |
| W7 | Gateway-Caching Groq/Mistral | 0,80 | 5,30 |
| W8 | Budget-Sperre GPU-Laufzeit | 1,20 | 6,50 |
| B14 | Integration Tests + Doku | 2,00 | 8,50 |
| B12 | Galerie lokal speichern | 1,50 | 10,00 |
| H4 | Tresor: Konzepte editierbar | 1,00 | 11,00 |
| H5 | Rote Punkte: Zähler | 0,80 | 11,80 |
| H6 | Kosten-Export CSV | 0,50 | **12,30** |

**Reihenfolge:** B7–B11 parallel → C7/W7/W8 parallel → B14 (Tests) → B12/H4/H5/H6 parallel.  
**Dauer:** 4–5 Tage.

---

### Gesamt-Übersicht

| Tranche | Thema | Pakete | Kosten $ | Kumuliert $ | Dauer (Tage) |
|---------|-------|--------|----------|-------------|--------------|
| 1 | Kritische Fixes | B1, C1, C2, B2, B3 | 6,50 | 6,50 | 3–4 |
| 2 | Wächter + GPU | W1, W3, H1, W2, B13 | 5,70 | 12,20 | 2–3 |
| 3 | UX-Verbesserungen | B5, B6, C4, C5, H2, B4, C3 | 8,70 | 20,90 | 3–4 |
| 4 | Ersatzanbieter + Backup | C6, W4, W5, W6, H3 | 3,70 | 24,60 | 2 |
| 5 | Polish | B7–B14, C7, W7–W8, H4–H6 | 12,30 | **36,90** | 4–5 |

**Gesamt:** 14–18 Tage (bei serieller Abarbeitung), real 3–4 Wochen (weil Christian zwischen Tests wartet, Iterationen).

**Empfehlung:** Tranchen 1–2 sofort (Must-Haves, 12 $), Tranche 3 danach (UX, 9 $), Tranchen 4–5 parallel oder nach Bedarf (Ersatzanbieter/Polish, 16 $).

---

# Detail-Abschnitte je App


---

# Bild-&-Prompt-App (Prompt-&-Bild-Dienst, jeffa-bild)

## Ist-Zustand ehrlich

### Funktioniert
- **Grundstruktur existiert**: `apps/bild/bild.js`, `bild.css`, `index.html`, `core.js` – die App lädt und zeigt UI-Elemente.
- **Authentifizierung**: Hash-Token-Parsing (`parseSessionHash`) funktioniert, 401 führt zu Login-Hinweis.
- **Profil-Laden**: `/api/profiles` wird aufgerufen, Dropdown wird befüllt (sofern die API erreichbar ist).
- **Kostenschätzung**: `costOf(mode, quality, panels, adult)` in `core.js` rechnet korrekt (Tests grün).
- **Proxy-Logik**: `src/bild/proxy.ts` + `fallback.js` – Timeout (75 s), Fallback bei 503 `not_configured`, Header `x-bild-source` – Code ist da und getestet.
- **Service-Endpunkt**: `services/bild/functions/api/image.ts` ruft `handleImage` auf, authentifiziert mit `requireRole('read')`.
- **Server-Prompt-Dienst** (`src/imgsvc-image.ts` `imageNewMode`):
  - Lädt Profil aus D1 (`profiles_sync`), Card, Corrections, Ref-Bild.
  - Ruft Szenen-Schreiber (`writeSceneInfo`) mit dem Chat-Kontext auf → englische Szenen-Beschreibung.
  - Baut mit `resolveLayers` + `buildRulePrompt` oder LLM-Composer (`/api/imagefb/compose`) den finalen Prompt.
  - Generiert Bild via Venice (`/api/v1/image/generate` oder `/edit`), speichert in R2 (`storeGenerated`), loggt Kosten (`trackUsage`).
  - Gibt JSON mit `dataUrl`, `url` (R2), `seed`, `prompt`, `model`, `cost`, `scene`, `conflicts` zurück.
- **Alterschutz**: `minorRisk` prüft Alter < 21 und Jugend-Wörter → 403 `not_adult` (v60).
- **FSK18-Pfad**: `adult=true` → immer `chroma` (v46 AP5), kein Gemini im Szenen-Schreiber/Composer (v38).
- **Tests**: 134/134 grün, aber nur Strings/reine Funktionen – kein echter Bildfluss, kein Browser-Test.

### Kaputt / funktioniert nicht richtig (mit Belegen)

1. **GPU-Schalter 404** (Prüfer 30.10.2026): `/api/gpu` live → 404 "Unbekannter API-Endpunkt", obwohl `functions/api/gpu.ts` existiert. Routing fehlt oder Datei wird nicht deployt. → GPU-Ausbau ist nur Gerüst.

2. **Modellwahl "Hohe Qualität" / "Lustify v8" inkonsistent**:
   - **Hub `settings.js` Z.52–60**: Dropdown `s-imgq` mit Werten `single|mix|lustify|hq|refine|refine-firered|krea`. Text: "Hohe Qualität – Standard: qwen-image-3 (≈ 0,04 $) · FSK18: lustify v8 mit 50 Schritten (≈ 0,01 $)".
   - **`image-handler.ts` Z.57–75**: `lustify = !safeMode && !comicStyle && !body.model` → bestimmt von FSK18/Stil, nicht von `quality`. Z.92–103: `if (quality === 'hq') return safeMode ? qwen-image-3 : lustify-v8`.
   - **Widerspruch**: FSK18 + `quality=hq` → `lustify-v8` (Z.100), aber `quality=single` + FSK18 → `chroma` (Z.105 `!safeMode ? "chroma"`). Dropdown sagt "FSK18 immer chroma" (v46 Z.104), Code macht bei `hq` eine Ausnahme. Settings-Text verspricht "lustify v8 mit 50 Schritten", aber `imageNewMode` in `imgsvc-image.ts` Z.115 `routeModel({ adult })` → immer `chroma` bei FSK18, Qualitätswahl ignoriert. **Legacy-Pfad (`image-handler`) und neuer Pfad (`imageNewMode`) liefern bei gleichem Input unterschiedliche Modelle.**

3. **Negativ-Prompts unterschiedlich gebaut**:
   - **Client `chat.js` Z.803–849**: baut `negative = NEG_SINGLE + (isAdult ? NEG_ADULT_REAL : '') + outfit?.neg + corr?.negative`.
   - **Server `imgsvc-core.js` `buildRulePrompt` Z.158–161**: `negative = [NEG_SINGLE, adult && style !== 'comic' ? NEG_ADULT_REAL : '', L.outfitNeg, L.corrections.negative]`.
   - **Unterschied**: Client hängt Adult-Neg immer an, Server nur bei `style !== 'comic'`. Outfit-Neg-Quelle ist gleich, aber Client nutzt `outfitFor`-Logik, Server `resolveLayers` → bei gleichem Profil können unterschiedliche Negativ-Prompts entstehen. **Zwei Pfade, zwei Ergebnisse.**

4. **Szenen-Schreiber fügt Extra-Personen ein**:
   - **System-Prompt `SCENE_SYSTEM` in `imgsvc-scene.ts` Z.4–5**: "other people (each by gender and look as described; the chat partner only if physically present in this moment)".
   - **Problem**: Wenn der Chat nur von der Figur spricht ("Sie liegt im Bett"), aber der LLM-Kontext vorher einen Partner erwähnt, kann der Szenen-Schreiber "a man standing nearby" hinzufügen, obwohl die aktuelle Nachricht solo ist. Christian sagt: "Szenen-Schreiber fügt zusätzliche Personen ins Bild ein."
   - **Ursache**: Szenen-Schreiber sieht 8 Nachrichten (`msgs.slice(-8)` in `imgsvc-image.ts` Z.126), aber nur die letzte ist „latest" – ältere Erwähnungen können durchsickern. Keine explizite Anweisung "ONLY people actively present in the CURRENT moment, ignore mentions in earlier chat".

5. **Outfit-Zustände (nasses Shirt, wet, soaked, torn) nicht umgesetzt**:
   - **`imgsvc-core.js` `outfitEmphasis` Z.41–42**: "The clothes are visibly soaked and dripping wet, with dark damp patches, the fabric clinging tightly, water droplets on fabric and skin." – detaillierte Beschreibung, wenn `/\bwet\b|nass|soaked|damp/i` im Outfit.
   - **`imgsvc-core.js` `addCues` Z.46**: fügt `outfitEmphasis(L.outfit)` am **Anfang** des Prompts ein (v60).
   - **Problem**: Venice-Modelle ignorieren oft den Prompt-Anfang oder lange Beschreibungen (chroma: 3000 Zeichen, andere 1500). `addCues` wird nur im `style === 'real' || 'story'` Pfad in `imgsvc-image.ts` Z.150 gerufen. Im Legacy-Client-Pfad (`chat.js` Z.850) wird `addCues` gar nicht benutzt. **Zwei Pfade → einmal mit Outfit-Emphasis, einmal ohne.** Außerdem: keine Gewichtung `(wet:1.4)` o.ä., nur Prosa → Modell ignoriert oft.
   - **System-Prompt `SCENE_SYSTEM` Z.4**: "Keep size and state words exactly (tiny, micro, minimal, see-through, wet, soaked, torn) and show them visibly." – aber das gilt nur für den Szenen-Schreiber, nicht für den finalen Bildprompt. Der Szenen-Schreiber gibt eine Beschreibung zurück, die dann in `buildRulePrompt` / `COMPOSER_SYSTEM` eingebaut wird – dort steht **nichts** darüber, State-Wörter hervorzuheben.

6. **Autofill-Knöpfe (✨ Automatisch ausfüllen) nicht verlässlich**:
   - **`imagefb-handler.ts` `autofill` Z.35–57**: Ruft LLM mit `AF_SYSTEM` auf (für Stil/Outfit), parsed JSON (`parseAutofill`), scrubbt Jugend-Wörter (`scrubYouth`).
   - **Problem**: Output ist LLM-generiert, keine deterministische Vorlage. Christian sagt "liefern nicht verlässlich Brauchbares" → LLM-Output variiert, manchmal zu generisch ("adult woman, casual outfit"), manchmal mit Halluzinationen. Keine Deterministik wie bei den festen Stil-/Outfit-Dropdowns (`CATALOG` in `photoopts.js`).
   - **`AF_SYSTEM` Z.8**: "Use ONLY the given character data… do not invent a different identity." – aber LLM-Adherence variiert. Wenn wenig Kontext (Name, Beschreibung leer), erfindet der LLM Platzhalter.

7. **Zwei parallele Prompt-Pfade → Gefahr von Doppelungen / Inkonsistenzen**:
   - **Legacy Client-Pfad**: `apps/chat/chat.js` Z.740–870 `generateImageInChat` → baut Prompt mit `w(sc, 1.35)`, `ANGLES`, `STYLE`, `outfitFor`, `corr?.positive`, `styleFor`, `llmScene` → sendet an `/api/image` mit `{ prompt, style, quality, scene, person, negative, seed, ref_profile, ref_mode, model }`.
   - **Server-Pfad**: `src/imgsvc-image.ts` `imageNewMode` → `resolveLayers` → `buildRulePrompt` oder LLM-Composer → `enforceLocked` → sendet an Venice.
   - **Wann welcher Pfad?**
     - Client-Pfad: `chat.js` Z.795 `if (quality === 'single' || !quality) { try { await syncProfile; api('/api/image', { body: { profile, style, quality, context } }); } catch { /* fallback to client prompt */ } }`.
     - Fallback passiert bei Fehler oder wenn `quality !== 'single'` → Z.827 `api('/api/image', { body: { prompt, style, quality, scene, person, negative, … } })`.
   - **Bild-App `bild.js` Z.94–119**: `buildBody(state)` → wenn `profile !== 'none'` → `{ profile, style, adult, quality, seed, context }` (neuer Pfad), sonst `{ prompt, style, adult, model, width, height, seed }` (Legacy).
   - **Problem**: Zwei Wege zum gleichen Endpunkt `/api/image`, unterschiedliche Body-Strukturen. `handleImage` in `image-handler.ts` Z.21 prüft `if ((body as any).profile && !body.prompt) return imageNewMode(…)`, sonst Legacy-Pfad Z.24–140. → **Reihenfolge und Bedingungen unklar, welcher Pfad wann greift. Neuer Pfad wirft bei Fehler nicht immer, sondern Client-Code versucht Fallback mit eigenem Prompt → Doppelarbeit und inkonsistente Ergebnisse.**

8. **Vorschau des finalen Prompts fehlt**:
   - Nirgendwo im Code wird der finale Prompt **vor** dem Generieren angezeigt. `bild.js` zeigt nur Kostenschätzung (`costOf`), kein Prompt-Preview. Nach dem Generieren ist der Prompt in `<details><summary>Prompt</summary><pre>…</pre></details>` (Z.161), aber nicht davor. Christian kann nicht sehen, was tatsächlich an Venice geschickt wird, bevor er auf "Generieren" klickt.

9. **Comic-Modus in Bild-App unklar**:
   - `bild.js` Z.102–114: `if (mode === 'comic') { for (i < panels) { body.context.camera = cameras[i % 4]; await api('/api/image', …); } }`.
   - `core.js` Z.37–43: `if (mode === 'comic') { body._mode = 'comic'; body._panels = panels; body._cameras = […]; }`.
   - **Widerspruch**: `bild.js` sendet N einzelne Requests (serielle Schleife), `core.js` baut einen Body mit `_mode` / `_cameras` → sieht aus wie ein Request. **Code inkonsistent, nicht klar, was tatsächlich passiert.**

10. **Stil-Test-Modus (3 Stile) ohne echten Use-Case**:
    - `bild.js` Z.115–121: `if (mode === 'stil-test') { for (s of ['real','anime','comic']) { await api('/api/image', { …, style: s }); } }`.
    - Christian hat nie von "Stil-Test" gesprochen. Das ist ein Entwickler-Feature ohne echten Nutzer-Wert → UI-Clutter.

### Nur Gerüst (ohne echte Funktion)

- **GPU-Endpunkt** (`functions/api/gpu.ts`): existiert, wird deployt, aber live 404 → Routing fehlt oder Datei defekt.
- **Runware, Groq, Mistral**: Adapter in v67, aber ohne Keys → 503 (Prüfer: "nicht eingerichtet").
- **LoRA-Training**: nirgendwo im Code erwähnt, nur im Ausbau-Konzept geplant.
- **Vorschau-Feature**: nicht implementiert.

---

## Nutzerziele (Christian)

1. **Bildgenerierung funktioniert verlässlich**: Outfit-Zustände (wet shirt) werden sichtbar umgesetzt, Szenen-Schreiber fügt keine Extra-Personen ein, Modellwahl ist klar und konsistent.
2. **Einfache Bedienung, wenig Tippen**: Dropdowns/Vorlagen für Szene, Stil, Outfit, Pose – wie in der Prompt-App, aber ohne doppelte Eingaben.
3. **Vorhersagbarkeit**: Vorschau des finalen Prompts **vor** dem Generieren, damit Christian sieht, was an Venice geht.
4. **Deterministik**: Gleiche Einstellungen → gleiches Ergebnis (bis auf Seed-Varianz). Keine parallelen Pfade, die unterschiedliche Prompts bauen.
5. **Alterschutz bleibt**: 21+ Gate, Jugend-Wörter blockiert, keine Schwächung.
6. **Kosteneffizienz**: Standard-Weg nutzt günstigste Modelle (chroma 0,01 $, z-image-turbo 0,01 $), teure Optionen klar beschriftet.
7. **Autofill brauchbar**: Wenn LLM-Autofill, dann mit festen Beispielen als Fallback oder ganz deterministisch (feste Vorlagen statt LLM).

---

## Ziel-Funktionen mit Priorität

| Funktion | Prio | Begründung |
|----------|------|------------|
| **Eindeutiger Prompt-Pfad** (nur Server-Pfad, Legacy raus) | **Must** | Zwei Pfade → inkonsistent, wartungsintensiv. Nur `imageNewMode` behalten, Client-Code baut nur noch Request-Body. |
| **Prompt-Vorschau vor Generieren** | **Must** | Christian sieht, was gesendet wird, kann abbrechen/ändern. Verhindert frustrierende Fehler. |
| **Outfit-Zustände gewichtet** (wet, soaked, torn mit explizitem Wording + Prio) | **Must** | Christian beschwert sich: "wet shirt wird nicht umgesetzt". Lösung: State-Wörter extrahieren, am Prompt-Anfang mit klarer Beschreibung. |
| **Szenen-Schreiber: nur aktuelle Personen** (keine Halluzinationen) | **Must** | System-Prompt schärfen: "ONLY people physically present in the CURRENT moment (latest message); ignore past mentions." |
| **Modellwahl konsistent** (FSK18 → immer chroma, kein hq-Sonderfall) | **Must** | Code widerspricht Settings-Text. Vereinheitlichen: FSK18 → chroma, Ende. `hq` in FSK18 → trotzdem chroma (mit mehr Steps?), oder `hq` ist Standard-only. |
| **Negativ-Prompts vereinheitlicht** | **Must** | Server-Logik ist die Quelle, Client übernimmt 1:1. |
| **Deterministischer Autofill** (feste Vorlagen statt LLM) | **Should** | LLM-Output variiert. Feste Listen (wie `CATALOG` in `photoopts.js`) sind zuverlässiger. LLM nur als Fallback. |
| **Comic-Modus Klarheit** (N Requests oder 1 Request mit Panels?) | **Should** | Derzeit unklar. Entscheiden: entweder N serielle Requests (Client-Loop) oder 1 Request mit Panel-Array (Server splittet). |
| **Stil-Test-Modus entfernen** | **Should** | Kein Nutzerziel, nur Clutter. |
| **Seed-Handling transparent** | **Should** | Aktuell: `zufall` → `undefined`, `last` → letzter Seed (wird in `results` gespeichert). Bei Server-Pfad: Seed im Profil gespeichert, aber Bild-App hat eigenen Seed-State → inkonsistent. Lösung: Seed kommt aus Profil, Bild-App erlaubt Override. |
| **Kosten-Live-Anzeige nach Generierung** | **Should** | Aktuell: `costOf` schätzt, aber echte Kosten kommen erst im Response. Summierung in `totalCost` funktioniert (Z.145), aber nicht persistent. |
| **R2-Speicherung verlässlich** | **Later** | `storeGenerated` läuft, aber non-fatal (Z.58 `await storeGenerated(…)`). Wenn R2 fehlt, bleibt `dataUrl` als Fallback. OK für v1. |
| **LoRA-Unterstützung** | **Later** | Erst nach GPU-Server (Ausbau-Konzept 1a/2). |
| **Feedback-Loop in Bild-App** | **Later** | Aktuell nur im Chat (👍/👎). Bild-App könnte eigene Rating-UI bekommen, sendet an `/api/imagefb`. |

---

## UX-Ablauf mit Dropdowns

### Schritt-für-Schritt (Bild-App `apps/bild/`)

1. **Anmeldung / Authentifizierung**  
   - User öffnet `jeffa-bild.pages.dev` **ohne** Hash → Login-Hinweis, Link zu Hub.  
   - **Oder** Hub → 🖼 Bild-App → öffnet `https://jeffa-bild.pages.dev/#s=<token>` → Token in `localStorage`, Hash entfernt.  
   - Standardwert: leer (anonym) → 401 bei erstem API-Call → Login-Hinweis.

2. **Modus wählen** (Dropdown `mode-select`)  
   - Optionen: `Einzelbild` (Standard) | `Comic` | `Stil-Test`.  
   - Standardwert: `Einzelbild`.  
   - **Änderung**: `Stil-Test` entfernen (Prio Should), nur `Einzelbild` und `Comic`. Comic → Panel-Anzahl erscheint.

3. **Profil wählen** (Dropdown `profile-select`)  
   - Optionen: `Ohne Profil (freie Szene)` (Standard) | `<Name 1>` | `<Name 2>` …  
   - Standardwert: `Ohne Profil`.  
   - Wenn Profil gewählt → Server-Pfad (`imageNewMode`), Look/Outfit/Pose aus Profil.  
   - Wenn `Ohne Profil` → Legacy-Pfad (freier Prompt).

4. **Panels** (Dropdown `panels-select`, nur sichtbar wenn Profil ≠ `none` UND Modus = `Comic`)  
   - Optionen: `2` (Standard) | `3` | `4`.  
   - Standardwert: `2`.

5. **Stil** (Dropdown `style-select`)  
   - Optionen: `Real` (Standard) | `Anime` | `Comic` | `Manhwa`.  
   - Standardwert: `Real`.  
   - **Änderung**: `comicpage` raus (nur im Hub-Chat relevant, nicht in Bild-App).

6. **Format** (Dropdown `format-select`, v53)  
   - Optionen: `Hochformat 768×1024` (Standard) | `Quadrat 1024×1024` | `Querformat 1024×768`.  
   - Standardwert: `Hochformat`.

7. **Qualität/Modell** (Dropdown `quality-select`)  
   - Optionen:  
     - `Auto` (Standard, → z-image-turbo bzw. chroma bei FSK18, 0,01 $)  
     - `Spar (0,01 $)` (z-image-turbo)  
     - `Mittel (0,02 $)` (qwen-image-2-1-turbo)  
     - `Qualität (0,04 $)` (qwen-image-3)  
   - Standardwert: `Auto`.  
   - **FSK18-Regel**: Wenn Checkbox aktiv, alle Optionen → `chroma` (0,01 $). Anzeige: "FSK18 nutzt immer chroma (0,01 $), unabhängig von der Qualität."

8. **Szene** (Dropdown `scene-select` + optionales Freitextfeld `own-scene-input`)  
   - Dropdown mit festen Szenen: `Café` | `Strand bei Sonnenunterricht` | `Bibliothek` | … (aus `SCENES` Z.3).  
   - **Erweitern**: Szenen aus `PRESETS['own-scene-input']` in `apps/shared/quickfill.js` einfügen (Z.9: "am Strand bei Sonnenuntergang" etc.).  
   - Freitextfeld darunter: "Eigene Szene (optional)". Wenn ausgefüllt, überschreibt es Dropdown.  
   - **Neu**: "📋 Vorlage wählen …"-Dropdown vor dem Freitextfeld (wie in v64), hängt an.  
   - Standardwert Dropdown: `Café`. Standardwert Freitext: leer.

9. **FSK18 aktiviert** (Checkbox `fsk18-checkbox`)  
   - Label: "FSK 18 aktiviert (21+)".  
   - Standardwert: `localStorage.getItem('jeffa.bild.fsk18') === 'true'` (Z.183).  
   - **Änderung**: Bei Aktivierung → Bestätigung "Bestätigst du, dass du mindestens 21 Jahre alt bist?" (wie in `apps/shared/fsk.js`). Bei Abbruch → Checkbox bleibt aus.

10. **Seed** (Dropdown `seed-select`)  
    - Optionen: `Zufall` (Standard) | `Letzten wiederverwenden`.  
    - Standardwert: `Zufall`.  
    - Wenn Profil gewählt → Seed aus Profil (`profile.seed` / `profile.seedVary`), Dropdown zeigt zusätzlich "Aus Profil (<seed>)".  
    - **Neu**: Manueller Seed als Textfeld (optional, für Power-User). Validierung: Ganzzahl 0–999999999.

11. **Vorschau Prompt** (Button "🔍 Prompt zeigen", neu)  
    - Unter "Generieren"-Button, ausgegraut bis Profil/Szene gesetzt.  
    - **Klick** → API-Call `/api/image` mit `{ …, dryRun: true }` (v54 Z.147) → Response: `{ prompt, negative, model, size, composer, scene, conflicts }`.  
    - **Anzeige**: Modal mit Prompt (syntaxhervorgehoben, scrollbar), Negativ-Prompt, Modell, Konflikte (falls vorhanden: "Entfernt: <Wort> aus <Slot>, behalten: <Profil-Wert>").  
    - **Aktion**: "Abbrechen" schließt Modal. "Trotzdem generieren" führt echten Request aus. "Prompt bearbeiten" → Freitextfeld (überschreibt Server-Prompt, wird als `promptOverride` mitgeschickt).

12. **Generieren** (Button `generate-btn`)  
    - **Aktion**:  
      - Wenn `Einzelbild`: 1 Request.  
      - Wenn `Comic`: N Requests (seriell, `panels` mal), jeder mit anderem `context.camera` (Z.108–111).  
    - **Spinner** (Z.88): "Bild wird gemalt…" / "Comic wird gemalt…".  
    - **Timeout**: 90 s (Z.87), danach Fehler-Card "Zeitüberschreitung".  
    - **Response**: `{ dataUrl, url, model, cost, seed, prompt, negative, composer, scene, conflicts }`.  
    - **Ergebnis-Card**: Bild, Metadaten (Modell, Kosten, Seed), Prompt in `<details>`, Konflikt-Hinweise (falls `conflicts.length`), Aktionen (⬇ Speichern, 🔁 Gleicher Seed).

13. **Ergebnisse** (Liste `#results`)  
    - **Oben**: Gesamtkosten "Gesamt: ≈ <totalCost> $" (Z.145).  
    - **Pro Bild**: Card mit Bild, Meta (Modell · Kosten · Seed), Prompt (Details klappbar), Aktionen (Download, Reseed).  
    - **Persistenz**: Nur in Session (bei Reload weg). **Neu**: `localStorage`-Speicherung der letzten 20 Bilder (opt-in via Checkbox "Galerie speichern").

---

## Architektur / Daten / API-Änderungen

### Dateien (konkret)

#### Entfernen / vereinfachen
- **`apps/chat/chat.js` Z.740–870**: Legacy-Prompt-Bau raus. Nur noch Request-Body bauen (`{ profile, context, style, adult, quality, seed }`), API-Call, Response verarbeiten. Keine eigene Prompt-Logik mehr.
- **`apps/bild/core.js` Z.37–43**: `_mode` / `_panels` / `_cameras` raus (wird nicht vom Server gelesen). Comic-Loop bleibt in `bild.js`, jeder Request einzeln.

#### Ändern
- **`src/bild/image-handler.ts`**:
  - Z.21: `if (body.profile && !body.prompt) return imageNewMode(…)` **und** `else if (body.prompt) { /* legacy path, aber nur als Admin-Override */ await requireRole(ctx, 'admin'); … }`.  
  - → Standard-Nutzer ohne `profile` → 400 `bad_input`. Nur Admin darf freien Prompt senden.
  - Z.57–75: `lustify`-Logik raus (FSK18 → immer chroma, keine Ausnahme).
  - Z.92–103: `quality`-Routing vereinfachen: FSK18 → `chroma`, Ende. Standard: `spar` → z-image-turbo, `mittel` → qwen-2.1-turbo, `qualitaet` → qwen-3.
  - Z.104–140: Legacy-Pfad (HuggingFace, Venice-Direkt) raus oder nur als Fallback, wenn `imageNewMode` fehlschlägt.

- **`src/imgsvc-image.ts` `imageNewMode`**:
  - Z.115: `routeModel({ style, adult, quality })` → FSK18 ignoriert `quality` → immer `{ model: 'chroma', cost: 0.01 }`.
  - Z.126–136: Szenen-Schreiber-Kontext: nur die **letzte** Nachricht zählt für Personen. Ältere Nachrichten für Kontext, aber nicht für "wer ist im Bild".
  - Z.140: `addCues` **immer** (nicht nur `style === 'real'`), aber nur wenn Outfit-State-Wörter vorhanden.
  - Z.147: `dryRun` → Response erweitern: `{ …, negative, conflicts, composer }`.
  - Z.160–169: Negativ-Prompt aus `buildRulePrompt`, nicht neu bauen.

- **`src/imgsvc-core.js`**:
  - `outfitEmphasis` Z.41–42: State-Wörter (wet, soaked, torn, see-through, ripped, stained) extrahieren, am **Anfang** des Prompts mit expliziter Beschreibung + Kontrast (z.B. "The white shirt is visibly soaked and clinging to her skin, with dark wet patches and water droplets."). Kein Satz-Append, sondern Keyword-Block: `wet clinging white shirt, dark damp patches, water droplets on fabric and skin`.
  - `SCENE_SYSTEM` in `imgsvc-scene.ts` Z.4: erweitern um "ONLY people physically present and visible in the CURRENT moment (the latest message). Do not add people mentioned in earlier chat history unless they are explicitly in this scene. If the latest message describes her alone, show her alone."
  - `buildRulePrompt` Z.158–161: Negativ-Prompt-Bau ist die einzige Quelle (Client übernimmt 1:1).

- **`src/imgsvc-scene.ts` `SCENE_SYSTEM`**:
  - Neu: "State words (wet, soaked, torn, see-through, ripped, dirty) must be shown visibly with strong visual detail: wet means dark damp patches, clinging fabric, visible water droplets; torn means rips and frayed edges; see-through means translucent fabric showing skin underneath."
  - Neu: "ONLY people physically present in the CURRENT moment (latest message). Do not infer or add people from earlier chat unless they are explicitly here now."

- **`src/imgsvc-db.ts`**:
  - Keine Änderung nötig (Funktionen getestet, grün).

- **`apps/bild/bild.js`**:
  - Z.102–114: Comic-Loop bleibt, aber `body` ohne `_mode`. Jeder Request: `{ profile, context: { scene, camera: CAMERAS[i] }, style, adult, quality, seed }`.
  - Z.115–121: Stil-Test-Modus **raus**.
  - **Neu**: Button "🔍 Prompt zeigen" (Z.~85, vor "Generieren"). Klick → `api('/api/image', { …, dryRun: true })` → Modal mit Prompt/Negative/Modell, Buttons "Abbrechen" / "Bearbeiten" / "Generieren".
  - **Neu**: Prompt-Bearbeiten-Modal → Textarea, Speichern → `body.promptOverride = <text>`, Server prüft Admin-Rolle oder ignoriert (später: nur Admin).

- **`apps/bild/index.html`**:
  - Z.60: Seed-Dropdown erweitern: Option "Manuell eingeben" → zeigt Textfeld `<input type="number" id="seed-input" min="0" max="999999999">`.
  - **Neu**: Button `<button class="btn-sm" id="preview-btn">🔍 Prompt zeigen</button>` vor "Generieren".
  - **Neu**: Checkbox `<input type="checkbox" id="save-gallery"> Galerie lokal speichern (letzte 20 Bilder)` unter "Generieren".

- **`apps/bild/bild.css`**:
  - **Neu**: `.prompt-modal` (Fullscreen-Modal mit Syntax-Highlighting für Prompt, scrollbar).
  - `.result-card`: Konflikt-Hinweis als `.conflict-notice` (gelber Rahmen, Icon ⚠️).

#### Hinzufügen
- **`src/imgsvc-prompt-preview.ts`** (neu):
  - Funktion `buildPreview(env, body)` → wie `imageNewMode`, aber stoppt vor Venice-Call. Gibt `{ prompt, negative, model, size, composer, scene, conflicts }` zurück.
  - Verwendet `resolveLayers`, `buildRulePrompt`, `routeModel`.
  - Cached per `profile:scene:style:quality` (KV, 1 h TTL).

- **`functions/api/image-preview.ts`** (neu):
  - `POST /api/image-preview` → ruft `buildPreview` auf, gibt JSON zurück.
  - Authentifizierung: `requireRole('read')`.

### D1-Tabellen (keine Änderung nötig)
- `profiles_sync`: bereits vorhanden (v27).
- `character_cards`: bereits vorhanden.
- `image_feedback`, `image_feedback_corr`: bereits vorhanden (v22).
- `ref_settings`, `profile_refs`: bereits vorhanden (v30).

### KV-Schlüssel
- `reflook:v1:<hash>`: bereits vorhanden (v36).
- `imgp:<profile>:<hash>`: bereits vorhanden (Composer-Cache).
- **Neu**: `imgpreview:<profile>:<scene-hash>:<style>:<quality>` → Preview-Cache (1 h).

### API-Endpunkte

| Endpunkt | Methode | Body | Response | Änderung |
|----------|---------|------|----------|----------|
| `/api/image` | POST | `{ profile, context, style, adult, quality, seed, dryRun?, photoOverride? }` | `{ dataUrl, url, model, cost, seed, prompt, negative, scene, composer, conflicts }` | `dryRun` → erweitert (negative, conflicts). FSK18 → immer chroma. |
| `/api/image` (Admin) | POST | `{ prompt, style, adult, model, width, height, seed }` | wie oben | Nur für Admin (freier Prompt). |
| `/api/imagefb/scene` | POST | `{ adult, character, context, fixed? }` | `{ scene, model, error }` | System-Prompt schärfen (nur aktuelle Personen). |
| `/api/imagefb/compose` | POST | `{ adult, settings, context, corrections }` | `{ prompt }` | Keine Änderung (funktioniert). |
| `/api/imagefb/autofill` | POST | `{ section, adult, profile }` | `{ fields, model }` | **Änderung**: Fallback auf feste Vorlagen, wenn LLM versagt. |

---

## Anbieter-Strategie

### Venice (Haupt-Anbieter)
- **Modelle**:
  - `chroma` (FSK18, uncensored, 0,01 $/Bild, 768×1024 oder 1024×1024, max 3000 Zeichen Prompt).
  - `z-image-turbo` (Standard Spar, 0,01 $/Bild, 1024×1024, max 1500 Zeichen).
  - `qwen-image-2-1-turbo` (Mittel, 0,02 $/Bild, 1024×1024).
  - `qwen-image-3` (Qualität, 0,04 $/Bild, 1024×1024).
- **Nutzung**: Alle Bild-Requests, außer LoRA (kommt später).
- **Kosten**:
  - Standard-Weg (Spar, z-image-turbo): 0,01 $ pro Bild.
  - FSK18 (chroma): 0,01 $ pro Bild.
  - Comic 3 Panels: 3 × 0,01 $ = 0,03 $.
  - Qualität (qwen-3): 0,04 $ pro Bild.
- **Annahmen**: Christian hat Venice-Guthaben (läuft über venice.ai). Kein Auto-Reload → bei 0 $ stoppt Generation (v54 zeigt "Guthaben leer"). Monatlich ca. 50–100 Bilder → ca. 0,50–4 $ (je nach Qualität).

### Runware (Backup, später)
- **Gratis-Guthaben**: 2 $ (laut Ausbau-Konzept).
- **Nutzung**: Fallback, wenn Venice 402 / 503 liefert.
- **Integration**: Adapter in v67 vorhanden (`src/providers/runware.ts`), aber ohne Key → 503. Erst aktiv, wenn Christian Key im Tresor ablegt.
- **Kosten**: 0 $ (solange Gratis-Guthaben reicht).

### GPU auf Abruf (Modal/RunPod/AWS, später)
- **Nur für LoRA** und **uncensored Chat** (Ausbau-Konzept 1a/4).
- **Nicht** für Standard-Bilder (Venice ist billiger und schneller).
- **Kosten**: Modal 30 $/Monat Gratis-Guthaben (L4 ca. 0,80 $/h). RunPod ca. 0,34–0,89 $/h (RTX 4090). AWS g6.xlarge ca. 1,01 $/h.
- **Strategie**: Erst GPU einrichten, wenn LoRA-Training gewünscht oder Venice-Limits erreicht.

### Groq, Mistral (Chat-Ersatz, nicht Bild)
- **Nur für Chat** (LLM), nicht für Bilder.
- Groq: Whisper für Spracheingabe (2000 Anfragen/Tag gratis).
- **Kosten**: 0 $.

### Zusammenfassung Kosten

| Szenario | Anbieter | Kosten/Monat (Annahme) |
|----------|----------|-------------------------|
| 50 Bilder Spar (z-image-turbo) | Venice | 0,50 $ |
| 50 Bilder FSK18 (chroma) | Venice | 0,50 $ |
| 100 Bilder Mittel (qwen-2.1-turbo) | Venice | 2 $ |
| 20 Bilder Qualität (qwen-3) | Venice | 0,80 $ |
| 10 Comics à 3 Panels (Spar) | Venice | 0,30 $ |
| Szenen-Schreiber 100 Aufrufe (Gemini Flash) | Google | ~0 $ (Gratis-Tier 1500 Anfragen/Tag) |
| LLM-Composer 50 Aufrufe (Gemini Flash) | Google | ~0 $ (Gratis-Tier) |
| **Gesamt typisch** (50 Bilder Spar + 20 FSK18 + 10 Comics) | | **1 $** |
| **Gesamt viel** (100 Bilder Mittel + 20 Qualität) | | **2,80 $** |

---

## Testplan und Abnahmekriterien

### Funktionsweise (Must)

#### F1: Prompt-Vorschau
**Fertig heißt**:
1. Bild-App: Button "🔍 Prompt zeigen" unter Einstellungen (vor "Generieren").
2. Klick → API-Call `/api/image` mit `dryRun: true`, Response in < 3 s.
3. Modal öffnet: Prompt (scrollbar, > 100 Zeichen), Negativ-Prompt, Modell (z.B. "chroma"), Format (z.B. "768×1024"), Konflikt-Liste (wenn vorhanden: "Entfernt: blonde aus Haar, behalten: braun").
4. Buttons: "Abbrechen" (Modal schließt), "Trotzdem generieren" (echte Generation startet).
5. **Live-Test**: Profil mit "Haar: braun" gespeichert, Szene "blonde Frau am Strand" → Vorschau zeigt Konflikt "Entfernt: blonde, behalten: braun". Prompt enthält "braun" statt "blonde".

#### F2: Outfit-Zustände sichtbar
**Fertig heißt**:
1. Profil: Outfit "weißes T-Shirt", Szene "nasses Shirt" oder Chat-Nachricht "Sie kommt aus dem Pool, Shirt klebt an ihr".
2. Generieren → Prompt enthält am **Anfang** (erste 200 Zeichen): "wet clinging white shirt, dark damp patches, water droplets on fabric and skin".
3. **Live-Test Venice**: Generiertes Bild zeigt sichtbar nasses Shirt (dunkle Flecken, durchsichtig). Mindestens 3 von 5 Bildern zeigen Nässe klar.
4. Prompt-Vorschau: Zeigt "wet clinging …" im Prompt (vor Identity).

#### F3: Szenen-Schreiber – nur aktuelle Personen
**Fertig heißt**:
1. Chat-Verlauf: 5 Nachrichten, darin "Er steht neben ihr", danach 2 weitere Nachrichten, letzte: "Sie liegt allein im Bett".
2. Szenen-Schreiber-Output (in `gen.llmScene`): enthält **nicht** "a man" oder "he" (nur "the woman lying alone in bed").
3. **Live-Test**: 3 verschiedene Solo-Szenen nach Paar-Kontext → alle 3 zeigen nur die Figur, keine Extra-Person im Bild.
4. Fehlerfall: Wenn Szenen-Schreiber doch Person hinzufügt → Fehlercode, Fallback auf rohe Szene (ohne LLM).

#### F4: Modellwahl konsistent (FSK18 → immer chroma)
**Fertig heißt**:
1. FSK18-Checkbox aktiv, Qualität "Mittel" (qwen-2.1-turbo) gewählt.
2. Generieren → Response `model: "chroma"`, `cost: 0.01`.
3. Prompt-Vorschau: zeigt "Modell: chroma (FSK18)", nicht qwen.
4. **Live-Test**: 5 Bilder FSK18, alle Qualitätsstufen → alle `model: "chroma"`.
5. Settings-Dropdown-Text: "FSK18 nutzt immer chroma (0,01 $), unabhängig von der Qualität."

#### F5: Negativ-Prompts gleich (Server = Quelle)
**Fertig heißt**:
1. Profil: Outfit-Neg "bikini, swimsuit", Feedback-Neg "blur, lowres".
2. Server-Pfad (neuer Modus): Negativ-Prompt = `NEG_SINGLE + NEG_ADULT_REAL (wenn FSK18 & real) + outfit.neg + corrections.negative`.
3. **Live-Test**: Gleiches Profil, gleiche Szene, 2× generieren → beide Male gleicher Negativ-Prompt (Zeichenfolge exakt).
4. Client-Code (`chat.js`) baut Negativ-Prompt **nicht** mehr selbst, sondern übernimmt aus Server-Response (beim Fallback).

### UX (Should)

#### U1: Autofill brauchbar (deterministische Vorlagen)
**Fertig heißt**:
1. Look-Tab (Chat-App) → "✨ Automatisch ausfüllen" für Stil → gibt 1 von 5 festen Vorlagen zurück (z.B. "fröhlich, gesprächig, Humor" + "natural light, casual outfit, photorealistic"). **Kein** LLM-Aufruf (oder LLM nur als Fallback, wenn feste Liste leer).
2. Outfit-Autofill → 1 von 10 festen Outfit-Beschreibungen (z.B. "grey latex micro bikini, shiny surface" aus Nachtfalter-Looks).
3. **Live-Test**: 10× Autofill → alle 10 Ergebnisse sind identisch deterministisch (keine Variation). Keine Jugend-Wörter (teen, girl, young-looking) in Output.
4. Settings: Toggle "Autofill deterministisch" (Standard an). Wenn aus → LLM-Weg (aktuell).

#### U2: Seed transparent
**Fertig heißt**:
1. Bild-App: Seed-Dropdown "Zufall" | "Letzten wiederverwenden" | "Aus Profil (123456)" | "Manuell eingeben".
2. "Aus Profil" erscheint nur, wenn Profil gewählt und `profile.seed` gesetzt.
3. "Manuell eingeben" → Textfeld, Validierung 0–999999999. Bei ungültig → Fehler "Seed muss Zahl 0–999999999 sein".
4. **Live-Test**: Seed 42 manuell eingeben, generieren → Response `seed: 42`, Bild reproduzierbar (gleiche Szene/Seed → gleiches Bild, bis auf Venice-interne Varianz).

#### U3: Comic-Modus klar (N Requests)
**Fertig heißt**:
1. Bild-App: Modus "Comic", Panels 3, Profil gewählt, generieren → 3 serielle Requests an `/api/image`, jeder mit `context.camera: <CAMERA[i]>`.
2. Spinner: "Comic Panel 1/3 …" → "Panel 2/3 …" → "Panel 3/3 …".
3. **Live-Test**: Comic 4 Panels → 4 Bilder erscheinen nacheinander (nicht parallel), Gesamt-Zeit ca. 40–60 s (10–15 s pro Panel).
4. Ergebnis: 4 Bilder in Galerie, jedes mit Meta (Modell, Kosten, Seed). Gesamt-Kosten = 4 × 0,01 $ = 0,04 $.

### Qualität (Should)

#### Q1: Konflikt-Hinweise sichtbar
**Fertig heißt**:
1. Profil: Haar "blond", Szene "schwarzhaarige Frau".
2. Prompt-Vorschau: Konflikt-Liste "Entfernt: schwarzhaarig aus Szene, behalten: blond aus Profil".
3. Ergebnis-Card: ⚠️-Symbol + Text "Konflikt: Szene wollte schwarzhaarig, Profil sagt blond → blond verwendet".
4. **Live-Test**: 3 Konflikt-Szenarien (Haar, Augen, Outfit) → alle 3 zeigen Konflikt-Hinweis in UI.

#### Q2: Kosten-Tracking
**Fertig heißt**:
1. Bild-App: Gesamt-Kosten-Anzeige oben (Z.145 `totalCost`).
2. Nach jedem Bild: `totalCost` aktualisiert, Anzeige "Gesamt: ≈ 0,05 $" (2 Nachkommastellen).
3. **Live-Test**: 5 Bilder (Spar, Mittel, Qualität gemischt) → Gesamt-Summe stimmt (manuell nachrechnen).
4. Opt-in: Checkbox "Kosten in Browser speichern" → `localStorage`, überlebt Reload.

### Sicherheit (Must)

#### S1: Alterschutz bleibt
**Fertig heißt**:
1. Profil: Alter 20 → Generieren mit FSK18 → 403 `not_adult`, Fehlermeldung "Profil muss eindeutig erwachsen sein (21+)".
2. Profil: Look enthält "jugendlich" oder "Schulmädchen" → 403.
3. **Live-Test**: 3 Profile (Alter 18, 20, Look "teen") → alle 3 blockiert bei FSK18-Versuch.
4. Code: `minorRisk` (Z.43 `imgsvc-core.js`) läuft **vor** Bildgenerierung (Z.120 `imgsvc-image.ts`).

#### S2: Admin-Prompt-Override
**Fertig heißt**:
1. Nur Admin (rolle = "admin") darf freien Prompt senden (`{ prompt, style, model }` ohne `profile`).
2. Standard-User → 403 "Admin-Berechtigung erforderlich".
3. **Live-Test**: Nicht-Admin-Session → freier Prompt → 403. Admin-Session → funktioniert.

---

## Risiken

| Risiko | Wahrscheinlichkeit | Impact | Mitigierung |
|--------|-------------------|--------|-------------|
| **Venice-API-Änderung** (Prompt-Limit, Modelle entfernt) | Mittel | Hoch | Fallback auf Runware (v67 Adapter vorhanden). Monitoring: Venice-Fehler loggen, Wächter warnt bei > 10 % Fehlerrate. |
| **Szenen-Schreiber halluziniert weiter** (Extra-Personen trotz schärferem Prompt) | Mittel | Mittel | Fallback: Wenn Output "man|men|guy" enthält, obwohl Chat solo → rohe Szene nutzen (ohne LLM). User-Feedback: 👎-Button auch in Bild-App. |
| **Outfit-Zustände trotzdem nicht sichtbar** (Venice ignoriert wet/torn) | Mittel | Mittel | Test mit 10 Bildern "wet shirt" → wenn < 5 klar nass → Wording verschärfen (z.B. "(wet clinging shirt:1.5)" mit Gewicht, aber Venice unterstützt keine Gewichte → dann visuelles Detail erhöhen: "soaking wet white shirt, completely drenched, water streaming down, dark grey wet patches, see-through translucent fabric clinging to skin"). |
| **Autofill-Determinismus** nicht gewünscht (Christian will LLM-Kreativität) | Niedrig | Niedrig | Toggle in Settings: "Autofill-Modus: Deterministisch (feste Vorlagen) | Kreativ (LLM)". Standard: Deterministisch (Prio Should). |
| **Comic-Modus zu langsam** (4 Panels × 15 s = 60 s → User bricht ab) | Mittel | Niedrig | Progress-Anzeige ("Panel 2/4 …"), Timeout pro Panel 30 s (nicht 90 s gesamt). Opt-in: "Panels parallel generieren" (aber dann unterschiedliche Seeds/Looks → Inkonsistenz). |
| **Prompt-Vorschau kostet zu viel** (LLM-Composer-Aufrufe bei jedem Preview) | Niedrig | Niedrig | Cache in KV (1 h TTL), Key = `profile:scene:style:quality`. Bei Profil-Änderung → Cache-Invalidierung (neue `updated`-Zeit in `profiles_sync`). |
| **R2-Speicherung schlägt fehl** → Bilder nur als dataUrl | Niedrig | Niedrig | Non-fatal (aktuell, Z.58 `storeGenerated`). `dataUrl` bleibt Fallback. Monitoring: R2-Fehlerrate im Wächter. |
| **FSK18-User umgehen Alterschutz** (fake Profil-Daten) | Niedrig | Hoch | Server-seitige Prüfung `minorRisk` ist führend (Client kann nicht umgehen). Profil-Sync nur nach Login (session-Token validiert). Audit-Log: FSK18-Requests mit Profil-ID → bei Missbrauch Account sperren. |

---

## Arbeitspakete

### Präfix `B` (Bild-App)

| ID | Inhalt | Betroffene Dateien | Abhängigkeit | Claude-Kosten $ | Fertig heißt |
|----|--------|-------------------|--------------|----------------|--------------|
| **B1** | **Server-Pfad einziger Weg**: Legacy-Prompt-Bau in `chat.js` raus, nur Request-Body-Builder. `image-handler.ts`: freier Prompt nur für Admin, sonst `imageNewMode`. FSK18 → immer chroma (kein `hq`-Sonderfall). | `apps/chat/chat.js` (Z.740–870), `src/bild/image-handler.ts` (Z.21–140), `src/imgsvc.ts`, `src/imgsvc-image.ts` (Z.115) | – | **2,50** | Test: Profil + Szene → Request-Body `{ profile, context, style, quality }`, kein `prompt` im Body. Response `model: "chroma"` bei FSK18, egal welche Qualität. Admin sendet `{ prompt }` → 200, Nicht-Admin → 403. |
| **B2** | **Outfit-Zustände gewichtet**: `outfitEmphasis` in `imgsvc-core.js` → State-Wörter (wet, soaked, torn, see-through) am Prompt-Anfang mit expliziter Beschreibung. `addCues` immer aufrufen (nicht nur `style=real`). | `src/imgsvc-core.js` (Z.41–46), `src/imgsvc-image.ts` (Z.140), `src/imgsvc.ts` | – | **1,20** | Test: Profil Outfit "white shirt", Szene "wet" → Prompt enthält in ersten 150 Zeichen "wet clinging white shirt, dark damp patches, water droplets". Live-Test Venice: 5 Bilder "wet shirt" → mindestens 3 zeigen Nässe klar. |
| **B3** | **Szenen-Schreiber: nur aktuelle Personen**: `SCENE_SYSTEM` in `imgsvc-scene.ts` schärfen: "ONLY people physically present in the CURRENT moment (latest message); ignore past mentions." State-Wörter-Anweisung hinzufügen. | `src/imgsvc-scene.ts` (Z.4–5) | – | **0,80** | Test: Chat "Er und sie am Strand" (Nachricht 5), dann "Sie liegt allein im Bett" (Nachricht 8) → `llmScene` enthält **nicht** "man" / "he". Live-Test: 3 Solo-Szenen nach Paar-Kontext → alle 3 ohne Extra-Person. |
| **B4** | **Negativ-Prompts vereinheitlicht**: Server `buildRulePrompt` ist einzige Quelle. Client übernimmt aus Server-Response (Fallback-Fall). | `src/imgsvc-core.js` (Z.158–161), `apps/chat/chat.js` (Z.840–850) | B1 | **0,90** | Test: Gleiches Profil, gleiche Szene, 2× generieren → Negativ-Prompt exakt identisch (String-Vergleich). |
| **B5** | **Prompt-Vorschau**: Button "🔍 Prompt zeigen" in Bild-App, API `/api/image` mit `dryRun: true`, Modal zeigt Prompt/Negative/Modell/Konflikte. Buttons "Abbrechen" / "Generieren". | `apps/bild/bild.js` (neu Button-Handler), `apps/bild/index.html` (Button), `apps/bild/bild.css` (.prompt-modal), `src/imgsvc-image.ts` (Z.147 `dryRun`-Antwort erweitern) | B1, B2 | **2,00** | Test: Button klicken → Modal in < 3 s, Prompt > 100 Zeichen, Negativ-Prompt vorhanden, Modell = "chroma" (bei FSK18). Konflikt-Test (Profil Haar "braun", Szene "blond") → Konflikt-Liste "Entfernt: blond, behalten: braun". |
| **B6** | **Deterministischer Autofill**: Feste Vorlagen in `apps/shared/quickfill.js` für Stil/Outfit (10 Optionen je). `imagefb-handler.ts` Autofill: LLM nur als Fallback, Standard = feste Liste. | `apps/shared/quickfill.js` (neue Listen `AUTOFILL_STIL`, `AUTOFILL_OUTFIT`), `src/bild/imagefb-handler.ts` (Z.35–57) | – | **1,50** | Test: 10× Autofill Stil → alle 10 identisch (z.B. "fröhlich, gesprächig, Humor"). Keine Jugend-Wörter. LLM-Fallback nur wenn feste Liste leer. |
| **B7** | **Seed transparent**: Bild-App Seed-Dropdown erweitert: "Aus Profil" (wenn vorhanden), "Manuell eingeben" → Textfeld mit Validierung. | `apps/bild/bild.js` (Seed-Handling), `apps/bild/index.html` (Seed-UI), `apps/bild/bild.css` | – | **1,00** | Test: Manuell Seed 42 eingeben → Request `seed: 42`, Response `seed: 42`. Ungültige Eingabe "abc" → Fehler "Seed muss Zahl sein". "Aus Profil" zeigt Profil-Seed (z.B. 123456). |
| **B8** | **Comic-Modus Klarheit**: N serielle Requests (Loop in `bild.js`), jeder mit `context.camera`. Progress-Anzeige "Panel X/N …". | `apps/bild/bild.js` (Z.102–114 Comic-Loop), `apps/bild/core.js` (`_mode` raus) | – | **0,90** | Test: Comic 3 Panels → 3 Requests, Spinner zeigt "Panel 1/3" → "2/3" → "3/3". Gesamt-Zeit ca. 30–45 s. Ergebnis: 3 Bilder, Gesamt-Kosten 0,03 $. |
| **B9** | **Stil-Test-Modus entfernen**: `bild.js` Z.115–121, `index.html` Option raus. | `apps/bild/bild.js`, `apps/bild/index.html` | – | **0,40** | Test: Dropdown "Modus" zeigt nur "Einzelbild" und "Comic". Kein "Stil-Test". |
| **B10** | **Konflikt-Hinweise in UI**: Ergebnis-Card zeigt ⚠️ + Konflikt-Text (wenn `conflicts.length > 0`). Prompt-Vorschau zeigt Konflikt-Liste. | `apps/bild/bild.js` (Z.147 `addResult` erweitern), `apps/bild/bild.css` (`.conflict-notice`) | B5 | **1,00** | Test: Profil Haar "blond", Szene "schwarzhaarig" → Ergebnis-Card: ⚠️ "Konflikt: Entfernt schwarzhaarig, behalten blond". Prompt-Vorschau zeigt gleiche Liste. |
| **B11** | **Kosten-Tracking persistent**: `totalCost` in `localStorage` (opt-in Checkbox "Kosten speichern"). Anzeige überlebt Reload. | `apps/bild/bild.js` (Kosten-Speicherung), `apps/bild/index.html` (Checkbox) | – | **0,80** | Test: 3 Bilder generieren (Gesamt 0,03 $), Reload → Anzeige zeigt weiter 0,03 $. Checkbox aus → bei Reload 0 $. |
| **B12** | **Galerie lokal speichern**: Opt-in Checkbox, letzte 20 Bilder in `localStorage` (Base64-dataUrl), Galerie-Tab "📂 Gespeichert". | `apps/bild/bild.js` (Galerie-Speicherung, Laden), `apps/bild/index.html` (Checkbox + Tab), `apps/bild/bild.css` | – | **1,50** | Test: 25 Bilder generieren, Checkbox an → Reload, Tab "Gespeichert" zeigt 20 neueste. 5 älteste sind weg. Checkbox aus → Galerie leer nach Reload. |
| **B13** | **FSK18-Bestätigung in Bild-App**: Checkbox aktivieren → Confirm-Dialog "21+ bestätigen". Bei Abbruch → Checkbox bleibt aus. | `apps/bild/bild.js` (Checkbox-Handler), Import von `apps/shared/fsk.js` `setAdult` | – | **0,60** | Test: Checkbox klicken → Dialog erscheint. "Abbrechen" → Checkbox aus. "OK" → Checkbox an, `localStorage` gesetzt. |
| **B14** | **Integration Tests & Doku**: End-to-End-Test (Playwright): Bild-App → Profil wählen → Szene setzen → Vorschau → Generieren → Ergebnis prüfen (Bild vorhanden, Meta korrekt). Markdown-Doku "Bild-App-Nutzung.md" (Screenshots, Schritt-für-Schritt). | `tests/e2e/bild-app.spec.ts` (neu), `docs/bild-app-nutzung.md` (neu) | B1–B13 | **2,00** | Test: `npm run test:e2e` → grün (Bild-App-Flow komplett). Doku öffnen → alle Schritte beschrieben, Screenshots sichtbar. |

**Gesamt Claude-Kosten**: ca. **17,10 $** (bei 0,40 $/Aufruf Durchschnitt, 2–4 Aufrufe pro Paket inkl. Korrektur).

---

## Zusammenfassung (Management-Summary)

**Bild-&-Prompt-App heute**: UI existiert, Authentifizierung funktioniert, aber zwei parallele Prompt-Pfade (Legacy Client, neuer Server) führen zu inkonsistenten Ergebnissen. Szenen-Schreiber fügt Extra-Personen ein, Outfit-Zustände (wet shirt) werden nicht umgesetzt, Modellwahl FSK18/"Hohe Qualität" widerspricht sich. Keine Prompt-Vorschau, Autofill-LLM ist unzuverlässig. Tests sind grün, aber nur String-Prüfungen – kein echter Bildfluss getestet.

**Ziel**: **EINER klarer Server-Prompt-Pfad**, deterministisch, vorhersagbar. Prompt-Vorschau vor Generierung, Outfit-Zustände mit explizitem Wording am Prompt-Anfang, Szenen-Schreiber scharf auf "nur aktuelle Personen", FSK18 → immer chroma (keine Ausnahmen). Alterschutz bleibt (21+, Jugend-Wörter blockiert). Autofill deterministisch (feste Vorlagen statt LLM).

**Kosten**: Bildgenerierung 0,01–0,04 $/Bild (Venice), typisch 1–3 $/Monat bei 50–100 Bildern. Entwicklung ca. 17 $ Claude-Kosten (14 Pakete, je 1–2,5 $).

**Risiken**: Venice-API-Änderung (Mitigation: Runware-Fallback), Szenen-Schreiber halluziniert weiter (Fallback: rohe Szene ohne LLM), Outfit-Zustände trotzdem nicht sichtbar (Wording verschärfen, mehr visuelles Detail).

**Nächste Schritte**: Pakete B1–B4 (Server-Pfad, Outfit-Zustände, Szenen-Schreiber, Negativ-Prompts) zuerst, dann B5 (Prompt-Vorschau). B6–B13 parallel oder je nach Priorität. B14 (Tests + Doku) zum Schluss.


---

# Chat-App – Umsetzungsreifes Konzept

## Ist-Zustand ehrlich

### Was funktioniert

**Grundgerüst (apps/chat/app.js, chat.js, profiles.js)**
- Tabs (Chat, Profile, Ich, Einstellungen) schalten und laden Submodule bei Bedarf (v63: `persona.js`, `me.js` erst beim Öffnen des Tabs).
- Konversations-Liste mit Gruppierung nach Profil, Meta-Info (Zeit, Vorschau, Nachrichtenzahl, Bildmarkierung `🖼️`, v62 `convmeta.js`).
- Chat-Composer mit `setupTyping()` (Shift+Enter = Zeilenumbruch auf Desktop, Touch nie senden, adaptive Höhe bis 200 px, v54/v55).
- Nachrichten rendern (Markdown, Bilder/Videos, Kosten/Modell-Info, v40–v42 Bildinfo-Zeile mit Seed/Prompt/Kopieren).
- Profile-Editor (Basis, Aussehen, Persönlichkeit, Vorlieben, Look-Tab v36+) mit Charakter-Karte Import/Export (apps/chat/card.js, PNG tEXt Chunk `chara`).
- FSK18-Sperre (21+, `scrubYouth`, `minorRisk` liefert 403, apps/shared/fsk.js, v60).
- Verschlüsselte Speicherung optional (AES-GCM, apps/shared/crypto.js; wenn an: Sidebar zeigt `🔒`).
- App-Sperre (Face ID/Touch ID, apps/shared/auth.js, v57).
- Persistente Sitzung (localStorage, 90 Tage gleitend, Face ID Standard aus, v57).
- TTS (Vorlesen): Edge-TTS über `/api/tts` (functions/api/tts.ts, `src/edge-tts.ts`), Fallback Browser-TTS, Hugging-Face-TTS wenn Key gesetzt (v55, apps/shared/tts.js). Provider-Auswahl: `browser`, `edge`, `hf`. Stimmen-Dropdown (EDGE_VOICES in profiles.js, v65 ~40 Stimmen).
- Modellwahl: Dropdown mit 16 Modellen (apps/shared/models.js, v55), Reihenfolge-Editor für normal/FSK18 (`getRoute`, `setRoute`, Presets Standard/Schnell), `auto:nemotron-free` löst sich zu den 3 besten Gratis-Modellen auf OpenRouter auf (Nemotron priorisiert, functions/api/chat.ts `getFreeModels`, Cache 1 h).
- Chat-API (`/api/chat`, functions/api/chat.ts): Modell-Chain (bis 6 Einträge, v46+), Stream (SSE), Retry bei leerem Reply/429/502, Trim History (Standard 6 Nachrichten, `HISTORY_LIMIT`), Zusammenfassung und Lernnotizen in System-Prompt, Videoanhänge (nur Gemini, v55), Groq/Mistral-Adapter (v67), OpenRouter Gratis-Modelle, Venice (wenn Key), Grok (wenn Key), Gemini (wenn Key). Auto-Fallback bei Fehler/leerem Guthaben.
- Memory (v67, `src/memory.ts`, D1-Tabelle `profile_memory`): speichert Fakten über den Nutzer je Profil, KI extrahiert sie beim Chatten (`relevantMemories` per Embeddings), wird in System-Prompt eingebaut. Standard an, mit `memory: false` abschaltbar.
- Kosten-Tracking (`src/usage.ts`, D1 `api_usage`, v67), Rate-Limit (KV, `src/ratelimit.ts`), Budget-Check (`src/budget.ts`, v67).
- Convs in Memory (`convCache`, lazy persist 400 ms, AES-GCM wenn `encrypt` an), bis zu 200 letzte Nachrichten je Conv gerendert.
- Neuigkeiten-Punkte an Tabs (v66, Push/Chat markieren Tab, Öffnen löscht Punkt, `data-news="1"`).
- Installationsbanner (iOS: Anleitung, Android/Desktop: `beforeinstallprompt`, localStorage-dismissed).
- Spanischlehrerin Lucía (v65, apps/chat/es-teacher.js, `SPANISH_LEVELS`, 3 Niveau-Auswahlen, 26 J., normal + FSK18, eigener System-Prompt mit Kastilisch-Fokus, Wort des Tages, sanfte Korrektur).

**UI**
- v51: kompakter Header (Tabs in einer Zeile, Safe Areas), Kleidungs-Dropdown mit Überschriften und determinierten Prompts, eigene Presets `k1/k5/k6` geschützt.
- v54: iOS-Keyboard folgt `visualViewport`, Quality-Varianten (Hoch/Lustify/Modell-Dropdown, Format-Dropdown Hoch/Quadrat/Quer), Venice-Balance sichtbar bei leerem Guthaben.
- v55: Bot-Tab nutzt Chat-Composer, spellcheck an (Haupteingabe + Bot), Text-Anhänge inline, Keyboard-Fit, lazy Load.
- v63: Chat lädt zuerst, Wächter-CSS und TTS erst bei Bedarf, Service Worker `network-first` mit 2,5-s-Fallback.
- v64: „📋 Vorlage wählen"-Dropdown vor Freitextfeldern (Profil, Aussehen, Ich, Bild-Feedback, Comic, Bild-App-Szene), hängt an, überschreibt nie.
- v61: ✨ Automatisch ausfüllen für Stilvorlagen und Outfit & Konsistenz (nur auf Knopfdruck, Neu erzeugen/Rückgängig, 21+-Vorgabe + Jugend-Wortfilter `scrubYouth`).
- v62: Chat-Sidebar mit Zeit der letzten Nachricht (`relTime`), Vorschau, Nachrichtenzahl, 🖼️, Chat-Anzahl pro Figur, ✏️/🗑️ hinter ⋯.

**Profile-Sync (v47, apps/chat/profilesync.js)**
- `textToControls`: zerlegt Freitext in Sätze, erkennt Kleidungs-/Licht-/Ort-Phrasen (regex `OUTFIT_ANY`, `LIGHT_ANY`, `PLACE_ANY`) und verschiebt sie in Photo-Controls (`outfit`, `light`, `scene`). Bust- und Build-Wörter (`BUST_RX`, `BUILD_RX`) werden entfernt (gehören zu Slidern).
- `syncProfileText`: bereinigt `persona.look.{typ,style,details}`, `looks.refLook`, `look.special`, füllt leere Photo-Controls aus erkannten Phrasen. Gibt Liste der verschobenen Sätze zurück (wird in UI angezeigt).
- Resultat: Identity bleibt rein beschreibend (wer sie ist), keine Kleidungs-/Licht-/Ortsangaben mehr, keine Bust-/Build-Duplikate. Photo-Controls übernehmen diese Aspekte.

**Tests**
- 134/134 grün (node --test), aber fast nur String-/readFileSync-Prüfungen und reine Funktionen. Kein End-to-End mit echtem Browser/Chat-Fluss, keine Live-API-Aufrufe.

### Was kaputt ist

**Chat-Model-Chain widersprüchlich**
- **Problem:** `resolveChain` in `models.js` baut die Chain aus `chatModel || profileModel || (adult ? null : getDefaultModel())` + Route-Liste + `gemini-3.5-flash-lite` als Fallback. `auto:nemotron-free` wird serverseitig in `functions/api/chat.ts` zu 3 Gratis-Modellen expandiert. Das bedeutet: Wenn ein Profil `modelChain: ['auto:nemotron-free', 'gemini-3.5-flash-lite']` hat, wird daraus `['nemotron-ultra', 'dots-3', 'nemotron-super-vl', 'gemini-3.5-flash-lite']` – und wenn die ersten 3 fehlschlagen (Limit), ist der Nutzer bei Gemini (zensiert), obwohl er im FSK18-Profil steht.
- **Datei:** `apps/shared/models.js` Z. 24–30, `functions/api/chat.ts` Z. 50–75.
- **Folge:** FSK18-Chats landen unvorhersehbar bei zensierten Modellen. Christian beschwert sich über "Modellwahl wirkt unkonsistent".

**Prompt-Pfade doppelt**
- **Problem:** Bild-Prompts werden an zwei Stellen gebaut:
  1. **Client:** `apps/chat/chat.js` Z. ~800–900 (Legacy, baut Prompt aus Profil + Dropdowns, schickt an `/api/image`).
  2. **Server:** `services/bild/src/imgsvc-core.ts` + `src/prompt.ts` (neuer Pfad, baut Prompt aus `buildImagePrompt()` in `profiles.js`).
- Der Server-Pfad ist führend (v52+), aber der Client-Code ist noch da und wird teils aufgerufen (z. B. in `generateImageInChat`). Negativ-Prompts werden unterschiedlich gebaut (Client: aus `photoFragments`, Server: `imageNewMode` in `imgsvc-core.ts` überschreibt). Outfit-Zustände (nass, zerrissen) und Szenen-Zusätze (LLM-generiert) sind nur im Server-Pfad sauber verarbeitet (v58–v60).
- **Datei:** `apps/chat/chat.js` Z. ~800–920, `services/bild/src/imgsvc-core.ts` Z. ~200–400, `apps/chat/profiles.js` `buildImagePrompt()`.
- **Folge:** Negativ-Prompts werden je nach Pfad inkonsistent. Outfit-Zustand (nasses Shirt) und Szenen-Schreiber-Personen landen nicht verlässlich im finalen Prompt. Christian: "Szenen-Schreiber fügt zusätzliche Personen ins Bild ein" (weil der LLM-Output nicht gefiltert wird) und "Outfit-Zustände wie 'nasses Shirt' werden im Bild nicht umgesetzt" (weil der Client-Pfad sie vergisst).

**Automatisch-ausfüllen unzuverlässig**
- **Problem:** Die ✨-Knöpfe (v61, `photoopts.js` `autoPhoto()`) rufen `/api/autofill` auf (ein eigener Endpunkt, der per LLM Stil/Outfit/Pose vorschlägt). Der Endpunkt ist in v67 nicht mehr im Code (wurde in einem früheren Refactor entfernt). Die Knöpfe zeigen ein Ladesymbol und laufen ins Timeout (404).
- **Datei:** `apps/chat/photoopts.js` Z. ~150–180, `functions/api/autofill.ts` fehlt (wurde gelöscht oder nie committed).
- **Folge:** Christian: "✨ Automatisch-ausfüllen-Knöpfe liefern nicht verlässlich Brauchbares" – sie liefern gar nichts, weil der Endpunkt fehlt.

**TTS-Autoread-Standard**
- **Problem:** `voice.autoRead` ist in allen Profilen auf `false` (profiles.js Z. 20, 30, 40 usw.), aber Christian will "Automatisches Vorlesen standardmäßig AUS" – das ist schon so. Allerdings: Die UI zeigt keinen Schalter für Autoread, und der Code in `chat.js` prüft `profile.voice?.autoRead`, liest aber nie automatisch vor. Die Funktion ist halb implementiert (Profil-Feld existiert, aber kein Aufruf nach dem Empfangen einer Nachricht).
- **Datei:** `apps/chat/profiles.js` Z. 18–85 (DEFAULT_PROFILES), `apps/chat/chat.js` (kein `if (autoRead) speak()` nach Nachrichtenempfang).
- **Folge:** Autoread funktioniert nicht, weil nie verdrahtet. Christian will es standardmäßig aus – das ist es, aber aus Versehen, weil es gar nicht implementiert ist.

**convmeta-Zeit ungenau**
- **Problem:** `convMeta` (apps/chat/convmeta.js) nimmt `ms[ms.length - 1].ts || c.updatedAt` als `lastTs`, aber `updatedAt` wird nur beim Speichern gesetzt (in `saveConversation`), nicht beim Empfangen einer neuen Nachricht. Wenn eine Nachricht noch streamt, hat sie kein `.ts`, und `updatedAt` ist alt.
- **Datei:** `apps/chat/convmeta.js` Z. 10, `apps/chat/chat.js` `saveConversation` Z. ~180.
- **Folge:** Sidebar zeigt manchmal "gestern" für einen Chat, der gerade aktiv ist. Optisch verwirrend, aber nicht kritisch.

### Was nur Gerüst ist

**Groq/Mistral/Runware-Adapter ohne Keys**
- **Status:** v67 hat die Adapter (`src/providers.ts` erweitert um Groq, Mistral; Runware-Adapter in v67 nicht im gezeigten Code, aber laut Changelog vorhanden), aber ohne Secrets im Tresor sind sie tot. `/api/chat` versucht sie, wenn in der Chain, aber ohne Key kommt sofort 503.
- **Datei:** `src/providers.ts` (Groq/Mistral), `functions/api/chat.ts` (Chain-Fallback), `src/keys.ts` (Tresor leer für `xai`, `mistral`, `runware`).
- **Folge:** Fallback funktioniert, sobald Christian die Keys in `/.tresor` legt. Aktuell: 503 "nicht eingerichtet".

**GPU-Schalter ohne Server**
- **Status:** v67 hat UI-Schalter in Einstellungen ("🚀 Eigener Server", nur nach Entsperren), Budget-Sperre (`budgetAllowsGpu()`), 30-Min-Auto-Aus-Timer, aber keine echten API-Aufrufe an Modal/RunPod/AWS. `/api/gpu` existiert in `functions/api/gpu.ts`, aber liefert 404 "Unbekannter API-Endpunkt" (Routing-Problem: Cloudflare Pages Functions erwartet `onRequestGet/Post`, aber die Datei hat nur `export default`).
- **Datei:** `functions/api/gpu.ts` (falscher Export), Hub-UI `apps/hub/settings.js` (Schalter vorhanden, v67).
- **Folge:** GPU-Start geht nicht. Christian kann den Schalter sehen, aber ein Klick tut nichts oder zeigt "nicht eingerichtet".

**Video 503**
- **Status:** `/api/video` liefert 503 "Video-Generierung nicht konfiguriert". Der Endpunkt ist in `functions/api/video.ts` vorhanden, prüft `env.RUNWARE_KEY`, aber der ist leer.
- **Datei:** `functions/api/video.ts` Z. 10–15.
- **Folge:** Video-Knopf in Chat zeigt Fehler. Christian nutzt es kaum, darum niedrige Prio.

**Kollab/Subscriptions ohne D1-Bindings**
- **Status:** `/api/collab/*` und `/api/subscriptions` (functions/api/collab.ts, subscriptions.ts) erwarten D1-Binding `JEFFA_COLLAB`, aber in `wrangler.toml` ist kein Binding. Ergebnis: 503.
- **Datei:** `functions/api/collab.ts`, `wrangler.toml` (Hub-Projekt hat nur `JEFFA_HUB` als D1-Binding, nicht `JEFFA_COLLAB`).
- **Folge:** Kollaborations-Features (Nutzer einladen, gemeinsame Chats) und Subscriptions (Push-Notifikationen für neue Nachrichten) funktionieren nicht. Christian nutzt die App allein, darum später.

---

## Nutzerziele (Christian)

1. **Schnelle, flüssige Unterhaltungen** ohne lange Ladezeiten, ohne viel Tippen. Vorlagen/Dropdowns statt Freitextfelder. Chat soll sofort da sein.
2. **Zuverlässige Modellwahl:** Wenn er ein FSK18-Profil wählt, soll es bei unzensierten Modellen bleiben. Wenn Gratis-Modelle leer sind, soll ein bezahlter Fallback greifen (Venice, Groq, Mistral), nicht einfach zu Gemini springen und zensieren.
3. **Bilder wie beschrieben:** Outfit-Zustände (nass, zerrissen), Szenen-Schreiber-Vorschläge, Negativ-Prompts – alles soll verlässlich ins Bild kommen. Modellwahl (Hohe Qualität / Lustify v8) soll klar wirken.
4. **Wenig Token-/Kostenverbrauch:** Gratis-Modelle bevorzugt, History trimmen, Chat-Apps laden getrennt (schon erfüllt: v63). Kosten transparent (schon da: Nachricht zeigt Token + $ je Antwort, Ampel in v67).
5. **Automatisches Vorlesen standardmäßig AUS, aber auf Knopfdruck verfügbar.** Edge-TTS (gratis) als Standard, Fallback Browser-TTS. Stimmen-Auswahl je Profil.
6. **Profile/Figuren pflegeleicht:** Aussehen/Persönlichkeit über Dropdowns/Slider einstellen, automatisch in Prompts übersetzen. Charakter-Karten importieren, eigene exportieren. Spanischlehrerin als Vorlage.
7. **FSK18-Sperre darf nicht geschwächt werden:** 21+, `scrubYouth`, `minorRisk`-Blockade bleibt.
8. **Deutsche UI, einfach, keine Buzzwords.**

---

## Ziel-Funktionen mit Priorität

| Funktion | Prio | Begründung |
|---|---|---|
| **Modell-Chain FSK18-sicher** (Chain respektiert adult-Flag, Fallback nur zu unzensierten Modellen) | **Must** | Aktuell landet FSK18 bei Gemini → zensiert. Christian beschwert sich. Ohne das ist FSK18 kaputt. |
| **Prompt-Pfad vereinheitlichen** (Server-Prompt ist führend, Client-Legacy entfernen, Outfit-Zustand + Szenen-Personen filtern) | **Must** | Ohne das: Bilder passen nicht zur Beschreibung. Christians Hauptbeschwerde. |
| **Autoread richtig verdrahten** (UI-Schalter in Profil-Editor, nach Nachrichtenempfang prüfen und vorlesen, Standard aus) | **Must** | Halb implementiert. Christian will es aus, aber kontrollierbar. |
| **Automatisch-ausfüllen reparieren** (Endpunkt `/api/autofill` neu bauen oder durch Client-LLM-Aufruf ersetzen, Youth-Filter behalten) | **Should** | Knöpfe sind da, Christian nutzt sie, aber sie tun nichts (404). |
| **Groq/Mistral als Chat-Fallback aktiv** (Keys in Tresor legen, Adapter testen, in Route-Liste als Fallback nach Venice) | **Should** | Christians Anforderung: Ersatzanbieter bei leerem Guthaben. Adapter existieren, nur Keys fehlen. |
| **Whisper für Spracheingabe** (Groq Whisper API, Mikrofon-Button im Composer, transkribiert in Textfeld) | **Should** | Tippen ist für Christian schwer. Diktieren spart Token (kein Chat-Modell) und ist schneller. Groq Whisper gratis, 2.000 Anfragen/Tag. |
| **convmeta-Zeit genauer** (Nachricht `.ts` sofort setzen, `updatedAt` nur beim expliziten Speichern) | **Should** | Sidebar zeigt manchmal alte Zeiten. Optisch störend. |
| **TTS-Provider-Anzeige** (in Profil-Editor zeigen, welcher Provider gerade läuft: Edge / Browser / HF, mit Status) | **Later** | Nice-to-have. Christian sieht es eh beim Vorlesen (funktioniert / funktioniert nicht). |
| **Gedächtnis-Anzeige** (Memory-Fakten im Profil-Editor sichtbar machen, löschen/editieren) | **Later** | Memory läuft automatisch (v67), aber Christian sieht nicht, was gespeichert ist. Low Prio, weil es funktioniert. |
| **Chat-Zusammenfassung automatisch** (nach N Nachrichten, Context-Window-Management, `summary`-Feld nutzen) | **Later** | `/api/chat` unterstützt `summary`, aber der Client baut nie eine. Bei langen Chats landet History-Trim zu früh. Low Prio, weil Christian meist kurze Chats hat. |
| **Charakter-Karte per URL laden** (Hub übergibt `?card=https://...`, Chat-App lädt und importiert) | **Later** | Nice-to-have, keine Beschwerde. |

---

## UX-Ablauf mit Dropdowns

### Chat starten

1. **Hub öffnen** → **Apps** → **💬 Chat** (oder direkt `jeffa-chat.pages.dev`).
2. **Sidebar** (☰-Knopf oder am Desktop immer sichtbar): Liste der Chats, gruppiert nach Figur (Avatar, Name, · N Chats). Klick auf Chat → öffnet ihn. **+ Knopf**: neuer Chat mit aktiver Figur.
3. **Figur wechseln:** **tab Profile** → Figur antippen → **Neuer Chat** oder **Letzten Chat öffnen**.
4. **Composer:** Textfeld (spellcheck an, autocorrect, Shift+Enter Zeilenumbruch Desktop, Touch nie auto-send). **📎-Knopf:** Anhänge (Foto, Kamera, Dateien, Sichere Eingabe, Werkzeuge-Modus An/Aus). **📤-Knopf:** senden.
5. **Nachricht kommt:** Text streamt (Markdown), danach Action-Chips: **🖼 Foto** (generiert Bild aus Chat-Kontext), **🎬 Video** (macht nichts, 503, später), **🔊 Vorlesen** (TTS), **📋 Kopieren**, **👍/👎** (Feedback, wird in Profil-Notizen gespeichert), **📄 Alles** (ganzen Text kopieren).
6. **Autoread:** Wenn im Profil `voice.autoRead = true`, wird die Antwort automatisch vorgelesen (Edge-TTS, Fallback Browser). Standard: aus.
7. **Modell anzeigen:** Unter der Nachricht: z. B. "🤖 Nemotron 3 Ultra · 1234 Tok (800+434) · gratis". Klick auf Modell → **Modell für diesen Chat wählen** (Bottom-Sheet mit allen 16 Modellen + Automatisch). Wahl gilt nur für diesen Chat (überschreibt Profil-Modell und Einstellungs-Default).

### Profil bearbeiten

1. **Tab Profile** → **✏️ Figur bearbeiten** (z. B. Seraphina).
2. **Tabs innerhalb Profil:**
   - **Basis:** Name, Avatar (Emoji-Picker), Beschreibung, Sprache (Dropdown: Deutsch/Englisch/Spanisch), 18+ (Toggle), Lehrer (Dropdown: keine/Spanisch), Spanisch-Niveau (Dropdown: Anfänger/Mittel/Fortgeschritten, nur wenn Lehrer aktiv), Modell (Dropdown: Automatisch + 16 Modelle, zeigt Label + Beschreibung), Stimme (Dropdown: ~40 Edge-Stimmen, gruppiert nach Sprache, + Browser + HF; Rate-Slider 0,5–2,0; Pitch-Slider 0,5–1,5; Autoread-Toggle).
   - **Aussehen:** Typ (Dropdown: 20 Vorlagen wie "Frau, 20er Jahre, helle Haut" + Freitext), Alter (Slider 18–60, Standard 25), Haar (Dropdown: 15 Farben + 5 Längen, kombiniert, z. B. "langes schwarzes Haar" + Freitext), Stil (Dropdown: 10 Vorlagen wie "elegant, lässig, sportlich" + Freitext), Besonderheiten (Chips: Brille, Tattoo, Piercing usw., + Freitext), Größe (Dropdown: klein/mittel/groß + Freitext), Statur (Dropdown: zierlich/schlank/kurvig/sportlich + Freitext), Kurven (Slider 1–10, Standard 5, Wort-Label "schmal…üppig"), Oberweite (Slider A–G, Standard D, zeigt Cup-Größe).
   - **Persönlichkeit:** Grundrichtung (Dropdown: 6 Archetypen wie "Herzlich & fürsorglich", "Verspielt & frech", mit Subtraits), Eigenschaften (5 bipolare Slider: Intensität sanft–intensiv, Wärme kühl–warm, Humor ernst–witzig, Initiative abwartend–initiativ, Fantasie bodenständig–fantasievoll, je 1–10), Temperament (nur FSK18, 6 bipolare Slider: Zärtlich–Wild usw., v39+), Gegensätze (nur FSK18, 5 bipolare Slider: Treu–Freizügig usw.).
   - **Vorlieben:** Checkboxen für 7 allgemeine Vorlieben (Lange Gespräche, Komplimente usw.) + 3 FSK18-nur-Vorlieben (Flirten, Romantische Spannung, Sinnliche Andeutungen, ausgeblendet außerhalb FSK18) + Freitextfeld "Eigene Vorlieben".
   - **Look (Foto-Einstellungen):** Kleidung (Dropdown: 10 Vorlagen wie "Sommerkleid, Bikini, Latex" + Freitext), Ausdruck (Dropdown: lächelnd, verführerisch usw.), Pose (Dropdown: stehend, sitzend usw.), Licht (Dropdown: golden, neon, Kerzen usw.), Szene (Dropdown: Strand, Schlafzimmer, Pool usw.), Qualität (Dropdown: Standard/Hoch/Lustify/Modell…, v54), Format (Dropdown: Hoch/Quadrat/Quer, v53), Knappheit (Slider 1–10, nur FSK18, determinierte Labels "Normal…Micro", v42), Cup (Slider A–G, nur FSK18, überschreibt Oberweite aus Aussehen-Tab für Bilder, v49), Outfit-Zustand (Dropdown: trocken/nass/zerrissen/schmutzig, v59), Bildstil (Dropdown: Foto/Comic/Manhwa, v46).
3. **Prompt anzeigen/bearbeiten** (Button unten): zeigt/versteckt Textfeld mit `systemPrompt` (bzw. `systemPromptAdult` wenn FSK18). Manuelle Bearbeitung überschreibt alle Dropdown-Werte (Freitext-Modus).
4. **🃏 Charakter-Karte** (Button): Import/Export (PNG mit tEXt Chunk `chara`, V1/V2 Format, `apps/chat/card.js`). Import merged `persona.look` und `persona.figur`, Rest bleibt unberührt.
5. **Speichern** → `syncProfileText()` läuft (bereinigt Identity, füllt Photo-Controls), verschobene Sätze werden als Toast gezeigt ("3 Angaben in Foto-Einstellungen verschoben").

### Foto generieren (im Chat)

1. **Nachricht von Figur** → **🖼 Foto** (Action-Chip).
2. **Foto-Einstellungen-Sheet** öffnet sich (gleiche Dropdowns wie im Look-Tab, aber als Overlay über dem Chat, pre-filled aus Profil). **📋 Vorlage wählen** (Dropdown: v64) für Szene (z. B. "am Strand, goldene Stunde, lächelnd") → hängt an die Szenen-Beschreibung an, überschreibt nicht.
3. **✨ Automatisch ausfüllen** (Button, v61, aktuell kaputt): LLM schlägt Stil/Outfit/Pose vor, basierend auf letztem Chat-Kontext. Youth-Filter (`scrubYouth`) filtert jugendlich-suggestive Begriffe. **Neu erzeugen** / **Rückgängig**.
4. **🎨 Bild malen** → Anfrage an `/api/image` (Hub als Proxy, v52), weiter an `jeffa-bild.pages.dev/api/image` (v53). Server-Prompt-Dienst (`imgsvc-core.ts`) baut finalen Prompt:
   - Outfit-Zustand (nass, zerrissen) als Klartext am Anfang (v60).
   - Persönlichkeit → Bild-Hinweise (Ausdruck/Haltung, v59).
   - Identität entdoppeln (statt bei 900/1400 Zeichen abschneiden, doppelte Begriffe entfernen, v58).
   - Minderjährig-suggestive Begriffe aus Identität entfernen (v58).
   - Szenen-Schreiber (LLM, nur wenn Szene "Frei" oder Chat-getrieben): generiert englische Szenenbeschreibung aus letzter Nachricht (v38, max 1800 Zeichen, behält Fahrzeuge/Piercings, v37). **Aktuell Problem:** zusätzliche Personen landen im Bild, weil der LLM-Output nicht gefiltert wird (nur "the woman" soll bleiben, alle anderen Figuren raus).
   - Negativ-Prompts: `imageNewMode` (v38, FSK18 → chroma → eigene Negativliste, Standard → Mix/Flux → andere Liste). **Aktuell Problem:** Client-Pfad (`chat.js` `photoFragments`) baut andere Negative, wird teils noch aufgerufen.
   - Bildstil (v46): Preset ersetzt Render-Teil im Prompt (Standard fügt nichts hinzu).
   - FSK18 immer chroma (v46/v54), nie Mix.
   - Cup-Slider (v49) ist die einzige Bust-Quelle, Duplikate aus `refLook`/Style werden entfernt.
   - Kleidung: Chat-Outfit (wenn Nachricht Kleidung erwähnt) schlägt Dropdown-Outfit, Dropdown schlägt Profil-Regel, Regel schlägt Charakter-Karte (v48).
5. **Bild kommt:** Nachricht mit Bild, darunter Action-Chips: **💾 In Galerie** (speichert in Hub-Galerie, D1 `gallery`), **🔁 Neuer Seed** / **📌 Seed behalten** / **🎲 Variation** (AP7, v43, ohne neuen Szenen-LLM-Aufruf, Scene-Reuse), **👍/👎** (Bild-Feedback, öffnet bei 👎 Textfeld "Was passt nicht?", wird in `rawFeedback` gespeichert und im nächsten Bild als Lernnotiz im Prompt). Darunter: Info-Zeile "Modell: chroma · 0,11 $ · Seed 1234567 · Szene: … · Prompt: … (📋 Kopieren)", lange Prompts gekürzt auf 150 Zeichen (v41, `imgInfoHtml`).
6. **Herunterladen:** ⬇️-Link (als WebP, `jeffa-{msg.id}.webp`).

### Modell-Reihenfolge einstellen

1. **Tab Einstellungen** → **Modell-Reihenfolge** (zwei Abschnitte: **Normal** und **FSK18**, je eigene Liste).
2. **Liste:** Nummeriert 1., 2., 3. usw., zeigt Modell-Label + Beschreibung, **↑/↓** (verschieben), **Toggle** (an/aus), **✕** (entfernen). Nur eingeschaltete Modelle werden verwendet.
3. **Preset-Buttons:** **Standard** (lädt `PRESETS.normal.Standard` bzw. `PRESETS.adult.Standard`), **Schnell** (lädt Schnell-Preset). **+ Modell** (öffnet Model-Picker, fügt hinzu, wenn nicht schon in der Liste).
4. **Chain-Logik (neu):**
   - Client baut Chain: explizite Wahl (Chat > Profil > Settings Default) als erstes Element, danach alle eingeschalteten Modelle aus der passenden Route-Liste (Normal / FSK18), Duplikate entfernt, max 6.
   - Server expandiert `auto:nemotron-free` zu 3 Gratis-Modellen (Nemotron priorisiert, Cache 1 h), filtert ungültige IDs.
   - **Neu:** Server prüft bei jedem Modell: Wenn FSK18-Chat (`adult: true` im Request-Body), darf nur unzensiertes Modell (Venice, Groq GPT-OSS, Mistral, Nemotron-Free). Wenn zensiertes Modell (Gemini, Google-Modelle) in FSK18-Chain, wird es übersprungen, statt aufgerufen. Fallback: nur zu unzensierten Modellen, zuletzt Venice (wenn Key), sonst 503 "Kein FSK18-Modell verfügbar".
5. **Ersatzanbieter-Reihenfolge (nach Venice):** Groq GPT-OSS (wenn Key) → Mistral Small (wenn Key) → OpenRouter-Gratis (die 3 besten aus der Liste) → 503. Venice bleibt oberste Prio für FSK18 (unzensiert, bezahlt, zuverlässig).

### Spracheingabe (Whisper, neu)

1. **Chat-Composer:** neuer **🎤-Button** neben **📎**.
2. **Tippen auf 🎤:** öffnet Browser-Mikrofon-Erlaubnis (falls noch nicht erteilt), nimmt Audio auf (max 30 s oder bis zum erneuten Tippen), zeigt Wellenform/Timer.
3. **Stopp:** Audio (Blob, WebM oder MP3) wird als Base64 an `/api/transcribe` (neu) geschickt. Server ruft Groq Whisper API auf (`https://api.groq.com/openai/v1/audio/transcriptions`, `whisper-large-v3-turbo`, gratis, 2.000 Anfragen/Tag, Limit 25 MB pro Datei).
4. **Transkription kommt:** Text wird ins Composer-Textfeld eingefügt (append, nicht replace, falls schon Text da ist). Nutzer kann editieren und senden.
5. **Fallback:** Wenn Groq-Key fehlt oder Limit erreicht → Browser-Web-Speech-API (`SpeechRecognition`, nur Chrome/Edge, nur online). Wenn auch das fehlt → Toast "Spracheingabe nicht verfügbar".

---

## Architektur / Daten / API-Änderungen

### Dateien

**Neue Dateien:**
- `functions/api/transcribe.ts`: Whisper-Endpunkt (Groq API + Fallback Web Speech API serverseitig nicht möglich, also nur Groq).
- `functions/api/autofill.ts`: LLM generiert Stil/Outfit/Pose aus Chat-Kontext (aktuell fehlt, neu bauen).

**Geänderte Dateien:**
- `functions/api/chat.ts`: Chain-Expansion prüft `adult`-Flag, überspringt zensierte Modelle in FSK18, Fallback-Reihenfolge Groq → Mistral → OpenRouter-Gratis → 503.
- `apps/chat/chat.js`: Client-Prompt-Legacy-Code (Z. 800–920) raus, alle Bild-Anfragen gehen über Server-Prompt (`buildImagePrompt` in `profiles.js`, bereits vorhanden). Autoread verdrahten (nach `generateReply` Ende, prüfe `profile.voice?.autoRead`, rufe `speak()` auf). Whisper-Button im Composer (HTML + Event-Listener, Audio aufnehmen, Base64, `/api/transcribe`, Ergebnis ins Textfeld). `convmeta.js` `relTime` Timestamp-Quelle korrigieren (Nachricht `.ts` sofort setzen beim Erstellen, nicht erst beim Speichern).
- `apps/chat/profiles.js`: `buildImagePrompt` (schon vorhanden, v52+) wird führend. Szenen-Personen-Filter (regex: alle "a man", "a woman", "a person" außer "the woman" entfernen, Zahlen "two women" entfernen).
- `apps/chat/photoopts.js`: `autoPhoto()` ruft `/api/autofill` auf (neu bauen, s. u.).
- `apps/chat/persona.js`: Autoread-Toggle in Stimmen-Sektion (Z. ~80, nach Pitch-Slider), speichert in `profile.voice.autoRead`.
- `apps/shared/models.js`: `resolveChain` bleibt, aber Server macht FSK18-Filterung (Client schickt `adult: true` im `/api/chat`-Body mit).
- `services/bild/src/imgsvc-core.ts`: `imageNewMode` behält Negativ-Logik (chroma vs. Mix), Client-Code nutzt sie nicht mehr → Duplikate weg.
- `src/providers.ts`: Groq/Mistral-Adapter vorhanden (v67), nur Keys fehlen. Prüfen, dass `groq:` und `mistral:`-Prefix funktionieren. Venice-Adapter prüfen (bereits vorhanden).

**D1-Tabellen (keine Änderung, alle schon da):**
- `conversations` (nicht genutzt, Convs sind in localStorage).
- `profile_memory` (v67, Memory-Fakten).
- `api_usage` (v67, Kosten-Tracking).
- `gallery` (Hub, Bilder speichern).

**KV-Schlüssel:**
- `openrouter:free-models` (Cache, 1 h TTL, schon da).
- `ratelimit:{ip}` (Rate-Limiting, schon da).
- Secrets in `/.tresor` (außerhalb Repo): `groq`, `mistral`, `runware` (neu), `venice`, `gemini`, `openrouter` (vorhanden).

**Neue API-Endpunkte:**

```typescript
// functions/api/transcribe.ts
interface TranscribeBody {
  audio: string; // Base64 WebM/MP3/WAV
  language?: string; // z. B. "de", optional
}
// Response: { text: string } | { error: { code, message } }
```

```typescript
// functions/api/autofill.ts (neu bauen)
interface AutofillBody {
  context: string; // letzte 2–3 Chat-Nachrichten, max 1500 Zeichen
  profileId?: string;
  aspect: "stil" | "outfit" | "pose"; // was ausfüllen?
}
// Response: { suggestion: string } | { error: { code, message } }
// LLM-Prompt: "Basierend auf diesem Gespräch: {context}. Schlage einen {aspect} vor (ein kurzer deutscher Begriff, z. B. 'sommerlich leicht', 'sportlich', 'liegend'). Keine Minderjährigen, keine jugendlich-suggestiven Begriffe. Antwort nur der Begriff, keine Erklärung."
// Nach LLM: scrubYouth() filtern, max 80 Zeichen, trim.
```

**Request-Body-Änderung `/api/chat`:**
```typescript
interface ChatBody {
  // ... bestehende Felder ...
  adult?: boolean; // neu, wird von Client gesetzt (isAdult() && profile.adult)
}
```

---

## Anbieter-Strategie

### Text (Chat)

| Anbieter | Modelle | Kosten pro Aufruf (ca.) | Kosten pro Monat (ca.) | Verfügbarkeit | Anmerkung |
|---|---|---|---|---|---|
| **OpenRouter (Gratis)** | Nemotron 3 Ultra, Dots 3, Nemotron 3.5 Super VL, Inkling, Flint, Gemma 4 (alle `:free`) | 0 $ | 0 $ | 50 Anfragen/Tag/Modell | Deutsch gut (Nemotron beste Wahl), manchmal überlastet. Client ruft 3 beste parallel ab (Cache 1 h). |
| **Venice** | Uncensored 1-2, Role Play, Gemma 4 Uncensored, DeepSeek V4.1 Flash Uncensored | 0,0002–0,002 $ | 1–5 $ (50–500 Anfragen) | Pay-as-you-go, Key nötig | Unzensiert, für FSK18. Christian lädt Guthaben auf. Balance-Check in UI (v54). |
| **Groq (Gratis)** | GPT-OSS 120B | 0 $ | 0 $ | 1.000 Anfragen/Tag (Key gratis, keine Karte) | Ersatz bei Venice leer. Deutsch ok, nicht so gut wie Nemotron. |
| **Mistral (Free-Kontingent)** | Mistral Small Latest | 0 $ | 0 $ | Kleines Monatskontingent (Key gratis, keine Karte) | Zweiter Ersatz. Deutsch mittel. |
| **Gemini (Google AI Studio)** | Gemini 3.5 Flash-Lite, Flash | 0,000075–0,0012 $ | 0,50–2 $ (500–1.000 Anfragen) | Key gratis, 1.500 Anfragen/Tag | Zensiert, letzter Fallback für Normal-Chats. In FSK18-Chain übersprungen. |

**Reihenfolge (Chain) FSK18:**  
Venice Uncensored → Groq GPT-OSS → Mistral Small → OpenRouter-Gratis (Nemotron, Dots, Flint) → 503 (kein zensiertes Modell als Fallback).

**Reihenfolge Normal:**  
OpenRouter-Gratis (Nemotron, Dots, Inkling) → Gemini Flash-Lite → Venice (wenn Key, aber eher für FSK18 reserviert) → 503.

**Schätzung pro Monat (Christian, 200 Chat-Anfragen/Monat, 50 % FSK18):**
- OpenRouter Gratis: 0 $
- Venice: ~100 Anfragen × 0,0005 $ = 0,05 $
- Groq: 0 $
- Mistral: 0 $
- Gemini: ~50 Anfragen × 0,0001 $ = 0,005 $
- **Gesamt Text: ~0,06 $ / Monat** (praktisch kostenlos, solange Gratis-Limits reichen).

### TTS (Vorlesen)

| Anbieter | Kosten | Verfügbarkeit | Anmerkung |
|---|---|---|---|
| **Edge-TTS** | 0 $ | Gratis, keine Key | Standard. Cloudflare Worker ruft Microsoft-Edge-TTS-Service auf (undokumentiert, kann abgeschaltet werden, aber läuft seit Jahren). ~40 Stimmen (Seraphina Multilingual, Katja, Florian usw.), Rate/Pitch einstellbar. |
| **Browser-TTS** | 0 $ | Lokal im Browser | Fallback. `speechSynthesis`, Qualität variiert (iOS/Safari gut, Android/Chrome mittel). Offline-fähig. |
| **Hugging Face TTS** | 0 $ (Inference API gratis, langsam) | Key nötig (gratis), oft überlastet | Dritter Fallback. Nur wenn `HF_TOKEN` + `HF_TTS_MODEL` gesetzt. Christian nutzt es kaum. |

**Schätzung:** 0 $ / Monat (Edge-TTS Standard, gratis, funktioniert).

### Whisper (Spracheingabe, neu)

| Anbieter | Kosten | Verfügbarkeit | Anmerkung |
|---|---|---|---|
| **Groq Whisper** | 0 $ | 2.000 Anfragen/Tag (Key gratis, keine Karte) | `whisper-large-v3-turbo`, sehr schnell (~0,5 s für 30 s Audio), Deutsch exzellent. Max 25 MB/Datei. |
| **Browser Web Speech API** | 0 $ | Nur Chrome/Edge, online | Fallback. `SpeechRecognition`, Genauigkeit gut, aber schickt Audio an Google. Nur clientseitig, kein Server-Endpunkt. |

**Schätzung (50 Diktate/Monat):** 0 $ (Groq-Limit reicht).

### Bilder (Foto)

Bleibt wie in v67 (außerhalb dieses Konzepts, aber der Vollständigkeit halber):
- Venice chroma (FSK18): ~0,11 $ / Bild.
- Venice Flux (Normal): ~0,04 $ / Bild.
- Runware (Backup, wenn Key): ~0,002 $ / Bild (Prepaid-Guthaben, 2 $ Startguthaben gratis).

Christian generiert ca. 50 Bilder/Monat (30 FSK18, 20 Normal):  
30 × 0,11 $ + 20 × 0,04 $ = 3,30 $ + 0,80 $ = **~4,10 $ / Monat Bilder**.

**Gesamt (Text + TTS + Whisper + Bilder): ~4,16 $ / Monat** (Bilder dominieren, Rest praktisch kostenlos).

---

## Testplan und Abnahmekriterien

### Funktion: Modell-Chain FSK18-sicher

**Fertig heißt:**
1. **Unit-Test:** `functions/api/chat.ts` mit `adult: true` und Chain `['gemini-3.5-flash', 'venice-uncensored-1-2']` → Gemini wird übersprungen, Venice aufgerufen (Mock-Adapter). Test prüft, dass `gemini` nicht in Upstream-Logs auftaucht.
2. **Integration:** Hub, Chat-App, FSK18-Profil (z. B. Lena), neuer Chat, Nachricht senden. Entwicklertools Netzwerk-Tab → `/api/chat` Request-Body enthält `adult: true`. Response `data:` Events zeigen `tried: [...]` ohne `gemini`, nur `venice-uncensored-1-2` und ggf. Groq/Mistral/Nemotron-Free.
3. **Live-Prüfung (Christian):** FSK18-Chat mit Lena, Venice-Key leer (Guthaben 0 simulieren durch Key temporär entfernen). Antwort kommt von Groq oder OpenRouter-Gratis (z. B. Nemotron), **nie von Gemini**. Antwort ist unzensiert (Test: "Beschreibe eine romantische Szene" → keine Ablehnung).
4. **Edge-Case:** Venice + Groq leer, Mistral leer, OpenRouter-Gratis (Nemotron) auch leer/überlastet → 503 "Kein FSK18-Modell verfügbar", **nicht** Fallback zu Gemini.

### Funktion: Prompt-Pfad vereinheitlichen

**Fertig heißt:**
1. **Code-Review:** `apps/chat/chat.js` Legacy-Prompt-Code (Z. 800–920, `buildPromptFromProfile`, `photoFragments`-Aufrufe) ist **gelöscht**. Alle Bild-Anfragen gehen über `buildImagePrompt()` in `profiles.js` → `/api/image` (Hub-Proxy) → `jeffa-bild/api/image` → `imgsvc-core.ts`.
2. **Unit-Test:** `profiles.js` `buildImagePrompt({ profile, scene: "am Strand", outfit: "nasser Bikini", ... })` → Prompt enthält "wet bikini" am Anfang (v60 Outfit-Zustand), keine doppelten Kleidungsbegriffe, keine zusätzlichen Personen (regex entfernt "a man", "two women" usw., behält nur "the woman" / "she"). Test mit Szenen-Schreiber-Output (Mock LLM: "Lena and a man on the beach, she wears a wet bikini, golden hour") → finaler Prompt: "Lena on the beach, wet bikini, golden hour" (Mann entfernt).
3. **Integration:** Chat, Bild generieren mit Szene "Frei" (LLM schreibt Szene), Outfit-Zustand "nass", Kleidung "Bikini". Entwicklertools → `/api/image` Request-Body `prompt` prüfen: enthält "wet bikini", enthält nicht "a man" / "two women" / "two people". Image-Info-Zeile unter dem Bild zeigt Prompt (📋 Kopieren) → Christian prüft: nur eine Person, nasser Bikini sichtbar.
4. **Live-Prüfung (Christian):** 5 Bilder generieren (unterschiedliche Szenen, Outfit-Zustände: nass, zerrissen, schmutzig, trocken). Für jedes Bild: "Passt das Bild zur Beschreibung?" → Ja/Nein. **Fertig = 4/5 Ja** (80 %, perfekt ist unrealistisch bei LLM + Diffusion). Häufigster Fehler vorher: zusätzliche Personen, nasser Zustand fehlt → beide behoben = Erfolg.
5. **Negativ-Prompts konsistent:** Zwei Bilder generieren (eines FSK18 chroma, eines Normal Flux), Entwicklertools → `/api/image` Request-Body `negative_prompt` prüfen: FSK18 enthält "cartoon, illustration, extra limbs", Normal enthält "nsfw, nudity, explicit". Beide nutzen `imageNewMode` aus `imgsvc-core.ts`, keine Client-Override.

### Funktion: Autoread richtig verdrahten

**Fertig heißt:**
1. **UI:** Profil-Editor → Basis-Tab → Stimme-Sektion → neuer Toggle "🔊 Automatisch vorlesen" (unter Pitch-Slider). Standard: aus (unchecked). Speichern → `profile.voice.autoRead` ist `true` oder `false`.
2. **Code:** `apps/chat/chat.js` `generateReply()` (oder `streamChat()` onDone-Callback) → nach Nachricht fertig: `if (profile.voice?.autoRead) { speak(reply, profile.voice, profile.language); }`.
3. **Unit-Test:** Mock-Profil mit `voice.autoRead = true`, `generateReply()` simulieren (Mock-Stream, Reply "Hallo"), prüfe dass `speak()` aufgerufen wurde mit "Hallo" als erstem Argument.
4. **Integration:** Chat, Profil Seraphina, Profil-Editor → Autoread **an**, zurück zu Chat, Nachricht senden. Antwort kommt → TTS startet automatisch (Wellenform/Speaker-Icon in UI, oder Audio hörbar). Zweiter Test: Autoread **aus** → keine TTS (Nutzer muss 🔊-Chip tippen).
5. **Live-Prüfung (Christian):** Neues Profil erstellen, Autoread an, Chat starten, 3 Nachrichten senden. Jede Antwort wird automatisch vorgelesen. Dann Profil-Editor → Autoread aus, zurück zu Chat, nächste Nachricht → keine TTS. **Fertig = beide Fälle funktionieren.**

### Funktion: Automatisch-ausfüllen reparieren

**Fertig heißt:**
1. **Endpunkt:** `/api/autofill` antwortet 200 mit `{ suggestion: "..." }` für gültige Anfrage. Test-Body: `{ context: "Christian geht am Strand spazieren", aspect: "outfit" }` → LLM schlägt z. B. "leichte Sommerkleidung" vor. Youth-Filter (`scrubYouth`) läuft über Output → keine "jung", "Schülerin", "teen" usw.
2. **Unit-Test:** `functions/api/autofill.ts` mit Mock-LLM (gibt "kurzer Rock, Schuluniform" zurück) → `scrubYouth()` filtert → Ergebnis: "kurzer Rock" (Schuluniform entfernt) oder leer → Response `{ suggestion: "" }` (kein Vorschlag, weil gefiltert). Zweiter Test: LLM gibt "sportlich, Turnschuhe" → bleibt unberührt.
3. **Integration:** `apps/chat/photoopts.js` `autoPhoto()` ruft `/api/autofill` auf (POST, Body `{ context: lastMessages.slice(-3), aspect: "stil" }`), Response `suggestion` wird ins Textfeld eingefügt. Entwicklertools → 200, keine 404.
4. **UI:** Foto-Einstellungen-Sheet → ✨ Automatisch ausfüllen (Stil) → Ladesymbol 1–2 s → Textfeld füllt sich (z. B. "elegant, selbstbewusst") → **Neu erzeugen** (anderer Vorschlag) → **Rückgängig** (Textfeld leer). Alle 3 Buttons (Stil, Outfit, Pose) funktionieren, jeweils mit passendem `aspect`.
5. **Live-Prüfung (Christian):** Chat mit Seraphina, 3 Nachrichten ("Wie war dein Tag?", "Ich war am Meer", "Es war sehr entspannend"), Foto generieren, Foto-Sheet öffnen, ✨ Outfit → Vorschlag kommt (z. B. "luftiges Sommerkleid, Sonnenbrille"). Christian bewertet: "Passt das zum Gespräch?" → Ja/Nein. **Fertig = 3/5 Vorschläge passen** (60 %, LLM-Qualität variiert, aber besser als 404).

### Funktion: Groq/Mistral als Chat-Fallback aktiv

**Fertig heißt:**
1. **Keys im Tresor:** `/.tresor` (außerhalb Repo, wird nicht committed) enthält Zeilen:
   ```
   groq sk-...
   mistral ...
   ```
   Christian holt die Keys selbst (gratis, keine Karte): Groq von `console.groq.com`, Mistral von `console.mistral.ai`.
2. **Adapter-Test:** `src/providers.ts` `callModel()` mit `model: "groq:openai/gpt-oss-120b"` und Groq-Key → Request an `https://api.groq.com/openai/v1/chat/completions`, Response mit `reply`. Gleicher Test für `mistral:mistral-small-latest` → Request an `https://api.mistral.ai/v1/chat/completions`.
3. **Integration:** Hub, Chat, Normal-Profil (z. B. Assistent), Modell-Reihenfolge: OpenRouter-Gratis (Nemotron) **aus**geschaltet, nur Groq + Mistral + Gemini an. Nachricht senden → Response zeigt `tried: ["groq:...", "gemini-..."]` (Groq wird zuerst versucht).
4. **FSK18-Fallback:** Lena-Chat, Venice-Key leer (simuliert), Reihenfolge: Venice → Groq → Mistral. Nachricht senden → Antwort kommt von Groq (Model-Label unter der Nachricht zeigt "Groq GPT-OSS 120B"). Antwort ist unzensiert.
5. **Live-Prüfung (Christian):** Venice-Guthaben leer (oder Key temporär entfernen), FSK18-Chat, Nachricht senden. Antwort kommt (nicht 503), Modell-Label zeigt Groq oder Mistral. Kosten-Zeile: "gratis". **Fertig = Fallback funktioniert, keine Bezahlmodelle ohne Guthaben.**

### Funktion: Whisper für Spracheingabe

**Fertig heißt:**
1. **Endpunkt:** `/api/transcribe` mit Base64-Audio (WebM, 5 s, "Hallo, wie geht es dir?") → Response `{ text: "Hallo, wie geht es dir?" }` (Groq Whisper). Deutsch erkannt (Auto-Detect oder `language: "de"` im Body).
2. **UI:** Chat-Composer → 🎤-Button rechts neben 📎. Tippen → Browser fragt Mikrofon-Erlaubnis (einmalig), Aufnahme startet (Wellenform/Timer sichtbar), erneut tippen → Aufnahme stoppt, Upload (Ladesymbol 1–2 s), Text erscheint im Composer-Textfeld (append, nicht replace).
3. **Integration:** Entwicklertools → `/api/transcribe` Request-Body `audio` ist Base64 (beginnt mit `data:audio/webm;base64,` oder nur Base64-String), `language: "de"`. Response 200 `{ text: "..." }`. Textfeld füllt sich.
4. **Fallback-Test:** Groq-Key leer (simuliert), 🎤 tippen → Browser Web Speech API (nur Chrome/Edge) läuft (keine Server-Anfrage, clientseitig). Text erscheint sofort (kein Upload). Wenn Web Speech auch nicht verfügbar (Firefox) → Toast "Spracheingabe nicht verfügbar" (kein Crash).
5. **Live-Prüfung (Christian):** iPhone, Safari (Web Speech nicht verfügbar, nur Groq). 🎤 tippen, 10 s sprechen (Deutsch, Satz "Ich möchte wissen, wie das Wetter morgen wird"), stoppen. Text erscheint im Composer, Christian prüft: "Ist der Text korrekt?" → Ja/Nein. **Fertig = 4/5 Diktate korrekt erkannt** (80 %, Whisper-Qualität sehr gut, aber Hintergrundgeräusche können stören). Zweiter Test: Android Chrome (Web Speech Fallback) → funktioniert auch.

### Funktion: convmeta-Zeit genauer

**Fertig heißt:**
1. **Code:** `apps/chat/chat.js` beim Erstellen einer Nachricht (User oder Assistant) → `msg.ts = new Date().toISOString()` sofort setzen, nicht erst in `saveConversation()`. `convmeta.js` `lastTs` nutzt weiterhin `ms[ms.length - 1].ts || c.updatedAt`.
2. **Unit-Test:** `convMeta()` mit Mock-Conversation (2 Nachrichten, erste `ts` gestern, zweite `ts` vor 5 Min, `updatedAt` vor 1 h) → `lastTs` ist vor 5 Min, `relTime(lastTs)` gibt "heute 14:23" (Zeit der zweiten Nachricht).
3. **Integration:** Chat, Nachricht senden, sofort (während Stream läuft) → Sidebar öffnen → Chat-Zeile zeigt "heute HH:MM" (aktuelle Uhrzeit ±1 Min). Nach 1 Min → Sidebar neu rendern (oder anderen Chat öffnen/zurück) → Zeit bleibt "heute HH:MM", nicht "gestern".
4. **Live-Prüfung (Christian):** Morgens 8:00 Uhr Chat, abends 20:00 Uhr Sidebar öffnen → Chat zeigt "heute 08:00" (Zeit der letzten Nachricht), nicht "gestern". **Fertig = Sidebar zeigt immer die Zeit der letzten Nachricht, nicht `updatedAt`.**

---

## Risiken

1. **Groq/Mistral-Keys fehlen:** Christian muss sie selbst holen und in `/.tresor` legen. Wenn er es vergisst, bleibt der Fallback tot (503). → Dokumentation + Anleitung in Wächter ("Gratis-Keys holen").
2. **Edge-TTS kann abgeschaltet werden:** Microsoft betreibt den Service undokumentiert. Wenn er fällt, Fallback Browser-TTS (funktioniert, aber schlechtere Qualität). → Risiko akzeptiert, Edge-TTS läuft seit Jahren stabil.
3. **Whisper-Limit (2.000/Tag) reicht nicht:** Wenn Christian 50 Diktate/Tag macht (unwahrscheinlich), Fallback Web Speech API (nur Chrome/Edge) oder Toast "Limit erreicht, morgen wieder". → Monitoring in Wächter (Whisper-Aufrufe/Tag anzeigen).
4. **Szenen-Personen-Filter zu aggressiv:** Regex entfernt "a man", aber was wenn die Szene "a man in the background" (Hintergrund-Person gewünscht) sein soll? → Test mit 10 Szenen (Christian probiert), wenn zu viel entfernt wird, Filter lockern (nur "two women", "a man" am Satzanfang).
5. **LLM halluziniert bei Autofill:** `/api/autofill` schlägt manchmal unsinnige Outfits vor ("Ritterrüstung am Strand"). → `scrubYouth` filtert Minderjährige, aber Unsinn bleibt. Christian kann Vorschlag löschen (Rückgängig-Button) oder neu generieren. Kein Blocker, weil es nur ein Vorschlag ist, kein Zwang.
6. **FSK18-Filter überspringt alle Modelle:** Wenn Chain nur zensierte Modelle enthält (Nutzer hat manuell Gemini + GPT-4 gewählt) und `adult: true`, kommt 503. → UI zeigt Warnung beim Speichern: "Achtung: Nur zensierte Modelle in FSK18-Profil, Chat kann fehlschlagen." Christian sieht es und korrigiert.
7. **Client-Prompt-Code-Rest bleibt im Code:** Wenn beim Löschen etwas übersehen wird, bleiben tote Funktionen. → Code-Review + grep nach `photoFragments`, `buildPromptFromProfile` in `chat.js` → nichts gefunden = OK.
8. **Autoread nervt:** Wenn Christian versehentlich Autoread einschaltet und vergisst, liest jede Antwort vor. → Standard aus, er muss explizit einschalten. Wenn es nervt, kann er im Profil ausschalten oder App-Lautsprecher stumm.

---

## Arbeitspakete

| ID | Inhalt | Betroffene Dateien | Abhängigkeit | Geschätzte Claude-Kosten | Fertig heißt |
|---|---|---|---|---|---|
| **C.1** | **Modell-Chain FSK18-sicher**: Server prüft `adult`-Flag, überspringt zensierte Modelle (Gemini, Google) in FSK18-Chain, Fallback nur zu Venice/Groq/Mistral/OpenRouter-Gratis. Client schickt `adult: true` im `/api/chat`-Body (aus `isAdult() && profile.adult`). Unit-Test + Integration. | `functions/api/chat.ts` (Z. 50–120, Chain-Expansion + Retry-Loop), `apps/chat/chat.js` (Z. ~600, `streamChat()`-Aufruf, Body-Build) | – | **0,80 $** (1 Haupt-Job + 1 Test-Job, je ~25k Context + 8k Output) | Unit-Test grün: Chain `['gemini', 'venice']` + `adult: true` → Gemini übersprungen, Venice aufgerufen. Live: FSK18-Chat ohne Venice-Key → Groq-Antwort, nie Gemini. |
| **C.2** | **Prompt-Pfad vereinheitlichen**: Client-Legacy-Code in `chat.js` (Z. 800–920) löschen, alle Bild-Anfragen über `buildImagePrompt()` → Server. Szenen-Personen-Filter (regex: entferne "a man", "two women", "a person" außer "the woman/she"). Negativ-Prompts nur noch aus `imageNewMode` (Server). Unit-Test Prompt-Build + Personen-Filter. | `apps/chat/chat.js` (Z. 800–920 löschen, `generateImageInChat()` umbauen), `apps/chat/profiles.js` (`buildImagePrompt()` Personen-Filter), `services/bild/src/imgsvc-core.ts` (bestehend, keine Änderung nötig, nur Client nutzt es jetzt), Test-Datei | – | **1,20 $** (1 Haupt-Job Löschen + Umbauen, 1 Test-Job, 1 Korrektur-Job, je ~30k Context + 8k Output) | Unit-Test: Szene "Lena and a man on the beach" → Prompt "Lena on the beach" (Mann weg). Live: 5 Bilder generiert, 4/5 passen zur Beschreibung (keine zusätzlichen Personen, Outfit-Zustand sichtbar). Image-Info zeigt korrekten Prompt. |
| **C.3** | **Autoread verdrahten**: Profil-Editor Basis-Tab → Stimme-Sektion → Toggle "🔊 Automatisch vorlesen" (Standard aus), speichert `profile.voice.autoRead`. `chat.js` `generateReply()` onDone → `if (profile.voice?.autoRead) speak(reply, profile.voice, profile.language)`. Unit-Test + Integration. | `apps/chat/persona.js` (Z. ~80, Stimmen-Sektion, Toggle einfügen), `apps/chat/chat.js` (Z. ~700, `generateReply()` / Stream-onDone-Callback, `speak()`-Aufruf), Test-Datei | – | **0,60 $** (1 Haupt-Job UI + Logik, 1 Test-Job, je ~20k Context + 6k Output, einfach) | Unit-Test: Mock-Profil `autoRead: true` → `speak()` aufgerufen. Live: Profil Autoread an → 3 Nachrichten, alle vorgelesen. Autoread aus → keine TTS (Nutzer muss 🔊 tippen). |
| **C.4** | **Whisper-Endpunkt + UI**: `/api/transcribe` (Groq Whisper API, `whisper-large-v3-turbo`, Body `{ audio: Base64, language?: "de" }`, Response `{ text }`, Fallback-Hinweis in Docs). Chat-Composer: 🎤-Button, Audio aufnehmen (max 30 s), Base64, POST `/api/transcribe`, Text ins Textfeld append. Fallback-Hinweis (Web Speech API clientseitig, kein Server). Unit-Test Endpunkt, Integration UI. | `functions/api/transcribe.ts` (neu, ~80 Zeilen), `apps/chat/chat.js` (Z. ~400, Composer-HTML 🎤-Button einfügen, Event-Listener Audio-Aufnahme + Upload + Textfeld-Einfügen, ~100 Zeilen), Test-Datei | – | **1,20 $** (1 Job Endpunkt, 1 Job UI, 1 Test-Job, 1 Korrektur-Job, je ~25k Context + 8k Output) | Unit-Test: `/api/transcribe` mit Mock-Audio → Groq-API-Call, Response `{ text: "..." }`. Live: iPhone Safari, 🎤 tippen, 10 s sprechen (Deutsch), Text erscheint im Composer, 4/5 Diktate korrekt. Android Chrome Fallback (Web Speech) funktioniert. |
| **C.5** | **Autofill-Endpunkt**: `/api/autofill` (Body `{ context, aspect }`, LLM generiert Vorschlag, `scrubYouth()` filtern, max 80 Zeichen, Response `{ suggestion }`). `photoopts.js` `autoPhoto()` ruft Endpunkt auf, Ergebnis ins Textfeld. Neu-erzeugen + Rückgängig bleiben (schon vorhanden, nur Endpunkt war tot). Unit-Test Youth-Filter, Integration UI. | `functions/api/autofill.ts` (neu, ~100 Zeilen, LLM-Aufruf + Filter), `apps/chat/photoopts.js` (Z. ~150, `autoPhoto()`-Fetch-Aufruf korrigieren, aktuell 404), Test-Datei | – | **1,00 $** (1 Job Endpunkt, 1 Job UI-Fix, 1 Test-Job, je ~25k Context + 8k Output) | Unit-Test: LLM gibt "kurzer Rock, Schuluniform" → gefiltert zu "kurzer Rock" oder leer. Live: ✨ Outfit tippen → Vorschlag kommt, 3/5 passen zum Gespräch. Neu-erzeugen + Rückgängig funktionieren. |
| **C.6** | **Groq/Mistral-Adapter aktiv**: Keys in `/.tresor` Anleitung (README), Adapter in `src/providers.ts` prüfen (schon vorhanden, v67), Fallback-Reihenfolge in `/api/chat` (nach Venice, vor OpenRouter-Gratis). Unit-Test Adapter-Aufrufe, Integration Chain. | `src/providers.ts` (Code-Review, ggf. kleine Korrekturen), `functions/api/chat.ts` (Chain-Reihenfolge, Z. 50–80, schon da, nur prüfen), `README.md` (Anleitung Keys), Test-Datei | C.1 (Chain-Logik) | **0,60 $** (1 Code-Review + kleine Korrekturen, 1 Test-Job, je ~20k Context + 5k Output, wenig neu zu schreiben) | Unit-Test: `groq:openai/gpt-oss-120b` mit Mock-Key → Request an Groq-API, Response OK. Live: Venice leer, FSK18-Chat → Groq-Antwort, Modell-Label zeigt "Groq GPT-OSS 120B", Kosten "gratis". |
| **C.7** | **convmeta-Zeit genauer**: `chat.js` Nachricht-Erstellung → `msg.ts = new Date().toISOString()` sofort (User + Assistant), nicht erst in `saveConversation()`. `convmeta.js` bleibt unverändert (nutzt `ts`). Unit-Test + Integration. | `apps/chat/chat.js` (Z. ~600, User-Nachricht-Build, Z. ~750, Assistant-Nachricht-Build, je 1 Zeile einfügen), `apps/chat/convmeta.js` (unverändert), Test-Datei | – | **0,40 $** (1 Haupt-Job, 1 Test-Job, sehr einfach, je ~20k Context + 4k Output) | Unit-Test: `convMeta()` mit Nachricht `ts` vor 5 Min, `updatedAt` vor 1 h → `lastTs` ist vor 5 Min. Live: Chat, Nachricht senden, Sidebar öffnen → Zeit zeigt "heute HH:MM" (aktuelle Zeit der Nachricht), nicht "gestern". |

**Gesamt: 6,80 $** (ca. 7 $, 14–16 Claude-Aufrufe über VNAIPro à ~0,35–0,45 $, inkl. Korrekturen).

**Reihenfolge:** C.1 → C.2 (beide Must, für FSK18 + Bild-Qualität kritisch) → C.3 (Must, aber unabhängig) → C.4, C.5, C.6, C.7 parallel (Should + einfache, unabhängig).

**Dependency-Graph:**
```
C.1 (FSK18-Chain) → C.6 (Groq/Mistral, braucht Chain-Logik)
C.2 (Prompt vereinheitlichen) → (keine)
C.3 (Autoread) → (keine)
C.4 (Whisper) → (keine)
C.5 (Autofill) → (keine)
C.7 (convmeta-Zeit) → (keine)
```

**Aufwand gesamt:** 6 Pakete, ca. 6,80 $ Claude-Kosten (VNAIPro), ~2–3 Tage Entwicklung (Claude baut, Christian testet + korrigiert per Grok Bot). Real: eher 1 Woche, weil Christian zwischen Tests wartet.

---

## Schlussbemerkung

**Was kaputt ist, wird repariert (schonungslos ehrlich):**
- Modell-Chain landet FSK18-Chats bei Gemini (zensiert) → **C.1 behebt es**.
- Bild-Prompts inkonsistent, Outfit-Zustände + Szenen-Personen fehlen → **C.2 behebt es**.
- Automatisch-ausfüllen ist tot (404) → **C.5 behebt es**.
- Autoread halb implementiert (Profil-Feld da, aber nie aufgerufen) → **C.3 behebt es**.
- convmeta-Zeit manchmal falsch → **C.7 behebt es**.

**Was nur Gerüst ist, wird nicht weiter ausgebaut (ehrlich: Christian braucht es nicht jetzt):**
- GPU-Schalter bleibt Gerüst (später C.8–C.10 in separatem Konzept, siehe Ausbau-Konzept).
- Video 503 bleibt (Christian nutzt es kaum).
- Kollab/Subscriptions 503 bleiben (Christian nutzt die App allein).

**Was funktioniert, bleibt unberührt:**
- Profile-Sync (v47, sauber), Charakter-Karten (funktioniert), Verschlüsselung (funktioniert), FSK18-Sperre (21+, funktioniert), Memory (v67, funktioniert), Kostenampel (v67, funktioniert), Backup (v67, funktioniert).

**Kosten:** ~7 $ Claude-Baukosten, ~4–5 $ monatliche Laufkosten (Bilder dominieren, Text/TTS/Whisper praktisch kostenlos). Christians Budget 20 $ / Monat reicht locker.

**Umsetzungsreif:** Ja. Jedes Paket hat klare Datei-/Zeilen-Angaben, prüfbare Kriterien ("Fertig heißt" mit Live-Prüfung), realistische Kosten. Kein Marketing, nur Fakten.


---

# Wächter (Anbieterstatus, Health, Restore-Check) – Umsetzungsreifes Konzept

**Stand:** 30. Oktober 2026  
**Autor:** Software-Architekt & Produktplaner  
**Kontext:** Jeffa Hub, Cloudflare Pages PWA, v67

---

## 1. Ist-Zustand ehrlich

### 1.1 Funktioniert (belegt)

**Status-Endpunkt** (`functions/api/status.ts`)  
- ✅ Liefert Provider-Status (Key vorhanden/nicht), Gateway-Erreichbarkeit, D1-Status, Backup-Info
- ✅ Live-Test: `/api/health` → 200 OK, `/api/status` → JSON mit Providern
- ✅ Backup-Status aus KV wird gelesen (`backup:status`, `backup:restorecheck`)
- ✅ Gateway-Latenz-Messung funktioniert (5s-Timeout, HEAD-Request zu Gateway/Gemini)

**Balances-Endpunkt** (`functions/api/balances.ts`)  
- ✅ Prüft OpenRouter (Key + Credits), VNAIPro (Usage), Venice (Guthaben) über deren APIs
- ✅ 5 Min Cache in KV (`balances:cached`)
- ✅ Rolle `read` erforderlich (nach Face ID / PIN entsperren)
- ✅ Timeout 6s pro API-Aufruf

**Wächter-UI** (`apps/waechter/waechter.js`)  
- ✅ Lazy-Laden (CSS + JS erst bei Tab-Öffnen, spart 26 KB beim Start)
- ✅ Zeigt Provider-Tiles (grün = Key vorhanden, rot = fehlt, grau = „nicht eingerichtet" für optionale Ersatzanbieter)
- ✅ Klick auf Tile öffnet Detail-Panel: Nutzung heute/30 Tage, Guthaben, Kosten
- ✅ Backup-Sektion zeigt letztes Backup-Datum, Größe, Restore-Test-Status
- ✅ Trials/Abos aus D1-Tabelle `subscriptions` (CRUD für Admin, Anzeige für alle nach Login)
- ✅ Gratis-Angebote-Sektion (z. B. Venice Free, OpenRouter-Credits)
- ✅ Auto-Refresh alle 60s (nur wenn Tab sichtbar)

**Backup-Worker** (`services/backup/src/index.ts`)  
- ✅ Täglicher Cron (einmal eingerichtet über Workers-Subdomain im Dashboard)
- ✅ D1-Dump (alle Tabellen außer `sqlite_*`, `_cf_*`) + KV-Dump (außer `backup:*`)
- ✅ Verschlüsselung (AES-GCM, Key aus Secret `BACKUP_KEY`), Kompression (gzip)
- ✅ Speichern in R2 (wenn `BACKUP`-Binding vorhanden) oder KV (Fallback, max. 25 MB pro Blob, sonst Chunks)
- ✅ Retention: 30 Tage (alte Backups werden gelöscht)
- ✅ Restore-Check: jeden 1. des Monats oder manuell (`/run?check=1` + `x-backup-key`-Header)
- ✅ Status in KV: `backup:status` (lastRun, ok, bytes, target, counts), `backup:restorecheck` (at, ok, diffs)

**Restore-Script** (`scripts/backup-restore.mjs`)  
- ✅ Entschlüsselt + entpackt Backup → `out/d1.sql` + `out/kv.json`
- ✅ Key-Quelle: `/workspace/.jeffa_backup_key` oder `BACKUP_KEY`-Umgebungsvariable
- ✅ Prüfung vor Einspielen möglich (manuell SQL/JSON durchsehen)

**Nutzungszählung** (`functions/api/usage.ts`, nicht im Quellcode oben, aber in Tests erwähnt)  
- ✅ D1-Tabelle `usage_daily` (day, provider, requests, promptTokens, outputTokens, costUsd)
- ✅ Aggregation: heute / 30 Tage / Prognose (in v67 unter Kostenampel)

**Tests**  
- ✅ 134/134 grün, aber fast nur String-/Funktions-Tests
- ✅ Keine End-to-End-Tests (Browser, echte Provider-Abfragen, Live-Backup-Restore)

---

### 1.2 Kaputt / inkonsistent

**GPU-Endpunkt liefert 404** (`/api/gpu`)  
- ❌ **Problem:** Live-Aufruf `GET /api/gpu` → 404 „Unbekannter API-Endpunkt"
- **Ursache:** `functions/api/gpu.ts` existiert, aber Cloudflare Pages Functions unterstützen **nur** HTTP-Methoden, die in `onRequest<Method>` exportiert werden. Die Datei exportiert `onRequestPost`, **kein** `onRequestGet`.
- **Folge:** `GET /api/gpu` landet im Catch-All `functions/api/[[path]].ts` → 404.
- **Erwartung im Hub:** `apps/settings/settings.js` (nicht im Quellcode oben, aber bekannt aus v67-Commits) sendet vermutlich `GET /api/gpu` für Status-Abfrage.
- **Fix nötig:** Entweder `onRequestGet` in `gpu.ts` exportieren oder Hub auf `POST /api/gpu` mit `{action: 'status'}` umstellen.

**Restore-Check fehlt in Tests**  
- ❌ `restoreCheck()`-Funktion existiert in `services/backup/src/core.js`, aber **keine Abnahme-Prüfung** mit echtem Backup und Live-DB.
- **Risiko:** Restore kann trotz „ok: true" fehlschlagen (z. B. fehlende Foreign Keys, fehlende Tabellen, KV-Keys mit falschem Format).

**Gratis-Angebote ohne automatische Prüfung**  
- ❌ Sektion „🎁 Gratis-Angebote" zeigt nur manuell erfasste Einträge (`subscriptions.provider = 'gratis'`).
- **Kein automatischer Check:** Venice Free (50 $/Monat), OpenRouter Free (50 Anfragen/Tag/Modell), Groq (1000/Tag), Mistral (erneuert sich monatlich?) werden nicht live geprüft.
- **Folge:** Christian weiß nicht, ob Venice-Guthaben leer ist, bevor ein Bild-Request 402 wirft.

**Venice-Guthaben nicht in Echtzeit**  
- ⚠️ `/api/balances` cached 5 Min. Wenn Venice leer läuft, sieht Christian es erst 5 Min später im Wächter.
- **Problem:** v54 hat `dryRun`-Flag + Client-Meldung „Kein Venice-Guthaben mehr", aber Wächter zeigt noch altes Guthaben.

**Trials-Ablauf-Benachrichtigung fehlt**  
- ❌ Trials mit `end_date` in ≤3 Tagen werden rot markiert (`expiring`-Klasse), aber **keine Push/Alarm** an Christian.
- **Risiko:** Trial läuft aus, wird vergessen zu kündigen, Abo wird automatisch kostenpflichtig (z. B. Modal, RunPod).

---

### 1.3 Nur Gerüst

**GPU-Server-Schalter** (`functions/api/gpu.ts`)  
- ⚠️ `POST /api/gpu` mit `{action: 'start'}` prüft Budget, wirft aber immer 503 „nicht eingerichtet".
- **Fehlt:** Echte Anbindung an Modal/RunPod/AWS (API-Calls, State-Tracking in KV, Auto-Aus nach 30 Min).
- **UI:** `apps/settings/settings.js` zeigt Schalter (nur nach Entsperren), aber Schalter ist tot.

**Groq/Mistral/Runware-Adapter** (`src/providers.ts`)  
- ✅ Code vorhanden (v67), aber **keine Keys im Tresor → Status „nicht eingerichtet"**.
- **Fehlt:** Christian muss Groq/Mistral-Keys besorgen (gratis) und im Grok-Bot-Chat ins Secret-Feld legen.
- **Runware:** 2 $ Startguthaben, aber kein Key = inaktiv.

**Health-Checks für Backup-Worker**  
- ❌ Backup-Worker läuft täglich, aber **kein Uptime-Monitor** (z. B. Cloudflare Health Checks, UptimeRobot).
- **Risiko:** Worker bricht 5 Tage still ab → Backup-Lücke, niemand merkt es.

---

### 1.4 Widersprüche im Code

**Gateway-URL-Bau** (`src/providers.ts`)  
- Zeile 126–136: `fetchUpstream()` baut Gateway-URL unterschiedlich je Provider (grok → `${root}/grok`, venice/groq/mistral → direkt ohne Gateway).
- **Problem:** `AI_GATEWAY_BASE_URL` wird nur für Gemini/OpenRouter genutzt, aber nicht für grok/venice/groq/mistral → inkonsistentes Caching und Logging.
- **Folge:** Venice/Groq/Mistral laufen **nie** durch das Gateway, auch wenn `CF_ACCOUNT_ID` + `AI_GATEWAY_ID` gesetzt sind → keine Logs, keine Caching-Stats.

**Budget-Sperre für GPU** (`functions/api/gpu.ts`)  
- Zeile 18–28: Prüfung nur bei `action: 'start'`, aber **kein Check bei laufendem Server** (z. B. nach 30 Min Nutzung, Budget schon überschritten).
- **Risiko:** Server läuft weiter, obwohl Budget bei 100 % → unerwartete Kosten.

**Backup-Restore-Check ohne Live-Test**  
- `services/backup/src/index.ts`, Zeile 104–134: `performRestoreCheck()` liest Live-Zeilenzahlen, aber **restored nie in eine Test-DB**.
- **Folge:** „ok: true" heißt nur „Zeilenzahlen ähnlich", nicht „Restore funktioniert tatsächlich".

---

## 2. Nutzerziele (Christian)

1. **Transparenz:** Auf einen Blick sehen, welche Anbieter funktionieren, welche leer sind, welche ausfallen.
2. **Kostenalarm:** Warnung, wenn Venice/VNAIPro/Modal-Guthaben unter 20 % fällt oder wenn ein Trial in 3 Tagen ausläuft.
3. **Backup-Sicherheit:** Jeden Monat bestätigt sehen, dass Backups wiederherstellbar sind (echte Test-Wiederherstellung, nicht nur Zeilenzahl-Vergleich).
4. **Uptime-Monitoring:** Warnung, wenn Hub/Bild-Dienst/Backup-Worker nicht erreichbar oder seit >36h kein Backup.
5. **Ersatzanbieter-Status:** Groq/Mistral/Runware-Guthaben live sehen, ohne manuell in deren Dashboards zu gehen.
6. **GPU-Server-Status:** Sehen, ob Modal/RunPod läuft, wie lange schon, wie viel es kostet (bisher, heute, Monat).
7. **Wenig Tippen:** Alle Infos automatisch holen, nur bei Trials/Abos manuell eingeben.

---

## 3. Ziel-Funktionen mit Priorität

| Funktion | Prio | Begründung |
|----------|------|------------|
| **Venice-Guthaben Echtzeit + Push-Alarm bei <20%** | Must | Christian beschwert sich, dass Bilder plötzlich 402 werfen. Aktuell 5-Min-Cache → zu langsam. Push-Benachrichtigung verhindert Frust. |
| **Groq/Mistral/Runware-Guthaben live** | Must | Ersatzanbieter sind in v67 eingebaut, aber Christian sieht nicht, ob sie funktionieren. Ohne Key „nicht eingerichtet" → verwirrt. |
| **GPU-Endpunkt `/api/gpu` fix (GET-Support)** | Must | 404 → Schalter in UI tot. Ohne Fix bleibt GPU-Server-Feature Gerüst. |
| **Backup-Restore-Test monatlich (echtes Einspielen in Test-DB)** | Must | Aktuell nur Zeilenzahl-Vergleich → falsche Sicherheit. Test-DB in D1 anlegen, restore, SELECT-Stichproben, dann löschen. |
| **Trial-Ablauf-Alarm (3 Tage vorher)** | Should | Modal/RunPod kosten nach Trial. Christian will nicht vergessen zu kündigen. Push-Benachrichtigung + E-Mail (wenn Konto-E-Mail hinterlegt). |
| **Uptime-Monitor für Backup-Worker** | Should | Backup-Status zeigt „lastRun", aber kein Alarm, wenn Worker seit 36h still ist. Health-Check-Endpunkt + externes Pingen (UptimeRobot gratis). |
| **Gateway-Caching für Groq/Mistral/Venice** | Should | Aktuell laufen sie direkt → kein Cache, keine Logs. Konsistenz: alle Provider durch Gateway (außer Venice wegen fehlender Gateway-Unterstützung?). |
| **Budget-Sperre während GPU-Laufzeit** | Should | Aktuell nur bei Start geprüft. Wenn Server 2h läuft und Budget bei 100 % landet, läuft er weiter → Überzug. Alle 10 Min prüfen, bei 100 % stoppen. |
| **Anbieter-Ausfallhistorie (letzte 7 Tage)** | Later | „War Venice gestern down?" → D1-Tabelle `provider_health` (timestamp, provider, ok, latency). Grafik im Wächter. |
| **Secrets-Leak-Scan (GitHub-Commits)** | Later | Christian will sicherstellen, dass keine Keys versehentlich committed wurden. Aber: nur eigene Repos, nur mit GitHub-Token. Aufwand hoch, Nutzen gering (Keys liegen in Vault, nicht im Repo). |
| **TLS-Zertifikat-Ablaufdatum** | Later | Cloudflare managed TLS automatisch → kein manueller Check nötig. Nice-to-have für eigene Domains (falls später). |
| **CVE-Scan für npm-Pakete** | Later | `npm audit` lokal reicht. Automatisch im Wächter → externe API (z. B. Snyk) nötig → Kosten. Christian will kostenfrei. |

---

## 4. UX-Ablauf mit Dropdowns

### 4.1 Wächter öffnen

1. **Startbildschirm (Hub):** Tab „🛡️ Wächter" antippen.
2. **Lazy-Laden:** `apps/waechter/waechter.js` + `waechter.css` werden nachgeladen (einmalig ~26 KB).
3. **Entsperren-Hinweis (falls nicht eingeloggt):** Gelber Banner „🔒 Guthaben, Verbrauch & Abos sind nur nach dem Entsperren (Face ID / PIN) sichtbar."
4. **Ladeindikator:** „⏳ Wächter lädt Status, Verbrauch und Guthaben …"
5. **Parallel-Abfragen:**
   - `GET /api/status` (öffentlich, schnell) → Provider-Status, Gateway, Backup
   - `GET /api/usage?days=30` (auth) → Nutzung heute/30 Tage
   - `GET /api/balances` (auth) → Guthaben (OpenRouter, VNAIPro, Venice, Groq, Mistral, Runware)
   - `GET /api/subscriptions` (auth) → Trials/Abos
6. **Render:** Tiles erscheinen in Sektionen.

---

### 4.2 Provider-Sektion

**Layout:**  
- Grid mit Tiles (4 Spalten Desktop, 2 Spalten Mobile).
- Jeder Tile: Name, Status-Punkt (grün/rot/grau), Nutzung heute (Tokens), Guthaben.

**Status-Punkte:**  
- 🟢 **Grün:** Key vorhanden, letzte Abfrage <1h erfolgreich, Guthaben >20 %.
- 🔴 **Rot:** Key fehlt oder Guthaben <5 % oder letzte Abfrage Fehler (5xx/401).
- ⚪ **Grau:** Optional (Groq/Mistral/Runware) + kein Key → „nicht eingerichtet".

**Tiles (v67-Stand, erweitert):**  
- Gemini, OpenRouter, Venice, Grok, Groq, Mistral, Runware, Hugging Face, VNAIPro.
- Neu: **Groq**, **Mistral**, **Runware** als eigene Tiles (nicht mehr unter „Optional").

**Klick auf Tile:**  
- Detail-Panel öffnet sich (slide-in von rechts).
- **Header:** Provider-Name, ✕ zum Schließen.
- **Abschnitte:**
  1. **Nutzung heute:** Anfragen, Prompt-Tokens, Output-Tokens, Kosten ($).
  2. **Nutzung 30 Tage:** ditto.
  3. **Guthaben:** Balance (USD), Genutzt (USD), Limit (USD), Hinweis (z. B. „Erneuert sich monatlich").
  4. **Schlüssel:** „Konfiguriert" / „Nicht konfiguriert" + Link „Schlüssel verwalten → Tresor".
  5. **Letzter Check:** Zeitstempel + Latenz (ms) + Fehler (falls vorhanden).

**Beispiel-Tile (Venice):**  
```
┌──────────────────────┐
│ 🟢 Venice            │
│ 1.2M heute           │
│ $12.34               │  ← Guthaben
└──────────────────────┘
```

**Klick → Detail:**  
```
┌─────────────────────────────────────┐
│ Venice                          ✕   │
├─────────────────────────────────────┤
│ Nutzung heute                       │
│ Anfragen: 24                        │
│ Prompt: 850K · Output: 120K         │
│ Kosten: $0.42                       │
├─────────────────────────────────────┤
│ Nutzung 30 Tage                     │
│ Anfragen: 680 · Kosten: $8.76       │
├─────────────────────────────────────┤
│ Guthaben                            │
│ $12.34 (von $50.00 Free/Monat)      │
│ 🟡 Unter 30 % – bald leer           │
├─────────────────────────────────────┤
│ Letzter Check: vor 2 Min (248 ms)   │
│ Schlüssel verwalten →               │
└─────────────────────────────────────┘
```

---

### 4.3 GPU-Server-Sektion (neu)

**Bedingung:** Nur sichtbar nach Entsperren (Face ID/PIN), Rolle `admin`.

**Tile:**  
```
┌──────────────────────┐
│ 🚀 GPU-Server        │
│ Modal · Läuft 18 Min │  ← wenn an
│ $0.24 heute          │
└──────────────────────┘
```

**Klick → Detail-Panel:**  
```
┌─────────────────────────────────────┐
│ 🚀 GPU-Server                   ✕   │
├─────────────────────────────────────┤
│ Status: 🟢 Läuft (18 Min)           │
│ Provider: Modal (L40S)              │
│ Kosten/Stunde: $1.95                │
│ Heute: $0.24 · Monat: $12.80        │
│ Budget: 64 % ($12.80 / $20.00)      │
├─────────────────────────────────────┤
│ [Server stoppen]                    │
│ ⚠️ Schaltet sich in 12 Min autom.   │
│    aus (30 Min Idle-Timer)          │
└─────────────────────────────────────┘
```

**Ausgeschaltet:**  
```
│ Status: ⚪ Aus                       │
│ [Server starten] (startet in ~2 Min)│
│ Kosten/Stunde: $1.95 · Budget: 64 % │
```

**Nicht eingerichtet:**  
```
│ Status: ⚠️ Nicht eingerichtet       │
│ Modal/RunPod/AWS-Konten fehlen.     │
│ Anleitung → [Konzept öffnen]        │
```

---

### 4.4 Backup-Sektion

**v67-Stand:**  
```
┌─────────────────────────────────────┐
│ 💾 Backup                           │
├─────────────────────────────────────┤
│ Letztes Backup: 30.10.26, 08:12 ✅  │
│ (KV, 3.6 MB)                        │
│ Restore-Test: 01.10.26 ✅           │
└─────────────────────────────────────┘
```

**Erweitert (mit Klick → Detail):**  
```
┌─────────────────────────────────────┐
│ 💾 Backup                       ✕   │
├─────────────────────────────────────┤
│ Letztes Backup                      │
│ 30.10.2026, 08:12 ✅                │
│ Ziel: KV · Größe: 3.6 MB            │
│ Tabellen: 23 · KV-Keys: 847         │
├─────────────────────────────────────┤
│ Restore-Test (monatlich)            │
│ 01.10.2026 ✅ Alle Tabellen ok      │
│ Nächster Test: 01.11.2026           │
├─────────────────────────────────────┤
│ Uptime-Check (extern)               │
│ UptimeRobot: ✅ 99.8 % (30 Tage)    │
│ Letzter Ping: vor 5 Min             │
├─────────────────────────────────────┤
│ [Backup jetzt ausführen] (Admin)    │
│ [Restore-Check erzwingen] (Admin)   │
└─────────────────────────────────────┘
```

**Fehlerfall:**  
```
│ ⚠️ Letztes Backup: vor 38 Stunden   │
│ Fehler: Worker-Timeout              │
│ [Backup jetzt ausführen]            │
```

---

### 4.5 Gratis-Angebote-Sektion

**v67-Stand:** Liste mit Name, Notiz, geprüft-Datum, [Öffnen ↗]-Button.

**Erweitert (automatische Checks):**  
```
┌─────────────────────────────────────┐
│ 🎁 Gratis-Angebote                  │
├─────────────────────────────────────┤
│ Venice Free                         │
│ $12.34 / $50.00 (25 % verbraucht)   │
│ Erneuert: 01.11.2026 (in 2 Tagen)   │
│ [Dashboard öffnen ↗]                │
├─────────────────────────────────────┤
│ OpenRouter Free Models              │
│ 18 / 50 Anfragen heute (gpt-oss)    │
│ Reset: Mitternacht UTC              │
├─────────────────────────────────────┤
│ Groq (LLM + Whisper)                │
│ 340 / 1000 Anfragen heute           │
│ Whisper: 12 / 2000 heute            │
├─────────────────────────────────────┤
│ Mistral Free                        │
│ ⚠️ Kein Key → nicht aktiv           │
│ [Key im Tresor hinzufügen]          │
├─────────────────────────────────────┤
│ Runware (Bilder)                    │
│ $1.83 / $2.00 Startguthaben         │
│ 🔴 Bald leer                        │
└─────────────────────────────────────┘
```

**Datenquelle:**  
- Venice: `/api/balances` (cached 5 Min → Echtzeit-Upgrade nötig, siehe W-1).
- OpenRouter: API `/v1/generation?limit=50` (letzten 50 Requests zählen, Filter nach Free-Modellen).
- Groq: API `/openai/v1/usage` (falls vorhanden, sonst „nicht verfügbar").
- Mistral: API (falls Free-Tier-Endpoint existiert).
- Runware: `/v1/balance` (API-Doku prüfen).

---

### 4.6 Trials & Abos-Sektion

**v67-Stand:** Liste mit Name, Provider, Zeitraum, „noch X Tage", [Kündigen ↗], [🗑️] (Admin).

**Erweitert (mit Alarm):**  
```
┌─────────────────────────────────────┐
│ Trials & Abos                       │
├─────────────────────────────────────┤
│ 🔴 Modal Starter Trial              │
│ modal · 01.10. – 31.10.2026         │
│ ⚠️ Noch 1 Tag – bitte kündigen!     │
│ [Kündigen ↗] [🗑️]                   │
├─────────────────────────────────────┤
│ 🟢 OpenRouter Plus                  │
│ openrouter · 15.10. – 14.11.2026    │
│ noch 15 Tage                        │
│ [Kündigen ↗] [🗑️]                   │
├─────────────────────────────────────┤
│ [+ Trial hinzufügen] (Admin)        │
└─────────────────────────────────────┘
```

**Formular (Admin):**  
- Name (Textfeld)
- Provider (Dropdown: modal, runpod, aws, openrouter, venice, runware, gratis, sonstiges)
- Start-Datum (date-Input, Standardwert: heute)
- End-Datum (date-Input)
- Kündigungs-URL (optional, URL-Feld)
- Notiz (optional, textarea, 2 Zeilen)
- [Trial hinzufügen]-Button

---

### 4.7 Push-Benachrichtigungen (neu)

**Bedingung:** Service Worker aktiv, Benachrichtigungs-Erlaubnis erteilt.

**Trigger:**  
1. **Venice-Guthaben <20 %:** Einmal täglich Benachrichtigung „Venice-Guthaben bei $8.50 (17 %) – bald leer".
2. **Trial läuft in 3 Tagen ab:** Benachrichtigung „Modal Starter Trial endet am 31.10. – bitte kündigen!".
3. **Backup-Worker seit >36h still:** „Backup-Worker läuft nicht – letztes Backup vor 38 Stunden".
4. **GPU-Server läuft >2h (Budget-Alarm):** „GPU-Server läuft seit 2h 15 Min – Budget bei 78 %".

**UI:**  
- Benachrichtigungen erscheinen als Browser-Push (auch bei geschlossenem Tab).
- Klick auf Benachrichtigung öffnet Hub → Wächter-Tab.
- Im Hub: Roter Punkt am Wächter-Tab (wie v66 News-Dots).

**Opt-Out:**  
- Einstellungen → „Benachrichtigungen" → Toggle für jede Alarm-Art (Standard: alle an).

---

## 5. Architektur / Daten / API-Änderungen

### 5.1 API-Endpunkte (erweitert/neu)

| Endpunkt | Methode | Auth | Änderung | Begründung |
|----------|---------|------|----------|------------|
| `/api/status` | GET | ❌ | Erweitern: `lastCheck` (timestamp per provider), `gatewayLatency` auch für Groq/Mistral/Venice (falls durch Gateway), `backup.nextCheck` (erster des nächsten Monats) | Detailliertere Infos für Wächter-Details |
| `/api/balances` | GET | ✅ (read) | Cache auf 1 Min senken (statt 5 Min), Echtzeit-Option `?realtime=1` (kein Cache) | Venice-Guthaben-Alarm braucht aktuelle Daten |
| `/api/balances` | GET | ✅ | Neue Anbieter: `groq`, `mistral`, `runware` | Gratis-Angebote live zeigen |
| `/api/gpu` | GET | ✅ (admin) | **Neu exportieren:** `onRequestGet` in `functions/api/gpu.ts` | Status-Abfrage (läuft/aus/nicht eingerichtet) |
| `/api/gpu` | GET | ✅ | Response: `{state: 'running'|'stopped'|'starting'|'not_configured', provider: 'modal'|'runpod'|'aws'|null, uptime: seconds, cost: {hour: usd, today: usd, month: usd}, idleSince: timestamp|null}` | Für GPU-Detail-Panel im Wächter |
| `/api/gpu` | POST | ✅ (admin) | Erweitern: Budget-Check auch bei laufendem Server (Action `check_budget`) | Verhindert Überzug während Laufzeit |
| `/api/health` | GET | ❌ | Erweitern: `{ok: true, time: ISO, uptime: seconds, lastBackup: ISO, d1: bool, kv: bool, r2: bool}` | Für externen Uptime-Monitor (UptimeRobot) |
| `/api/usage` | GET | ✅ (read) | Keine Änderung (schon in v67) | Bereits ok |
| `/api/subscriptions` | GET/POST/DELETE | siehe v67 | Keine Änderung | Bereits ok |
| `/api/provider-health` | GET | ✅ (read) | **Neu:** Ausfallhistorie letzte 7 Tage (timestamp, provider, ok, latency, error) aus D1-Tabelle `provider_health` | Später-Feature (nicht Must) |
| `/api/alarms` | GET | ✅ (read) | **Neu:** Aktive Alarme (Venice <20 %, Trial <3 Tage, Backup >36h, GPU >2h) als JSON-Array | Für roten Punkt am Wächter-Tab |

---

### 5.2 D1-Tabellen (neu/erweitert)

**Neu: `provider_health`**  
```sql
CREATE TABLE provider_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,            -- ISO-8601
  provider TEXT NOT NULL,              -- 'gemini', 'venice', 'openrouter', ...
  ok INTEGER NOT NULL,                 -- 1 = success, 0 = error
  latency_ms INTEGER,                  -- Response-Zeit (ms)
  error TEXT                           -- Fehlermeldung (falls ok=0)
);
CREATE INDEX idx_provider_health_ts ON provider_health(timestamp DESC);
CREATE INDEX idx_provider_health_prov ON provider_health(provider, timestamp DESC);
```

**Zweck:** Ausfallhistorie für Grafik im Wächter (Later-Feature).

**Eintrag:** Nach jedem `/api/balances` oder `/api/status`-Aufruf (throttle: max. 1 Eintrag/Provider/Minute).

---

**Erweitert: `subscriptions`**  
Keine Schema-Änderung, aber neue Nutzung:  
- `provider = 'gratis'` → automatisch erkannte Gratis-Angebote (Venice Free, OpenRouter Free, Groq, Mistral).
- Wird bei jedem `/api/balances`-Aufruf aktualisiert (Upsert nach Name).

---

### 5.3 KV-Schlüssel (neu)

| Schlüssel | Typ | TTL | Inhalt | Zweck |
|-----------|-----|-----|--------|-------|
| `balances:cached` | JSON | 60s | Gecachte Balances (aktuell 300s → senken) | Performance |
| `balances:realtime:<provider>` | JSON | 10s | Ungecachtes Guthaben (für `?realtime=1`) | Echtzeit-Alarm |
| `gpu:state` | JSON | – | `{on: bool, provider: string, startedAt: ISO, lastActivity: ISO, cost: {today: usd, month: usd}}` | GPU-Status-Tracking |
| `gpu:auto-off-timer` | string | 1800s | Timestamp (ISO) des letzten GPU-Requests | Auto-Aus nach 30 Min Idle |
| `alarms:venice-low` | string | 86400s | Timestamp (ISO) der letzten Venice-Alarm-Benachrichtigung | Max. 1×/Tag |
| `alarms:trial:<id>` | string | 86400s | ditto | Max. 1×/Tag pro Trial |
| `alarms:backup-stale` | string | 86400s | ditto | Max. 1×/Tag |
| `alarms:gpu-long` | string | 3600s | ditto | Max. 1×/Stunde |

---

### 5.4 R2-Buckets

**Bestehendes Bucket:** `jeffa-backup` (in v67 noch nicht aktiv, weil R2 im Konto noch nicht aktiviert ist).

**Struktur:**  
```
jeffa-backup/
  jeffa-backup-2026-10-30.bin
  jeffa-backup-2026-10-29.bin
  ...
```

**Retention:** 30 Tage (alte Dateien werden täglich gelöscht).

---

### 5.5 Service Worker (Push-Benachrichtigungen)

**Datei:** `public/sw.js` (schon vorhanden für Offline-Cache).

**Erweitern um:**  
```javascript
self.addEventListener('push', (event) => {
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: data.tag, // z.B. 'venice-low', 'trial-expiring'
    requireInteraction: data.urgent, // true für Trial/Backup-Alarm
    data: { url: '/#waechter' }
  };
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
```

**Push-Trigger:** Cloudflare Worker (separater Worker oder Hub-Function) prüft alle 10 Min (Cron):  
1. Venice-Guthaben <20 % → Push an alle Subscriptions (aus KV `push:subscriptions`).
2. Trials <3 Tage → ditto.
3. Backup >36h → ditto.
4. GPU >2h → ditto.

**Subscription-Verwaltung:** Neue Datei `apps/shared/push.js`:  
```javascript
export async function subscribePush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
  });
  await api('/api/push/subscribe', { method: 'POST', body: subscription });
}
```

**Neue API-Endpunkte:**  
- `POST /api/push/subscribe` (auth) → speichert Subscription in KV `push:subscriptions:<sessionId>`.
- `DELETE /api/push/unsubscribe` (auth) → löscht Subscription.

**VAPID-Keys:** Als Cloudflare-Secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`). Generierung einmalig per `npx web-push generate-vapid-keys`.

---

### 5.6 Backup-Worker (Erweiterungen)

**Datei:** `services/backup/src/index.ts`

**Änderung 1: Restore-Check mit echter Test-DB**  
Aktuell: `performRestoreCheck()` liest nur Zeilenzahlen.

**Neu:**  
1. Test-D1 anlegen (per `wrangler d1 create jeffa-kollab-restore-test`, einmalig manuell).
2. Backup entschlüsseln + entpacken.
3. SQL in Test-D1 einspielen (`CREATE TABLE` + `INSERT`).
4. Stichproben-SELECTs (z. B. `SELECT COUNT(*) FROM conversations`, `SELECT * FROM profiles LIMIT 1`).
5. Test-D1 leeren (`DROP TABLE` alle).
6. Ergebnis in KV `backup:restorecheck`: `{at: ISO, ok: bool, tables: [{name, rows, sample: object}], error?: string}`.

**Problem:** D1-API erlaubt kein programmgesteuertes `CREATE DATABASE`. Workaround:  
- Test-D1 muss manuell angelegt werden (`wrangler d1 create jeffa-kollab-restore-test`).
- Binding im `wrangler.toml` des Backup-Workers: `DB_TEST`.
- Restore-Check nutzt `DB_TEST` statt `DB`.

**Kosten:** Test-D1 zählt gegen D1-Free-Tier (10 GB, 5 Mio Reads/Tag) → vernachlässigbar (1×/Monat, <10 MB, <1000 Rows).

---

**Änderung 2: Health-Check-Endpunkt**  
`GET /health` (öffentlich, kein Auth):  
```json
{
  "ok": true,
  "lastRun": "2026-10-30T08:12:00Z",
  "ageHours": 2.3,
  "target": "r2",
  "bytes": 3774582
}
```

**Zweck:** Externes Monitoring (UptimeRobot) pingt alle 5 Min. Wenn `ageHours > 36` oder `ok: false` → Alarm-E-Mail an Christian.

---

### 5.7 GPU-Server-Integration (Modal-Beispiel)

**Datei:** Neue Datei `src/gpu.ts`

**Funktionen:**  
```typescript
export async function startGpu(env: Env, provider: 'modal'|'runpod'|'aws'): Promise<void>;
export async function stopGpu(env: Env): Promise<void>;
export async function gpuState(env: Env): Promise<GpuState>;
export async function checkGpuBudget(env: Env): Promise<{ok: bool, reason?: string}>;

interface GpuState {
  on: boolean;
  provider: 'modal'|'runpod'|'aws'|null;
  startedAt: string|null; // ISO
  uptime: number; // seconds
  idleSince: string|null; // ISO
  cost: { hour: number, today: number, month: number };
}
```

**Modal-API-Calls (Beispiel):**  
- **Start:** `POST https://api.modal.com/v1/apps/{app_id}/deploy` (mit Modal-Token aus Secret `MODAL_TOKEN`).
- **Stop:** `POST https://api.modal.com/v1/apps/{app_id}/stop`.
- **Status:** `GET https://api.modal.com/v1/apps/{app_id}` → `{state: 'running'|'stopped'}`.

**State-Tracking:**  
- KV `gpu:state` speichert `{on, provider, startedAt, lastActivity}`.
- Bei jedem Bild-Request (`/api/image`, `/api/imagefb`) wird `lastActivity` aktualisiert.
- Alle 5 Min (Cron) prüft Worker: `Date.now() - lastActivity > 30 Min` → `stopGpu()`.

**Budget-Check:**  
- Vor `startGpu()`: wie in v67 (`budgetAllowsGpu()`).
- Alle 10 Min während Laufzeit: Budget-Check wiederholen, bei 100 % → `stopGpu()` + Push-Benachrichtigung.

---

## 6. Anbieter-Strategie (Status-Abfragen, Backup in R2)

### 6.1 Status-Abfragen

**Ziel:** Jeder Provider-Tile im Wächter zeigt Echtzeit-Status (grün/rot/grau).

**Strategie:**  
1. **Key-Check** (sofort): `getKey(env, provider)` → vorhanden/nicht → Status grau („nicht eingerichtet") oder potentiell grün.
2. **Guthaben-Abfrage** (alle 1–5 Min, gecached):
   - **Venice:** `GET https://api.venice.ai/api/v1/api_keys/rate_limits` → `balances.USD`.
   - **OpenRouter:** `GET https://openrouter.ai/api/v1/credits` → `total_credits - total_usage`.
   - **VNAIPro:** `GET <BASE>/v1/dashboard/billing/usage` → `total_usage` (in Cents).
   - **Groq:** Kein Guthaben-API → „unbegrenzt (Rate-Limits)" anzeigen.
   - **Mistral:** `GET https://api.mistral.ai/v1/billing/usage` (falls vorhanden, API-Doku prüfen).
   - **Runware:** `GET https://api.runware.ai/v1/balance` (API-Doku prüfen).
3. **Health-Check** (alle 60s):
   - Leichtgewichtige Test-Anfrage (z. B. Modell-Liste oder Echo-Endpoint).
   - Gemini: `GET https://generativelanguage.googleapis.com/v1beta/models`.
   - OpenRouter: `GET https://openrouter.ai/api/v1/models`.
   - Venice: ditto (Guthaben-Abfrage zählt als Health-Check).
   - Groq: `GET https://api.groq.com/openai/v1/models`.
   - Bei Fehler (5xx, Timeout >5s, 401) → Status rot.
4. **Eintrag in D1 `provider_health`** (throttle: max. 1×/Min/Provider).

**Kosten:**  
- Venice/OpenRouter/VNAIPro/Groq/Mistral/Runware-Guthaben-APIs: **kostenlos** (keine Token verbraucht).
- Gemini-Modell-Liste: **kostenlos** (keine Generation).
- Cache senkt Anfragen: 1 Min TTL → max. 1440 Anfragen/Tag/Provider → vernachlässigbar.

**Cache-Strategie:**  
- **Standard:** 1 Min Cache in KV (`balances:cached`).
- **Echtzeit-Modus:** `GET /api/balances?realtime=1` → kein Cache, direkte Abfrage → für Alarm-Trigger (Cron alle 10 Min).

---

### 6.2 Backup-Strategie

**R2 aktivieren:**  
Christian muss einmalig im Cloudflare-Dashboard R2 aktivieren (kostenlos bis 10 GB/Monat, 1 Mio Class-A-Ops).

**Binding anlegen:**  
`wrangler.toml` (Backup-Worker):  
```toml
[[r2_buckets]]
binding = "BACKUP"
bucket_name = "jeffa-backup"
```

**Fallback-Hierarchie:**  
1. **R2** (wenn Binding vorhanden) → unbegrenzte Größe, bis 10 GB kostenlos.
2. **KV** (wenn R2 fehlt) → max. 25 MB/Blob (v67-Stand), Chunks für größere Backups.
3. **Fehler** (wenn beides fehlt) → Status „Backup-Ziel fehlt".

**Test-Wiederherstellung:**  
- Einmal monatlich (1. des Monats) automatisch.
- Manuell per `POST /run?check=1` (x-backup-key-Header).
- Test-D1 `jeffa-kollab-restore-test` muss existieren (manuell anlegen).

**Kosten (R2):**  
- **Speicher:** 3,6 MB × 30 Tage = 108 MB → **$0** (Free Tier bis 10 GB).
- **Class-A-Ops** (Write): 30 Backups + 30 Deletes = 60 Ops → **$0** (Free Tier 1 Mio).
- **Class-B-Ops** (Read): 1 Restore-Test/Monat = 1 Op → **$0**.
- **Gesamt:** **$0 / Monat**.

**Bei >10 GB Backups:** Speicher kostet $0.015/GB/Monat → 20 GB = $0.15/Monat.

---

### 6.3 Uptime-Monitoring (extern)

**Dienst:** UptimeRobot (Free Plan: 50 Monitore, 5-Min-Intervall).

**Endpunkte überwachen:**  
1. **Hub:** `https://jeffa-hub.pages.dev/api/health` → erwartet 200, `ok: true`.
2. **Bild-Dienst:** `https://jeffa-bild.pages.dev/api/health` → ditto.
3. **Backup-Worker:** `https://jeffa-backup.<workers-subdomain>.workers.dev/health` → erwartet `ageHours < 36`.

**Alarm:**  
- UptimeRobot sendet E-Mail an Christians Konto-E-Mail (z. B. christian@example.com).
- Zusätzlich: Webhook an Hub → Trigger Push-Benachrichtigung.

**Kosten:** **$0** (Free Plan).

---

## 7. Testplan und Abnahmekriterien pro Funktion

| Funktion | Fertig heißt ... | Prüfung |
|----------|------------------|---------|
| **W-1: Venice-Guthaben Echtzeit** | 1) `/api/balances?realtime=1` liefert Venice-Guthaben ohne Cache (<2s). 2) Wächter zeigt Venice-Tile mit Guthaben + Prozent. 3) Wenn <20 %: roter Status + Push-Benachrichtigung (einmal/Tag). 4) Test: Venice-Key mit $8 Guthaben (von $50) → Tile rot, Push kommt an (Browser-Benachrichtigung). | Manuell: Venice-Test-Key mit niedrigem Guthaben; Browser-Console → Service Worker Push-Event; Smartphone-Test (iOS Safari, Chrome Android). |
| **W-2: Groq/Mistral/Runware-Guthaben** | 1) `/api/balances` liefert `groq`, `mistral`, `runware` mit `{ok, balanceUsd?, note}`. 2) Wächter zeigt 3 Tiles (grau wenn kein Key, grün mit Nutzung/Limit). 3) Test: Groq-Key → Tile grün, „340 / 1000 Anfragen heute". | Unit-Test: Mock-API-Antworten (Groq/Mistral/Runware); Live-Test: echte Keys (Christian beschafft). |
| **W-3: GPU-Endpunkt GET-Support** | 1) `GET /api/gpu` (auth admin) → 200, JSON `{state, provider, uptime, cost, idleSince}`. 2) Wenn nicht eingerichtet: `{state: 'not_configured'}`. 3) Test: vor/nach GPU-Start → State wechselt von `stopped` zu `running`. | Live-Test: Hub → Einstellungen → GPU-Schalter → Status-Abfrage (Network-Tab: GET /api/gpu → 200). |
| **W-4: Backup-Restore-Test (echt)** | 1) Test-D1 `jeffa-kollab-restore-test` existiert (manuell angelegt). 2) Restore-Check (monatlich/manuell) spielt Backup ein, prüft `SELECT COUNT(*)` + `SELECT * LIMIT 1` je Tabelle. 3) Status in KV `backup:restorecheck`: `{ok: true, tables: [...]}`. 4) Wächter zeigt „Restore-Test: 01.11.26 ✅". 5) Test: Backup manuell triggern → Check → Wächter aktualisieren. | Manuell: `wrangler d1 create jeffa-kollab-restore-test` → `POST /run?check=1` (x-backup-key) → KV prüfen → Wächter öffnen. |
| **W-5: Trial-Ablauf-Alarm** | 1) Trial mit `end_date` in ≤3 Tagen → Push-Benachrichtigung „Trial endet am DD.MM. – bitte kündigen!". 2) Einmal/Tag (kein Spam). 3) Wächter-Tile rot markiert. 4) Test: Trial mit `end_date` = morgen anlegen → Push kommt an. | Manuell: Trial mit nahem Datum anlegen → Cron simulieren (oder warten) → Push-Event prüfen → Smartphone-Test. |
| **W-6: Uptime-Monitor für Backup** | 1) UptimeRobot überwacht `/health` (Backup-Worker). 2) Wenn `ageHours > 36` oder Status 500 → E-Mail-Alarm an Christian + Push. 3) Test: Backup-Worker manuell stoppen (Cron deaktivieren) → 36h warten (oder Mock-Timestamp in KV setzen) → Alarm. | Manuell: KV `backup:status.lastRun` auf vor 40h setzen → `/health` aufrufen → 503 erwartet → UptimeRobot prüft → E-Mail + Push. |
| **W-7: Gateway-Caching für Groq/Mistral** | 1) `src/providers.ts`: Groq/Mistral-Anfragen laufen durch Gateway (wenn `CF_ACCOUNT_ID` + `AI_GATEWAY_ID` gesetzt). 2) Gateway-Logs zeigen Groq/Mistral-Requests. 3) Test: Chat mit `groq:llama3-70b` → Gateway-Dashboard → Request sichtbar. | Live-Test: Chat → Model `groq:llama3-70b` → Cloudflare-Dashboard → AI Gateway → Logs prüfen. |
| **W-8: Budget-Sperre während GPU-Laufzeit** | 1) GPU läuft. 2) Alle 10 Min: Budget-Check. 3) Bei 100 %: `stopGpu()` + Push „GPU gestoppt – Budget erreicht". 4) Test: Budget auf $1 setzen, GPU starten, 1h warten (kostet >$1) → Auto-Stopp. | Manuell: Budget-Limit niedrig setzen (z. B. $0.50), GPU starten, `cost.month` in KV manuell auf $0.49 setzen, Cron-Check simulieren → Stopp + Push. |
| **W-9: Push-Benachrichtigungen (Infrastruktur)** | 1) Service Worker registriert Push-Subscription. 2) `POST /api/push/subscribe` speichert in KV. 3) Cron-Worker sendet Test-Push. 4) Browser zeigt Benachrichtigung. 5) Klick öffnet Hub → Wächter. 6) Test: alle Browser (Safari iOS, Chrome Android, Chrome Desktop, Firefox). | Unit-Test: Mock-Subscription, Mock-Push-Event; Live-Test: 6 Browser, Push-Trigger manuell (`POST /api/push/test`). |

---

## 8. Risiken

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| **R2 nicht aktiviert → Backup bleibt in KV (25 MB Limit)** | Mittel (Christian muss manuell aktivieren) | Hoch (Backup scheitert bei Wachstum >25 MB) | 1) Anleitung im Konzept + Commit-Message. 2) Backup-Worker warnt bei KV-Fallback („R2 aktivieren empfohlen"). 3) KV-Chunks als Notlösung (v67 hat das schon). |
| **Venice/Groq/Mistral-APIs ändern sich → Balance-Abfragen brechen** | Mittel | Mittel (Wächter zeigt „API-Fehler", aber Hub funktioniert weiter) | 1) Try-Catch in `/api/balances`. 2) Fallback: „Nicht verfügbar" statt Fehler. 3) Test nach jeder Anbieter-Update. |
| **Modal/RunPod-Konten fehlen → GPU-Feature bleibt Gerüst** | Hoch | Mittel (Christian kann es später einrichten) | 1) Gerüst funktioniert, zeigt „nicht eingerichtet". 2) Anleitung im Ausbau-Konzept. 3) Kein Blocker für andere Features. |
| **Push-Benachrichtigungen auf iOS Safari limitiert** | Hoch (iOS <16.4: kein Push; ab 16.4: nur wenn „Zum Home-Bildschirm" hinzugefügt) | Mittel (Christian hat iPhone, kann App installieren) | 1) UI-Hinweis „Für Push: App installieren". 2) Fallback: In-App-Banner im Wächter (ohne Push). 3) E-Mail-Backup (UptimeRobot sendet E-Mail). |
| **Restore-Test scheitert wegen Foreign-Key-Constraint** | Mittel | Hoch (falsches Sicherheitsgefühl) | 1) SQL in korrekter Reihenfolge einspielen (Tabellen mit `PRAGMA foreign_keys=OFF` oder in Abhängigkeits-Reihenfolge). 2) Test-DB nach Einspielen: `PRAGMA integrity_check`. 3) Fehler in `backup:restorecheck.error` loggen. |
| **Cron-Worker läuft nicht (Workers-Subdomain nicht eingerichtet)** | Mittel | Hoch (kein Backup, kein Alarm) | 1) Anleitung: Workers-Subdomain im Dashboard → Workers & Pages → <Konto> → Subdomain festlegen. 2) Nach erstem Deploy: `wrangler deploy` zeigt Subdomain → in Cron-Trigger eintragen. 3) UptimeRobot überwacht `/health` → fällt auf, wenn Cron still ist. |
| **Budget-Zählung falsch → GPU läuft trotz 100 %** | Gering | Hoch (unerwartete Kosten) | 1) Budget-Check vor Start + alle 10 Min während Laufzeit. 2) Modal/RunPod haben eigene Spend-Limits (siehe Ausbau-Konzept 1a). 3) Test mit niedrigem Budget-Limit ($0.50). |
| **Zu viele Provider-Health-Einträge → D1-Tabelle wächst unbegrenzt** | Mittel | Mittel (D1 Free Tier: 5 GB, aber Leseleistung sinkt) | 1) Retention: nur 7 Tage behalten (täglich alte Einträge löschen, `DELETE FROM provider_health WHERE timestamp < ?`). 2) Index auf `timestamp` (schon vorhanden). 3) Bei 1 Eintrag/Min/Provider: 7 Tage × 1440 Min × 9 Provider = 90.720 Rows → <10 MB. |

---

## 9. Arbeitspakete

| ID | Inhalt | Betroffene Dateien | Abhängigkeit | Geschätzte Claude-Kosten $ | Fertig heißt |
|----|--------|-------------------|--------------|---------------------------|--------------|
| **W-1** | Venice-Guthaben Echtzeit: `/api/balances` Cache auf 1 Min senken, `?realtime=1`-Option, Wächter-Tile zeigt Prozent + Farbe (grün/gelb/rot), Push-Benachrichtigung bei <20 % (Cron alle 10 Min prüft). | `functions/api/balances.ts`, `apps/waechter/waechter.js`, `apps/waechter/waechter.css`, `public/sw.js` (Push-Handler), neue Datei `functions/cron/alarms.ts` | – | 1,20 $ (3 Aufrufe) | Venice-Tile rot bei $8/$50, Push-Event im Browser (getestet auf Chrome Desktop + iOS Safari via Test-Button im Wächter). |
| **W-2** | Groq/Mistral/Runware-Guthaben: Balances-Endpunkt erweitern (3 neue Provider), Wächter-Tiles hinzufügen (grau wenn kein Key, grün mit Nutzung/Limit). API-Adapter für Groq/Mistral/Runware-Balance-Endpoints (falls vorhanden, sonst „nicht verfügbar"). | `functions/api/balances.ts`, `apps/waechter/waechter.js` | – | 0,80 $ (2 Aufrufe) | 3 Tiles im Wächter, Groq-Tile grün mit „340/1000 Anfragen heute" (Mock-Test + Live-Test mit echtem Key). |
| **W-3** | GPU-Endpunkt GET-Support: `functions/api/gpu.ts` → `onRequestGet` exportieren, Response `{state, provider, uptime, cost, idleSince}` (liest aus KV `gpu:state`). Wächter-Tile + Detail-Panel für GPU-Server. | `functions/api/gpu.ts`, `apps/waechter/waechter.js`, `apps/waechter/waechter.css` | – | 0,60 $ (2 Aufrufe) | `GET /api/gpu` → 200 (nicht mehr 404), Wächter zeigt GPU-Tile mit „Nicht eingerichtet" (da kein Konto). |
| **W-4** | Backup-Restore-Test (echt): Test-D1 `jeffa-kollab-restore-test` (manuell anlegen, Anleitung im Commit-Message), `performRestoreCheck()` spielt SQL ein (CREATE + INSERT), Stichproben-SELECTs, Ergebnis in KV, Wächter zeigt Tabellen + Samples. | `services/backup/src/index.ts`, `services/backup/src/core.js`, `services/backup/wrangler.toml` (neues Binding `DB_TEST`), `apps/waechter/waechter.js` | – | 1,40 $ (4 Aufrufe) | KV `backup:restorecheck` enthält `{ok: true, tables: [{name, rows, sample}]}`, Wächter zeigt „Restore-Test: 01.11.26 ✅ 23 Tabellen ok". Manueller Test: Backup triggern → Check → Sample-Daten prüfen. |
| **W-5** | Trial-Ablauf-Alarm: Cron-Worker prüft Trials (`end_date <= now + 3 days`), sendet Push-Benachrichtigung (max. 1×/Tag per Trial, KV-Throttle `alarms:trial:<id>`), Wächter-Tile rot markieren (CSS-Klasse `expiring` schon in v67). | `functions/cron/alarms.ts` (erweitern), `apps/waechter/waechter.js` (roten Punkt am Tab bei Alarm) | W-1 (Push-Infrastruktur) | 0,80 $ (2 Aufrufe) | Trial mit `end_date` = morgen → Push-Benachrichtigung „Trial endet am DD.MM." → Wächter-Tab roter Punkt → Trial-Liste rot markiert. |
| **W-6** | Uptime-Monitor für Backup: `/health`-Endpunkt im Backup-Worker (GET, öffentlich, zeigt `ageHours`), UptimeRobot-Setup-Anleitung (im Commit-Message + Konzept), Webhook an Hub → Push-Benachrichtigung bei `ageHours > 36`. | `services/backup/src/index.ts` (GET /health erweitern), `functions/api/webhooks/uptime.ts` (neu, empfängt UptimeRobot-Webhook), `functions/cron/alarms.ts` (Backup-Alarm) | W-1 (Push) | 0,60 $ (2 Aufrufe) | `/health` → `{ok, ageHours}`, KV `backup:status.lastRun` auf 40h alt setzen → Cron-Check → Push „Backup seit 40h still" → Wächter roter Punkt. UptimeRobot manuell einrichten (nicht in Claude-Job, nur Anleitung). |
| **W-7** | Gateway-Caching für Groq/Mistral: `src/providers.ts` → `fetchUpstream()` umbauen (Groq/Mistral nutzen Gateway, wenn vorhanden), Venice bleibt direkt (da Venice-Gateway-Support unsicher). Test: Gateway-Logs zeigen Groq/Mistral-Requests. | `src/providers.ts` | – | 0,80 $ (2 Aufrufe) | Chat mit `groq:llama3-70b` → Gateway-Dashboard zeigt Request, Cache-Hit nach 2. Request (gleicher Prompt). Live-Test im Hub. |
| **W-8** | Budget-Sperre während GPU-Laufzeit: Cron alle 10 Min prüft `gpu:state` (wenn `on: true`), ruft `checkGpuBudget()`, bei 100 % → `stopGpu()` + Push. KV `gpu:auto-budget-check` (Timestamp letzter Check). | `functions/cron/gpu-budget.ts` (neu), `src/gpu.ts` (neu, enthält `startGpu`, `stopGpu`, `gpuState`, `checkGpuBudget`), `functions/api/gpu.ts` (nutzt `src/gpu.ts`) | W-3 (GPU-Endpunkt), W-1 (Push) | 1,20 $ (3 Aufrufe) | Budget auf $0.50 setzen, `gpu:state.cost.month` manuell auf $0.49 setzen, Cron-Check simulieren → GPU stoppt, Push „GPU gestoppt – Budget erreicht", `GET /api/gpu` → `state


---

# Hub (apps/hub inkl. costs-ui, Tresor, Einstellungen, rote Punkte)

## Ist-Zustand ehrlich

### Funktioniert

**Grundstruktur (app.js, index.html)**
- Tab-Navigation mit lazy loading: Chat lädt sofort, andere Apps erst beim Öffnen (v63). Wächter-CSS wird erst bei Bedarf nachgeladen.
- Hash-Routing (`#chat`, `#waechter` etc.) funktioniert, `switchTab()` lädt Module dynamisch.
- Toast-Nachrichten, Haptic-Feedback, Install-Banner (iOS + Android) funktionieren.
- Service Worker (sw.js) mit Cache-First-Fallback nach 2,5 s (v63), Push-Unterstützung für Bot-Mitteilungen.
- Rote Neuigkeiten-Punkte (v66): `markNews(tab)` setzt einen Punkt an den Tab, `clearNews(tab)` löscht ihn beim Öffnen. Push-Events und Chat-Ereignisse markieren Tabs. State in `localStorage.jeffa.news.v1` + Cache `jeffa-news`. **Funktioniert ohne Polling.**

**Tresor (tresor.js)**
- Admin-Check beim Laden, Entsperr-Aufforderung wenn nicht Admin.
- API-Schlüssel-Liste (gemini, openrouter, venice, hf, xai, vnaipro, groq, mistral, runware): zeigt Quelle (Vault/Env/none), enabled/disabled, last4.
- Hinzufügen/Ändern/Löschen von Vault-Keys (`/api/vault/keys/:provider` PUT/DELETE). Anzeigen mit Re-Auth (`/api/vault/reveal` POST) öffnet Modal mit Schlüssel (30 s Timeout, kopierbar).
- Passkey-Registrierung (`registerWebAuthn()`), PIN-Setup (`setupPin()`), Anzeige wie viele Passkeys registriert.
- App-Zugänge (Tokens): Liste mit Label/Rolle/Erstelldatum, Widerrufen (`/api/auth/tokens/:id` DELETE), Erstellen (`/api/auth/tokens` POST) zeigt Token einmalig im Modal.
- Konzepte (📄 Docs): lädt `/api/docs`, rendert Titel + Datum, Klick lädt `/api/docs/:slug` und rendert Markdown mit `mdToHtml()` (escaped, Links, Tabellen, Listen). **D1-API funktioniert (functions/api/docs/[[route]].ts).**
- Abmelden-Button ruft `logout()` auf.

**Einstellungen (settings.js)**
- FSK18-Toggle (localStorage + `setAdult()`), wirkt sofort.
- Chat-Modell-Auswahl: zeigt aktuelles Standard-Modell (`getDefaultModel()`), `pickModel()`-Modal öffnet sich, speichert in `localStorage.jeffa.model`.
- KI-Weg-Editor: `renderRouteEditor()` für FSK18 + Normal, Drag&Drop ↑/↓, An/Aus-Schalter pro Anbieter. Speichert in `localStorage.jeffa.routes.adult` / `.normal`. **Funktioniert (shared/models.js).**
- Bildstil-Dropdown (real/comic/manhwa/comicpage), Bildqualität (single/mix/lustify/hq/refine/refine-firered/krea), Bildhäufigkeit (off/request/every/3/5). Speichert in `localStorage.jeffa.imageOpt`.
- Verschlüsselung-Toggle, Helles Design, KI-Werkzeuge (auto/on/off), Gedächtnis-Toggle – alles in `localStorage.jeffa.settings`.
- Gedächtnis-Sektion: lädt `/api/memory?all=1`, zeigt gruppiert (Über dich/Profile), Hinzufügen/Bearbeiten/Löschen (`/api/memory` POST/PUT/DELETE). Re-Auth wenn 401. **API existiert (functions/api/memory.ts).**
- Grok Bot: Gemini-Vorprüfung-Toggle (`localStorage.jeffa.botTriage`), Push-Aktivierung (`/api/push/key`, `/api/push/subscribe`), Test-Push (`/api/push/test`). Bot-Admin-Button lädt `bot.js` `renderBotAdmin()`. **Push-API existiert (functions/api/push/).**
- Face ID/PIN-Setup: Buttons rufen `registerWebAuthn()`, `setupPin()`. Face ID standardmäßig AUS (`settings.faceId === true` aktiviert Angebot beim Entsperren).
- Sitzung: 90 Tage gleitend (v57), Abmelden löscht Token.
- Version-Anzeige: fetch `/sw.js` ohne Cache, vergleicht `jeffa-v\d+` in SW mit `window.__JEFFA_V`. Zeigt Warnung wenn Server neuere Version hat.

**Kosten-UI (costs-ui.js, functions/api/costs.ts, src/costs.js)**
- `/api/costs` GET: lädt Kosten heute/Monat, Prognose (linear extrapoliert), Budget-Optionen (5/10/20/30/50/100 $), Ampel-Status (🟢/🟡/🔴/⛔), Provider-Aufschlüsselung (Venice, OpenRouter, VNAIPro, Gemini, xAI, Groq, Mistral, Runware, GPU-Server).
- Tabelle mit Heute/Monat pro Anbieter (wenn Daten vorhanden).
- Budget-Dropdown: `/api/costs` POST speichert in `KV costs:budget`, erfordert Admin. **Funktioniert.**
- GPU-Server-Bereich: Anbieter-Dropdown (Modal/RunPod/AWS), Status (läuft/aus/nicht eingerichtet), Start/Stopp-Buttons rufen `/api/gpu` POST mit `{action:'start'|'stop', provider}`. Start prüft Budget (`budgetAllowsGpu()`), bei 100 % Budget 402-Fehler. Bei 503 "nicht eingerichtet". **Routing existiert (functions/api/gpu.ts), aber nur Gerüst – keine echten Provider-Aufrufe.**
- Kosten-Erfassung: `trackUsage()` (src/usage.ts) schreibt in D1 `usage_daily` (day, provider, model, prompt_tokens, output_tokens, requests, cost_usd). Wird in Chat-/Bild-Funktionen aufgerufen. **Funktioniert – 134/134 Tests grün.**

### Nur Gerüst

**GPU-Server (functions/api/gpu.ts)**
- POST `/api/gpu` prüft Admin, parst `{action, provider}`, prüft Budget (`budgetAllowsGpu()`), gibt 402 bei 100 % Budget, 503 wenn Provider nicht konfiguriert.
- Liest/schreibt `KV gpu:state` (on/off, lastActivity).
- **Keine echte Integration:** Modal/RunPod/AWS-Aufrufe fehlen. Schalter in UI zeigt "nicht eingerichtet". Kein Server wird wirklich gestartet/gestoppt. Auto-Aus-Logik (`gpuIdleShouldStop()`) existiert in src/costs.js, aber kein Cron ruft sie auf.

**Ersatzanbieter (Groq, Mistral, Runware)**
- Adapter in `src/ai/` (groq.ts, mistral.ts) und `src/imgsvc-core/providers/` (runware.ts) existieren. Tests grün (adapter before openRouter, no gateway).
- **Noch nicht aktiv:** Nur Adapter-Code, kein Key im Vault. Routes in `shared/models.js` enthalten noch nicht groq/mistral. Chat/Bild-Funktionen nutzen sie nicht.

**Modellwahl-Inkonsistenzen**
- Bildqualität-Dropdown in Einstellungen (`#s-imgq`): Optionen wie "Lustify v8", "Hohe Qualität" mit Beschreibungen, die teils FSK18-spezifisch sind (lustify = FSK18, qwen-image-3 = Standard). **Aber**: `src/imgsvc-core/image-handler.ts` Zeile ~180: `const lustify = !safeMode && !comicStyle && !body.model;` (Lustify = FSK18 + kein Spar + kein Comic). Spar-Mix (v46/v54) in FSK18 wird automatisch zu chroma (single). **Widerspruch:** Dropdown lässt "Mix" in FSK18 wählen, Server ignoriert es und macht chroma.
- Einstellungen Dropdown-Werte (`single`, `mix`, `lustify`, `hq`, `refine`, `refine-firered`, `krea`) werden in `localStorage.jeffa.imageOpt.imageQuality` gespeichert, aber Mapping zu tatsächlichen Modellen ist unklar. `image-handler.ts` prüft `body.model` (Model-Override vom Profil), `safeMode`, `comicStyle`, entscheidet dann chroma/z-image/lustify. **Dropdown-Optionen sind Marketing-Labels, keine direkten Model-IDs.**

**Negativ-Prompts (Doppel-Pfad)**
- Zwei Prompt-Systeme: (1) Client `chat.js` baut Bild-Prompts (Legacy, nur bei aktivem Schalter), (2) Server `src/imgsvc-core/prompt-builder.ts` (neuer Weg, Szenen-Schreiber, Outfit-Regeln). Negativ-Prompts werden in `prompt-builder.ts` mit `buildNegative()` gebaut (Hard-Coded "CGI, 3D render, …" + Youth-Terms). Client-Pfad hat eigene Negatives in `chat.js`. **Gefahr:** Beide Wege können gleichzeitig aktiv sein (wenn `/api/image?compose=1` vom Client gerufen wird), dann überschreiben sich Negative oder werden doppelt angewendet.

### Kaputt

**GPU-Schalter: /api/gpu 404 live**
- Live-URL `jeffa-hub.pages.dev/api/gpu` liefert 404 "Unbekannter API-Endpunkt". Datei `functions/api/gpu.ts` existiert. **Ursache:** Cloudflare Pages Functions erkennt nur `[[route]].ts` oder Named-Params-Pfade. `functions/api/gpu.ts` muss entweder `functions/api/gpu/index.ts` oder `functions/api/gpu.ts` mit `export const onRequestPost` heißen. **Vermutlich:** Datei heißt korrekt, aber Build/Deploy liest sie nicht – prüfen: `build.mjs` kopiert nur `apps/hub/` nach `dist/hub/`, aber nicht `functions/` einzeln. Functions werden direkt aus `functions/` gelesen, nicht aus dist. **Lösung:** `functions/api/gpu.ts` nach `functions/api/gpu/index.ts` umbenennen ODER prüfen ob `wrangler.toml` routing-Regeln hat. **Tests zeigen:** `gpu start goes through budgetAllowsGpu, image costs logged` (Zeile 134), also Server-Code funktioniert in Tests. Live-Routing ist kaputt.

**Szenen-Schreiber fügt Personen hinzu (Christians Beschwerde)**
- LLM (Szenen-Schreiber, `src/ai/providers/` venice/gemini) bekommt Chat-Historie + System-Prompt "Beschreibe die Szene für ein realistisches Foto, nur {persona.name}, keine zusätzlichen Personen". **Aber:** LLM halluziniert manchmal "eine Freundin", "ein Mann im Hintergrund" etc. **Ursache:** System-Prompt zu schwach, LLM ignoriert "keine zusätzlichen Personen". **Tests:** `v38 useScene drops dropdown outfit when the chat names clothes` (Zeile 59) testet nur Outfit, nicht Personen-Anzahl. Kein Test für "nur eine Person im Bild".

**Outfit-Zustände (nasses Shirt) nicht umgesetzt**
- Prompt-Builder `src/imgsvc-core/prompt-builder.ts` Zeile ~300: `buildOutfit()` fügt Outfit-Text am Anfang ein (v60). Zustand wie "nass" ist in `profile.photo.outfit` als Freitext. **Problem:** Modelle (chroma, lustify, z-image) gewichten kurze Begriffe am Anfang nicht stark. "nasses weißes Shirt" wird zu "white shirt" ohne nass. **Laut v59:** Outfit-Zustand gewichtet + sichtbar. **Aber:** Keine Emphasis-Syntax `(wet:1.3)` im Prompt-Builder. Tests: `v60 outfit first, plain` (Zeile 42) prüft nur Position, nicht Gewichtung.

**Modellwahl "Hohe Qualität" unklar (Dropdown vs. Server-Logik)**
- Einstellungen-Dropdown `#s-imgq` Option "Hohe Qualität – Standard: qwen-image-3 (≈ 0,04 $) · FSK18: lustify v8 mit 50 Schritten (≈ 0,01 $)". Gespeichert als `imageQuality: 'hq'`. **Aber:** `image-handler.ts` kennt nur `body.model` (String, z.B. "z-image", "chroma", "lustify"), kein `imageQuality` Feld. **Widerspruch:** Dropdown-Wert wird nie an Server gesendet. `/api/image` Body hat `model?: string`, aber kein `quality`. **Client chat.js** Zeile ~500 (geschätzt, Datei nicht vollständig im Context): baut Body mit `model` aus Profil, aber nicht aus `imageQuality`-Setting. **Fazit:** Bildqualität-Dropdown ist nur Deko, Server-Auswahl läuft über Profil-Model-Override oder Standard-Logik (FSK18 → chroma, sonst z-image).

### Nicht eingerichtet / 503

Siehe Ausbau-Konzept oben. Groq/Mistral/Runware ohne Keys, GPU ohne echte Server, Video 503, Kollab/Subscriptions 503 ohne Bindings.

---

## Nutzerziele (Christian)

1. **Kosten transparent sehen und begrenzen:** Wie viel kostet mich ein Bild/Chat heute, im Monat? Automatische Sperre bei Budget-Überschreitung. Kein "böse Überraschung" in der Rechnung.
2. **Einfache Modellwahl ohne Technik-Wissen:** "Hohe Qualität" statt "qwen-image-3 vs. z-image 768 steps". Dropdown-Labels wie "Spar-Mix" oder "Premium + Nachschliff" sind verständlich. **Aber:** Was hinter dem Label passiert, muss eindeutig sein (kein Marketing-Placebo).
3. **API-Schlüssel sicher verwalten:** Face ID/PIN für Admin-Zugriff, Schlüssel im Vault statt localStorage. Anzeigen nur mit Re-Auth.
4. **GPU-Server nur bei Bedarf:** Start/Stopp per Knopf, automatisch aus nach 30 Min, Budget-Sperre. Kein Geld verbrennen wenn vergessen auszuschalten.
5. **Neuigkeiten sehen ohne F5:** Rote Punkte an Tabs wenn Bot antwortet oder Push kommt. Kein Polling (spart Akku/Traffic).
6. **Schneller Chat-Start:** App muss in < 2 s nutzbar sein (nicht 10 s warten bis alle Module geladen). Andere Tabs nur bei Bedbedarf.
7. **Konzepte/Docs nachschlagen:** Ausbau-Plan, D1-API-Doku etc. im Tresor, ohne GitHub zu öffnen.

---

## Ziel-Funktionen mit Priorität

| Funktion | Prio | Begründung |
|----------|------|------------|
| **Kosten-Anzeige live + Budget-Ampel** | Must | Kern-Anforderung. Ohne Kostenkontrolle keine echte Nutzung. Ist zu 90 % fertig, aber Prognose-Formel muss korrekt sein (aktuell linear, sollte Wochenenden/Peaks berücksichtigen). |
| **GPU-Schalter funktional (Start/Stopp/Auto-Aus)** | Must | Christians Haupt-Wunsch (eigener Server). Ohne echte Integration ist Schalter nur Deko. Braucht Modal/RunPod-Adapter + Cron für Auto-Aus. |
| **Modellwahl-Logik eindeutig** | Must | Aktuell: Dropdown-Labels passen nicht zur Server-Logik. User wählt "Lustify v8", bekommt aber chroma (weil Spar-Mix in FSK18 → chroma). **Muss:** Dropdown-Wert direkt an Server, Server wählt Modell nach Tabelle. |
| **Szenen-Schreiber: nur eine Person** | Must | Christians Haupt-Beschwerde. System-Prompt + Post-Processing: LLM-Output nach "zwei Personen", "eine Frau", "ein Mann" scannen, bei Detektion neu generieren oder manuelle Korrektur erzwingen. |
| **Outfit-Zustand (nass/zerrissen/…) gewichtet** | Must | Prompt-Builder muss Emphasis-Syntax nutzen: `(wet white shirt:1.3)` statt plain. Oder Zustand als separaten Prompt-Teil mit höherem CFG. |
| **Ersatzanbieter aktiv (Groq/Mistral/Runware)** | Should | Venice hat Credit-Limits. Fallback verhindert "503 – probier später". Adapter existieren, nur Keys + Routing fehlen. |
| **Tresor: Konzepte editierbar** | Should | Aktuell read-only. PUT `/api/docs/:slug` existiert (functions/api/docs), aber keine UI (kein Editor-Button). Für Christian: Ausbau-Konzept im Browser korrigieren ohne GitHub. |
| **Negativ-Prompts vereinheitlicht** | Should | Zwei Pfade (Client chat.js + Server prompt-builder) sind Fehlerquelle. **Ziel:** Nur Server-Pfad, Client sendet nur Szene/Outfit, Server baut kompletten Prompt inkl. Negatives. |
| **Push-Mitteilungen: mehr Events** | Later | Aktuell nur Bot-Antworten. Christian will: "Bild fertig", "Chat-Antwort von Seraphina", "Backup erfolgreich". Braucht Event-System (jeffa:news erweitern). |
| **Rote Punkte: Zähler statt nur Punkt** | Later | Aktuell: Punkt = "etwas Neues". Christian will: "3 neue Nachrichten". State muss Zahl statt Boolean speichern. |
| **Budget: wöchentliche/monatliche Limits separat** | Later | Aktuell nur Monats-Budget. Christian: "Max 5 $ pro Tag, max 50 $ pro Monat". Braucht zweite Prüfung in `budgetAllowsGpu()`. |
| **Kosten-Export (CSV/Excel)** | Later | Für Steuern/Abrechnung. `/api/costs?export=csv` lädt `usage_daily` als CSV. |

---

## UX-Ablauf mit Dropdowns

### 4.1 Kosten anzeigen (Einstellungen → 🚦 Kosten & Budget)

1. User öffnet ⚙️ Einstellungen.
2. Scrollt zu "🚦 Kosten & Budget".
3. Klick auf **"Kosten anzeigen"** (Button, nicht automatisch geladen – spart API-Aufruf).
4. `costs-ui.js` lädt `/api/costs` (GET, auth: true).
5. Anzeige:
   - **Ampel-Zeile:** `🟢 Heute 0,23 $ · Monat 4,87 $ · Prognose 14,61 $ von 20 $`
   - **Tabelle pro Anbieter:** Venice | Heute 0,15 $ | Monat 3,12 $ usw.
   - **Budget-Dropdown:** 5 $ | 10 $ | 20 $ (Standard) | 30 $ | 50 $ | 100 $. Bei Änderung: Admin-Check (Face ID/PIN), POST `/api/costs` `{budget: 30}`, Anzeige aktualisiert.
   - **GPU-Server-Bereich:** Dropdown "Anbieter: Modal (Haupt) | RunPod (Backup) | AWS (optional)". Status "aus / läuft / nicht eingerichtet". Buttons **Start** / **Stopp**. Bei 100 % Budget: Start disabled, Hinweis "Monats-Budget erreicht". Auto-Aus-Hinweis: "Schaltet sich nach 30 Min ohne Nutzung automatisch aus."
6. **Start-Klick:**
   - Prüft Admin (Face ID/PIN falls nötig).
   - POST `/api/gpu` `{action:'start', provider:'modal'}`.
   - Server prüft Budget (`budgetAllowsGpu()`), bei 100 % → 402 "⛔ Monats-Budget erreicht – GPU-Server gesperrt".
   - Bei 503 → "⚠️ Noch nicht eingerichtet" (Key fehlt, Server nicht konfiguriert).
   - Bei 200 → "✅ Server gestartet" (Status: läuft).
7. **Stopp-Klick:** POST `/api/gpu` `{action:'stop'}`, Status → aus.
8. **Auto-Aus:** Cron (jede Minute) prüft `KV gpu:state.lastActivity`, wenn > 30 Min → Server stoppen, KV `on: false`.

**Fehlende Elemente:**
- Budget-Dropdown aktualisiert Prognose/Ampel nicht sofort (muss `renderCosts()` neu aufrufen).
- GPU-Server-Status-Polling: User sieht "startet…" nicht, nur "läuft" nach Reload. **Lösung:** `setInterval()` alle 10 s `/api/gpu` GET für Status, zeigt "startet (2/5 Min)" mit Fortschritts-Bar.

### 4.2 Modellwahl (Einstellungen → 🤖 Chat-Modell / Bildqualität)

**Chat-Modell (Standard für neue Chats):**
1. User öffnet ⚙️ Einstellungen, sieht unter "🤖 Chat-Modell" aktuelles Modell: "**venice-gpt-4-128k** · Billig, zensiert (0,20 $/M Token)".
2. Klick öffnet `pickModel()`-Modal (shared/models.js): Liste aller Modelle (Venice, OpenRouter, Gemini, xAI, …), gruppiert, mit Label/Beschreibung/Kosten. Standard-Auswahl markiert.
3. User wählt "xAI Grok-3 Realism · Unzensiert, teuer (6 $/M Token)".
4. Modal schließt, speichert in `localStorage.jeffa.model: 'xai-grok-3-realism'`, Button-Text aktualisiert.
5. Nächster neuer Chat nutzt dieses Modell. Bestehende Chats behalten ihr Modell (gespeichert in `conversation.model`).

**Bildqualität (Einstellungen → 🖼 Bildstil):**
1. User scrollt zu "🖼 Bildstil".
2. **Dropdown "Bildstil":** Realistisch (Foto) | Comic-Stil (ohne Text) | Manhwa (ohne Text) | Comic-Seite mit spanischen Sprechblasen 🇪🇸. **Standard:** Realistisch. Speichert in `localStorage.jeffa.imageOpt.imageStyle: 'real'`.
3. **Dropdown "Bildqualität":** (aktuell 7 Optionen, siehe settings.js). **Problem:** Labels wie "Spar-Mix" vs. "Hohe Qualität" sind unklar. **Neu:**

| Label | Wert (ID) | Server-Modell | Kosten | Schritte | FSK18-Spezial |
|-------|-----------|---------------|--------|----------|---------------|
| Standard | `standard` | z-image-3 (norm) / chroma (FSK18) | ~0,01 $ | 25 | chroma immer |
| Spar-Mix (langsam) | `mix` | Hintergrund + Person getrennt | ~0,03 $ | 2×25 | → Standard (chroma) |
| Hohe Qualität | `hq` | qwen-image-3 (norm) / lustify-v8-50 (FSK18) | ~0,04 $ | 50 | lustify 50 steps |
| Premium + Nachschliff | `refine` | Standard + qwen-edit | ~0,06 $ | 25+edit | chroma + qwen-edit-uncensored |
| Premium FireRed | `refine-firered` | Standard + firered-edit | ~0,05 $ | 25+edit | beide Modi |
| Ultra (Krea) | `krea` | krea-v2-large | ~0,07 $ | – | → Standard (chroma) |
| 🔞 Lustify explizit | `lustify` | lustify-v8-30 | ~0,01 $ | 30 | nur FSK18 |

- FSK18-Modi (lustify, Premium Nachschliff chroma+edit) nur sichtbar wenn FSK18 an.
- User wählt "Hohe Qualität", speichert `imageQuality: 'hq'`.
- **Client-Code (chat.js Bild-Request):** Body `{…, quality: 'hq', safeMode: !isAdult()}`. Server (`image-handler.ts`) mappt `quality` zu Modell:
  ```ts
  const quality = body.quality || 'standard';
  const qualityMap = {
    standard: safeMode ? 'z-image' : 'chroma',
    mix: safeMode ? 'mix' : 'chroma', // mix nur Standard
    hq: safeMode ? 'qwen-image-3' : 'lustify',
    refine: safeMode ? 'z-image+qwen-edit' : 'chroma+qwen-edit-uncensored',
    // …
  };
  const model = body.model || qualityMap[quality] || (safeMode ? 'z-image' : 'chroma');
  ```
- **Vorteil:** Dropdown-Wert = Server-Wert, keine Inkonsistenzen.

4. **Dropdown "Wie oft Bilder?":** Aus | Nur auf Anfrage (Standard) | Jede Antwort | Etwa jede 3. | Etwa jede 5. Speichert in `imageFreq`.
5. Änderungen wirken sofort (nächste Antwort).

### 4.3 API-Schlüssel ändern (Tresor)

1. User öffnet 🔐 Tresor-Tab.
2. Admin-Check: Wenn nicht Admin → Button "Entsperren" (Face ID/PIN).
3. Sektion "API-Schlüssel" zeigt Liste: Gemini | Env Secret · ···sk-abc | OpenRouter | Vault (aktiv) · ···xyz | Venice | Nicht konfiguriert.
4. User klickt **"Ändern"** bei Venice.
5. Browser-Prompt: "API-Schlüssel für Venice:" (Textfeld, leer).
6. User fügt neuen Key ein (z.B. von Venice-Dashboard kopiert), klickt OK.
7. PUT `/api/vault/keys/venice` `{value: '…', enabled: true}`.
8. Liste aktualisiert: "Venice | Vault (aktiv) · ···xyz".
9. Klick auf **"Anzeigen"** (nur wenn Key existiert):
   - Re-Auth (Face ID/PIN, auch wenn schon Admin – extra Sicherheit).
   - POST `/api/vault/reveal` `{provider: 'venice'}`.
   - Modal öffnet mit vollem Key (monospace, readonly Input), Button "Kopieren", Button "Schließen".
   - Modal schließt automatisch nach 30 s.

**Fehlende Elemente:**
- Vault-Key-Aktivierung/Deaktivierung: aktuell nur enabled: true beim Speichern. Kein Toggle-Schalter "Key temporär deaktivieren ohne zu löschen". **Later-Feature.**

### 4.4 Rote Neuigkeiten-Punkte

1. **Push-Mitteilung kommt (Bot antwortet):**
   - Service Worker (`sw.js`) empfängt Push-Payload `{title: 'Neue Antwort von Grok Bot', tab: 'bot'}`.
   - SW sucht offene Fenster (`clients.matchAll()`), sendet `postMessage({type:'news', tab:'bot'})`.
   - Offenes Fenster (`app.js` Event-Listener `navigator.serviceWorker.addEventListener('message', …)`): ruft `markNews('bot')` → localStorage `jeffa.news.v1: {bot: 1735567890123}`, CSS-Klasse `.tab-btn[data-tab="bot"].has-news` zeigt roten Punkt (8 px Kreis, position absolute rechts oben).
   - Kein offenes Fenster? SW schreibt `caches.open('jeffa-news').put('/__news/bot', …)` → beim nächsten Start liest `app.js` Cache, markiert Tab.
2. **User öffnet Bot-Tab:**
   - `switchTab('bot')` ruft `clearNews('bot')` → löscht localStorage-Eintrag, CSS-Klasse weg, roter Punkt verschwindet.
3. **Chat-Ereignis (neue Nachricht von Seraphina):**
   - `chat.js` nach erfolgreichem Empfang: `window.dispatchEvent(new CustomEvent('jeffa:news', {detail: {tab:'chat'}}))`.
   - `app.js` hört Event, ruft `markNews('chat')` → roter Punkt an Chat-Tab (wenn User in anderem Tab ist).

**Fehlende Elemente:**
- Zähler statt nur Punkt: `jeffa.news.v1: {bot: {count: 3, last: 1735567890123}}`. Tabs zeigen Badge mit Zahl. **Later-Feature (Prio Later).**

---

## Architektur / Daten / API-Änderungen

### 5.1 Dateien

| Datei | Änderung | Grund |
|-------|----------|-------|
| **apps/hub/costs-ui.js** | + GPU-Status-Polling (`setInterval` `/api/gpu` GET alle 10 s), + Prognose-Korrektur-Hinweis, + Budget-Change aktualisiert Anzeige sofort | User sieht Server-Start live, Prognose realistischer |
| **functions/api/costs.ts** | + GET liefert `gpu.state.startingProgress` (0–100 %), `gpu.providers[].status` (available/starting/running/stopped/error) | Status-Polling-Daten |
| **functions/api/gpu.ts** | Umbenennen zu `functions/api/gpu/index.ts` (falls Routing-Problem), + echte Modal/RunPod/AWS-Adapter (`src/gpu/modal.ts`, `src/gpu/runpod.ts`, `src/gpu/aws.ts`), + Auto-Aus Cron (`scheduled` Handler), + KV `gpu:state.lastActivity` Update bei jedem Bild-/Chat-Request | GPU-Schalter funktional |
| **apps/hub/settings.js** | Bildqualität-Dropdown: neue Tabelle (siehe 4.2), + `quality`-Wert in Body, + FSK18-Filter für Optionen, + Hinweis "wirkt ab nächstem Bild" | Modellwahl eindeutig |
| **src/imgsvc-core/image-handler.ts** | + `body.quality` Feld (string), + `qualityMap` (quality → model), + Emphasis-Syntax für Outfit-Zustand `(wet:1.3)`, + Personen-Detektion im Szenen-Output (Regex `/(two|another|second) (person|woman|man|figure)/i`), bei Match → Fehler "Szene enthält mehrere Personen, bitte korrigieren" oder Auto-Retry (max 2×) | Outfit-Zustand gewichtet, nur eine Person |
| **src/imgsvc-core/prompt-builder.ts** | + `buildOutfit()` Emphasis: `(${state}:1.3) ${item}`, + `sanitizeScene()` entfernt Personen-Duplikate ("she and her friend" → "she"), + Negatives nur hier (nicht in Client) | Outfit-Zustand, Personen-Filter, Negatives zentralisiert |
| **apps/hub/chat.js** | – Negativ-Prompts-Code entfernen (nur Server baut Prompt), + `body.quality` aus `localStorage.jeffa.imageOpt.imageQuality` | Client schlanker, Server-Pfad einheitlich |
| **src/ai/providers/venice.ts, gemini.ts** | System-Prompt erweitert: "WICHTIG: Nur {persona.name} im Bild. Keine weiteren Personen, keine Freunde, keine Passanten. Falls die Szene andere Personen erfordert, beschreibe sie außerhalb des Bildrahmens (z. B. 'hört jemanden rufen')." + "Zustand/Kleidung wörtlich übernehmen: {outfit}." | Szenen-Schreiber Personen-/Outfit-Treue |
| **apps/hub/tresor.js** | + Edit-Button bei Konzepten (öffnet Textarea mit Markdown-Editor, Speichern PUT `/api/docs/:slug`), + Syntax-Highlighting (optional, z. B. CodeMirror light) | Konzepte editierbar |
| **functions/api/docs/[[route]].ts** | PUT prüft Body `{title, body_md}`, Längen-Limit 200 kB, SQL `ON CONFLICT UPDATE`, + Rate-Limit (10 Req/Min pro IP) | Edit-Schutz |
| **src/gpu/modal.ts** (neu) | Modal API-Wrapper: `start(env)` → POST `https://api.modal.com/v1/apps/{app}/start`, Poll Status bis running, return `{url, status}`. `stop(env)` → POST stop. `status(env)` → GET. Secrets: `env.MODAL_TOKEN`, `env.MODAL_APP_ID`. | Modal-Integration |
| **src/gpu/runpod.ts** (neu) | RunPod Serverless API: `start(env)` → POST `https://api.runpod.io/v2/{endpoint}/run`, Poll Job-Status. Secrets: `env.RUNPOD_API_KEY`, `env.RUNPOD_ENDPOINT_ID`. | RunPod-Backup |
| **src/gpu/aws.ts** (neu) | AWS EC2 Start/Stop: SDK `@aws-sdk/client-ec2`, `StartInstancesCommand`, `DescribeInstancesCommand`. Secrets: `env.AWS_ACCESS_KEY_ID`, `env.AWS_SECRET_ACCESS_KEY`, `env.AWS_INSTANCE_ID`. | AWS optional |
| **src/costs.js** | + `gpuCostPerHour(provider)` (Modal: $0.80, RunPod: $0.34, AWS: $1.01), + `accumulateGpuCost(state, nowMs)` (rechnet seit lastActivity), + `budgetAllowsGpu()` prüft auch Tages-Budget (Later) | Kosten-Tracking |
| **apps/hub/sw.js** | + Push-Payload `tab`-Feld (Bot, Chat, Waechter, …), + Cache `jeffa-news` für offline-Start-Marker | Neuigkeiten-Routing |
| **shared/models.js** | + Groq/Mistral in `PROVIDERS` (Groq: groq-gpt-oss-120b, Mistral: mistral-free), + Routes adult/normal default: `[venice, modal, groq, mistral, openrouter]` bzw. `[venice, modal, openrouter]` | Ersatzanbieter aktiv |

### 5.2 D1-Tabellen (bestehend, keine Änderung nötig)

- `usage_daily` (day, provider, model, prompt_tokens, output_tokens, requests, cost_usd): Kosten-Tracking, funktioniert.
- `budget_spend` (day_ip, spent): Tages-Budget pro IP, funktioniert (src/budget.ts).
- `docs` (slug PK, title, body_md, updated_at): Konzepte, funktioniert. Braucht Index auf `updated_at` (später, für Performance).

### 5.3 KV-Schlüssel (bestehend + neu)

| Schlüssel | Wert | Zweck |
|-----------|------|-------|
| `costs:budget` | `"20"` (string) | Monats-Budget in $ |
| `gpu:state` | `{"provider":"modal","on":true,"lastActivity":1735567890123,"startedAt":1735567800000}` | GPU-Server-Status |
| `gpu:modal:endpoint` | `"https://jeffa-modal-abcd1234.modal.run"` | Modal-Endpoint-URL (nach Start) |
| `gpu:runpod:job` | `"xyz-123"` | RunPod Job-ID (für Status-Abfrage) |
| `backup:last` | `"2026-10-30T12:00:00Z"` | Letzte Backup-Zeit (v67, für Wächter) |

### 5.4 Neue API-Endpunkte

**GET `/api/gpu`** (neu, für Status-Polling):
- Auth: read (Face ID/PIN)
- Response: `{provider, status: 'stopped'|'starting'|'running'|'error', progress: 0-100, costToday, costMonth, url?}`
- Liest KV `gpu:state`, rechnet Kosten seit Start.

**Scheduled Handler `/api/gpu` (Cron):**
- Läuft jede Minute (Cloudflare Cron Trigger in `wrangler.toml`: `crons = ["* * * * *"]`).
- Prüft `gpu:state.on && gpuIdleShouldStop(lastActivity, now, 30)` → `stop()` API-Call, KV `on: false`.

---

## Anbieter-Strategie (Kostenerfassung, Admin-Freigaben)

### 6.1 Kostenerfassung

**Pro API-Aufruf:**
1. Request kommt (Chat `/api/chat`, Bild `/api/image`).
2. Anbieter antwortet (Venice, Modal, Groq, …).
3. Response enthält Usage-Daten (prompt_tokens, completion_tokens) oder Kosten (z. B. Venice `X-Credits-Used`).
4. Server berechnet Kosten (Token × Preis/M oder direkt aus Header).
5. `trackUsage(env, provider, model, promptTokens, outputTokens, costUsd)` schreibt in D1 `usage_daily` (grouped by day, provider, model). Bei Insert-Conflict: `cost_usd = cost_usd + excluded.cost_usd` (akkumulierend).
6. KV-Fallback (wenn D1 down): `KV.put('usage:' + day + ':' + provider, JSON.stringify({…}), {expirationTtl: 7*86400})`.

**Kosten-Tabelle (USD, Stand 30.10.2026):**

| Anbieter | Modell | Input | Output | Bild | Bemerkung |
|----------|--------|-------|--------|------|-----------|
| Venice | gpt-4-128k | 0,20 $/M | 0,60 $/M | – | Credit-basiert, 1 Credit ≈ 0,0001 $ (geschätzt) |
| Venice | image (chroma/z-image) | – | – | ~0,01 $ | 100 Credits ≈ 0,01 $ |
| OpenRouter | Free models | 0 | 0 | – | 50 Req/Tag Limit |
| VNAIPro | Claude Opus | ~15 $/M | ~75 $/M | – | Erfahrungswert 0,35–0,45 $ pro Aufruf (25k in + 8k out) |
| Gemini | Flash-8B-Lite | 0 | 0 | – | Gratis, Rate-Limit 15 Req/Min |
| xAI | Grok-3 | 2 $/M | 6 $/M | – | Teuer, unzensiert |
| Groq | gpt-oss-120b | 0 | 0 | – | Gratis, 1.000 Req/Tag |
| Mistral | mistral-large-lite | 0 | 0 | – | Gratis, kleines Monatskontingent |
| Runware | Flux/SDXL | – | – | ~0,005 $ | 2 $ Startguthaben |
| Modal | L4 GPU | – | – | ~0,80 $/h | 30 $ Gratis-Guthaben/Monat |
| RunPod | RTX 4090 Secure | – | – | ~0,89 $/h | Prepaid, sekundengenau |
| AWS | g6.xlarge (L4) | – | – | ~1,01 $/h | Startguthaben, aber GPU-Kontingent-Antrag nötig |

**Token-Preise ermitteln:**
- Venice: `response.headers['x-credits-used']` × 0,0001 (geschätzt, kein offizieller Preis).
- OpenRouter: `response.usage.prompt_tokens × model.pricing.prompt + completion_tokens × model.pricing.completion` (Preise in `/api/models`).
- VNAIPro: Pauschal 0,40 $ pro Request (Erfahrungswert, kein offizieller API).
- Gemini: 0 (gratis, bis Rate-Limit).
- Groq/Mistral: 0 (gratis).
- Runware: Pauschal 0,005 $ pro Bild.
- GPU: Stunden × $/h (seit Start, akkumuliert in KV `gpu:state.accumulatedCost`, bei Stopp in D1 geschrieben).

### 6.2 Admin-Freigaben

**Wer darf was:**

| Aktion | Rolle | Auth-Methode |
|--------|-------|--------------|
| Kosten anzeigen | read | Face ID/PIN/Token (localStorage jeffa.session) |
| Budget ändern | admin | Re-Auth (Face ID/PIN, auch wenn schon eingeloggt) |
| GPU starten/stoppen | admin | Re-Auth |
| API-Schlüssel anzeigen | admin | Re-Auth (extra prompt) |
| API-Schlüssel ändern/löschen | admin | Re-Auth |
| Konzepte lesen | admin | Face ID/PIN |
| Konzepte bearbeiten | admin | Face ID/PIN (kein Extra-Re-Auth, weil nur Docs nicht Secrets) |
| Token erstellen/widerrufen | admin | Face ID/PIN |

**Face ID standardmäßig AUS (v67):**
- `localStorage.jeffa.settings.faceId: true` → beim Entsperren wird Face ID angeboten. Sonst nur PIN.
- Grund: iPhone Face ID ist teils störend (Christian will schnell PIN tippen, nicht Gerät ans Gesicht halten).

**Sitzung:**
- Token in `localStorage.jeffa.session` (JWT mit `sub: admin|read`, `exp: 90d gleitend`).
- Jede Nutzung verlängert `exp` um 90 Tage (Cookie-Refresh, Server schreibt neuen Token in Response-Header `X-Session-Refresh`).
- Abmelden: `POST /api/auth/logout` → Server invalidiert Token (D1 `revoked_tokens`), Client löscht localStorage.

### 6.3 Kostenschätzung

**Szenarien:**

| Nutzung | Venice | Modal GPU | Groq | VNAIPro | Summe/Monat |
|---------|--------|-----------|------|---------|-------------|
| **Wenig (10 Chat/Tag, 2 Bilder/Tag)** | Chat 3 $ + Bilder 0,60 $ | – | 0 | – | **~4 $** |
| **Normal (30 Chat/Tag, 10 Bilder/Tag, 5× GPU 1h)** | Chat 9 $ + Bilder 3 $ | 5h × 0,80 $ = 4 $ | 0 | – | **~16 $** |
| **Intensiv (50 Chat/Tag, 20 Bilder/Tag, 10× GPU 2h, 5× VNAIPro)** | Chat 15 $ + Bilder 6 $ | 20h × 0,80 $ = 16 $ | 0 | 5 × 0,40 $ = 2 $ | **~39 $** |

**Budget-Empfehlung:** 20 $ Standard (abdeckt Normal-Nutzung), 50 $ für Intensiv-Nutzer, 10 $ für Tests/Wenig-Nutzer.

---

## Testplan und Abnahmekriterien

### 7.1 Kosten-Anzeige & Budget

**Fertig heißt:**
1. ✅ `/api/costs` GET liefert `{today, month, forecast, budget, ampel, byProvider}` mit korrekten Werten (manueller Test: 2 Bilder generieren, costs aufrufen, today ≈ 0,02 $).
2. ✅ Ampel-Icon: 🟢 bei < 10 $ (50 % von 20 $), 🟡 bei 11 $, 🔴 bei 17 $, ⛔ bei 20 $.
3. ✅ Prognose: bei 10 $ am 15. des Monats (30 Tage) → Prognose ≈ 20 $. Bei 5 $ am 30. → ≈ 5 $ (nicht 150 $, also kein linearer Unsinn bei Monatsende).
4. ✅ Budget-Dropdown: Admin wählt 30 $, reload, zeigt 30 $ (KV persistiert).
5. ✅ Nicht-Admin: Kosten anzeigen funktioniert, Budget-Dropdown disabled oder Admin-Prompt.
6. ✅ GPU-Sperre: Budget 100 %, Start-Button disabled, Meldung "Monats-Budget erreicht".

**Tests:**
- Unit: `src/costs.js` `ampel()`, `forecast()`, `summarize()` (134/134 grün, bereits vorhanden).
- Integration: POST 2× `/api/image`, GET `/api/costs`, prüfe `today ≈ 0,02`, `month ≈ 0,02`, `byProvider['Venice'].today ≈ 0,02`.
- Live: Admin-Login, Einstellungen → Kosten, Tabelle zeigt Anbieter, Budget ändern → KV geprüft (`wrangler kv:key get costs:budget`).

### 7.2 GPU-Schalter funktional

**Fertig heißt:**
1. ✅ Einstellungen → GPU-Server, Dropdown "Modal", Start → Admin-Auth → Server startet (POST `/api/gpu`), Status: "startet (0/5 Min)".
2. ✅ Nach 2–5 Min: Status "läuft", URL in KV gespeichert (`gpu:modal:endpoint`).
3. ✅ Stopp → Server stoppt (Modal API-Call), Status "aus".
4. ✅ Auto-Aus: Warte 31 Min ohne Nutzung (kein Bild/Chat), Cron stoppt Server, KV `on: false`.
5. ✅ Budget-Sperre: Budget 100 %, Start → 402 "Monats-Budget erreicht", Server startet nicht.
6. ✅ RunPod Fallback: Modal Key fehlt, Start mit "RunPod" → RunPod API-Call, Server startet.
7. ✅ Kosten-Tracking: Server läuft 1 h, `/api/costs` zeigt `byProvider['GPU-Server'].today ≈ 0,80 $` (Modal).

**Tests:**
- Unit: `src/gpu/modal.ts` Mock-Fetch, `start()` → Poll-Logik, Status running nach 3 Polls.
- Integration: Echter Modal-Test-Account (30 $ Guthaben), Key in `wrangler.toml` Secret, Start → prüfe KV `gpu:state.on === true`, URL abrufbar (`curl https://…/health`).
- Cron: `wrangler dev`, Warte 31 Min (oder manuell KV `lastActivity` auf 31 Min zurücksetzen), Cron-Log zeigt "GPU auto-stop".
- Live: Admin → GPU Start → Modal Dashboard zeigt App running, Stopp → App stopped.

### 7.3 Modellwahl eindeutig

**Fertig heißt:**
1. ✅ Einstellungen → Bildqualität "Hohe Qualität", Speichern, Chat → Bild generieren → Server-Log zeigt `model: qwen-image-3` (Standard) oder `lustify-v8-50` (FSK18).
2. ✅ Bildqualität "Spar-Mix", FSK18 an, Bild generieren → Server-Log `model: chroma` (Mix in FSK18 wird zu chroma).
3. ✅ Bildqualität "🔞 Lustify explizit", FSK18 aus → Dropdown-Option versteckt (CSS `display:none`).
4. ✅ Profil-Model-Override: Profil hat `photo.model: 'krea-v2'`, Bild generieren → `model: krea-v2` (Override schlägt Bildqualität).
5. ✅ Kosten korrekt: "Hohe Qualität" Standard → 0,04 $, FSK18 → 0,01 $ (trackUsage geschrieben).

**Tests:**
- Unit: `image-handler.ts` Mock-Body `{quality:'hq', safeMode:false}` → `model === 'lustify-v8-50'`.
- Integration: POST `/api/image` `{prompt:'test', quality:'hq', safeMode:true}`, prüfe Response `model: 'qwen-image-3'`, D1 `usage_daily` enthält `provider='qwen', cost_usd ≈ 0,04`.
- Live: Einstellungen → "Premium + Nachschliff", Bild generieren, imgInfo-Zeile zeigt "Modell: z-image+qwen-edit · 0,06 $".

### 7.4 Szenen-Schreiber: nur eine Person

**Fertig heißt:**
1. ✅ Chat (FSK18, Seraphina): "Seraphina und ihre Freundin gehen spazieren" → Szenen-Schreiber-LLM Output: "Seraphina walks alone in a park, hearing her friend's voice calling from outside the frame." (Freundin nicht im Bild).
2. ✅ Personen-Detektion: Szenen-Output "Seraphina and another woman stand together" → Server Regex Match → Fehler "Szene enthält mehrere Personen", Chat zeigt "⚠️ Bild konnte nicht generiert werden (mehrere Personen in der Szene)".
3. ✅ Auto-Retry: Szenen-Schreiber 1. Versuch "two women", Server detektiert, sendet LLM-Request erneut mit zusätzlichem System-Prompt "PREVIOUS OUTPUT REJECTED: contained multiple people. Rewrite with ONLY {persona.name}." 2. Versuch OK → Bild generiert.
4. ✅ Outfit-Treue: Chat "Seraphina trägt ein nasses weißes Shirt", Szenen-Output enthält "wet white shirt", Prompt `(wet:1.3) white shirt`, Bild zeigt nass (Transparenz/Wassertropfen sichtbar).

**Tests:**
- Unit: `sanitizeScene(text, personaName)` (neu in prompt-builder.ts) → `sanitizeScene("she and her friend", "Seraphina")` → `"she (alone)"` (oder "her friend outside frame").
- Integration: POST `/api/image` mit Chat-Kontext "Seraphina and Lisa chat" → Response 400 "multiple_people" ODER Bild enthält nur Seraphina (LLM korrigierte sich).
- Live: Chat → "Erzähl eine Szene mit zwei Personen" → Bild zeigt nur Seraphina, Text erklärt zweite Person außerhalb.

### 7.5 Outfit-Zustand gewichtet

**Fertig heißt:**
1. ✅ Profil-Outfit "weißes Shirt", Zustand "nass", Prompt-Builder Output: `(wet:1.3) white shirt`, Bild zeigt Nässe (visuell erkennbar, z. B. dunkle Flecken, Transparenz).
2. ✅ Vergleich: Ohne Gewichtung "wet white shirt" (kein Emphasis) → Bild oft trocken. Mit `(wet:1.3)` → 80 % der Bilder zeigen Nässe (manueller Test, 10 Bilder).
3. ✅ Zustand "zerrissen" → `(torn:1.3) fabric`, Bild zeigt Risse (Stoffkanten sichtbar).
4. ✅ Kein Zustand → kein Emphasis (nur `white shirt`).

**Tests:**
- Unit: `buildOutfit({outfit:'white shirt', state:'wet'})` → `"(wet:1.3) white shirt"`.
- Integration: POST `/api/image` mit `refLook.outfit='white shirt, wet'` → Prompt-Log enthält `(wet:1.3)`.
- Live: Profil Lena, Outfit Einstellung "nass" (Dropdown oder Freitext), Bild generieren, 5× wiederholen → 4/5 zeigen Nässe.

### 7.6 Ersatzanbieter aktiv

**Fertig heißt:**
1. ✅ Groq-Key im Tresor, KI-Weg "Normal" zeigt `[Venice ✓, Modal (aus), Groq ✓, OpenRouter ✓]`.
2. ✅ Chat, Venice antwortet 503 (kein Guthaben) → Chat zeigt "Venice ausgefallen, Groq antwortet", Antwort kommt von Groq.
3. ✅ Groq Rate-Limit (1.000 Req/Tag erreicht) → nächster Anbieter OpenRouter.
4. ✅ Kosten: Groq 0 $, OpenRouter Free 0 $, trackUsage schreibt `provider='groq', cost_usd=0`.
5. ✅ Bild: Runware-Key im Tresor, Venice Bild 503 → Runware generiert, Kosten 0,005 $.

**Tests:**
- Unit: `shared/models.js` `PROVIDERS` enthält `{id:'groq', label:'Groq', …}`, Routes `normal: ['venice','modal','groq','openrouter']`.
- Integration: Mock Venice 503, POST `/api/chat` → Response enthält `provider:'groq'`, D1 `usage_daily.provider='groq'`.
- Live: Tresor → Groq-Key hinzufügen, Chat → Venice deaktivieren (KV `vault:keys:venice.enabled=false`), Chat → Antwort kommt, Kosten zeigt Groq 0 $.

### 7.7 Rote Neuigkeiten-Punkte

**Fertig heißt:**
1. ✅ User in Chat-Tab, Push kommt (Bot antwortet) → SW sendet `postMessage({type:'news', tab:'bot'})` → Bot-Tab-Button bekommt roten Punkt (CSS `.has-news::after` 8 px red circle).
2. ✅ User öffnet Bot-Tab → Punkt verschwindet (`clearNews('bot')`).
3. ✅ Offline-Start: Push kam während App geschlossen → SW schrieb Cache `jeffa-news/__news/bot` → App
