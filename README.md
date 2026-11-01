# Jeffa

Produktionsreife Chat-Anwendung mit KI-Providern über Cloudflare AI Gateway, lokaler verschlüsselter Speicherung und Kollaborations-Features.

## Stack

- **Backend**: Cloudflare Pages Functions (TypeScript)
- **Frontend**: Plain HTML/CSS/JS (ES-Module), PWA
- **Datenbank**: Cloudflare D1 (SQLite)
- **KV**: Optional für Budget/Rate-Limiting
- **AI Gateway**: Cloudflare AI Gateway für Caching und Routing

## Lokaler Start

```bash
npm install
npm run db:migrate:local
npm run dev
```

Öffne http://localhost:8788

## Konfiguration

### 1. AI Gateway anlegen

```bash
# Im Cloudflare Dashboard: AI > AI Gateway > Create Gateway
# Name: jeffa-gateway
# Notiere Account-ID und Gateway-ID in wrangler.toml
```

### 2. D1-Datenbank anlegen

```bash
wrangler d1 create jeffa-kollab
# Kopiere die database_id in wrangler.toml unter [[d1_databases]]
wrangler d1 migrations apply jeffa-kollab --remote
```

### 3. (Optional) KV-Namespace für Budget/Rate-Limiting

```bash
wrangler kv namespace create jeffa-kv
# Kommentiere [[kv_namespaces]] in wrangler.toml ein und trage die ID ein
```

### 4. Secrets setzen

```bash
wrangler pages secret put GEMINI_API_KEY
wrangler pages secret put OPENROUTER_API_KEY  # optional
wrangler pages secret put XAI_API_KEY         # optional
wrangler pages secret put VENICE_API_KEY      # optional für Bildgenerierung
wrangler pages secret put HF_TOKEN            # optional für HuggingFace-Modelle
```

| Variable | Zweck | Hinweis |
|---|---|---|
| `GEMINI_API_KEY` | Standard-Chat (Gemini) | |
| `OPENROUTER_API_KEY` | Freie Modell-Kette `auto:nemotron-free` (Nemotron zuerst, automatischer Fallback) | getestet: nemotron-3.5-super-vl:free → Fallback nemotron-3.5-lightning:free |
| `VENICE_API_KEY` | Bildgenerierung (`/api/image`, Standard `z-image-turbo`) | |
| `HF_TOKEN` | Video (`/api/video`) und optional HF-TTS | Inference Providers liefern ohne HF-Guthaben **402** → UI zeigt „nicht verfügbar“ |
| `HF_VIDEO_PROVIDER` | optional, Standard `fal-ai/fal-ai/wan/v2.2-5b/text-to-video` | Queue/Polling noch nicht implementiert |
| `HF_TTS_MODEL` | optional, HF-TTS-Fallback | ohne Wert: Fallback auf Browser-`speechSynthesis` |

**Edge TTS** (Seraphina/Aria, `de-DE`) braucht **keinen** Key (Sec-MS-GEC wird im Worker berechnet). Lokal: Secrets in `.dev.vars` (chmod 600, nie committen).


Hole API-Keys von:
- Gemini: https://aistudio.google.com/apikey
- OpenRouter: https://openrouter.ai/keys
- xAI/Grok: https://console.x.ai/
- Venice: https://venice.ai/api
- HuggingFace: https://huggingface.co/settings/tokens

## Deployment

```bash
node scripts/build.mjs && npm test && npx tsc --noEmit
bash scripts/deploy.sh hub chat bild   # koppelt hub+bild automatisch, schreibt Commit in src/build-info.ts
```

Health: `https://jeffa-{hub,chat,bild}.pages.dev/api/health` zeigt `commit` und `version`.

Nach dem Deploy Secrets im Cloudflare Dashboard unter Pages > jeffa > Settings > Environment variables setzen.

## Features

### Chat-Modul
- Multi-Provider-Unterstützung (Gemini, OpenRouter, Grok/xAI)
- Echtes SSE-Streaming mit Stop-Button
- Optimistic UI
- Modell-Fallback-Ketten pro Profil
- Kontext-Management mit rollierender Zusammenfassung
- Token-/Kostenanzeige
- Tagesbudget-Enforcement
- Offline-Queue

### Profile
- Eingebaute Profile: Assistent, Anwalt, Coder, Lena, Lora
- Benutzerdefinierte Profile mit Avatar, Eigenschaften, Systempromprompt
- Modell-Fallback-Ketten
- Bild-/Videogenerierung pro Profil
- TTS mit Browser/Edge/HuggingFace-Providern

### Wächter
- Status-Dashboard mit Provider-Health
- Gateway-Erreichbarkeit
- Token-/Kostenzähler
- Konfigurationsübersicht

### Kollab
- Aufgaben/Notizen zwischen Bots
- Status-Tracking (offen/in_arbeit/erledigt)
- CRUD-API

### Sicherheit
- Verschlüsselte lokale Speicherung (AES-GCM)
- Rate-Limiting
- Budget-Limits
- Input-Validierung
- Security-Header

## Architektur

```
functions/
  _middleware.ts          - Error-Handling, Security-Header
  api/
    chat.ts               - SSE-Streaming-Chat
    status.ts             - Health-Check und Konfiguration
    health.ts             - Leichtgewichtiger Uptime-Check
    summarize.ts          - Kontext-Zusammenfassung
    orchestrate.ts        - Placeholder für zukünftige Features
    models/
      free.ts             - OpenRouter-Free-Modelle
    image.ts              - Bildgenerierung (Venice/HF)
    video.ts              - Videogenerierung (HF)
    tts.ts                - Text-to-Speech (Browser/Edge/HF)
    kollab/
      tasks/
        index.ts          - Aufgabenliste GET/POST
        [id].ts           - Einzelne Aufgabe GET/PATCH/DELETE

src/
  env.ts                  - Typen und Env-Helpers
  providers.ts            - Provider-Abstraktion mit Streaming
  context.ts              - Kontext-Trimming
  budget.ts               - Budget-Tracking
  ratelimit.ts            - Rate-Limiting
  shared/
    trim.js               - Reine Funktion für Tests

migrations/
  0001_init.sql           - D1-Schema

tests/
  trim.test.mjs           - Unit-Tests
  e2e.mjs                 - E2E-Tests (optional)
```

## Kostenoptimierung

- **AI Gateway Caching**: Identische Anfragen werden 1h gecacht
- **Kontext-Trimming**: Nur letzte 6 Nachrichten + Zusammenfassung
- **Rollierende Zusammenfassung**: Alle 8 Nachrichten mit günstigem Modell
- **Modell-Routing**: Default günstiges Lite-Modell, besseres auf Anfrage
- **Tagesbudget**: Configurable Budget-Limit mit 429-Response
- **Request-Dedupe**: Client verhindert Doppel-Senden

## Modell-Regeln/Kosten

- **Freigabe-Regel gilt nur für Anbieter OHNE eigenen Key/Volumen** (z. B. bezahlte OpenRouter-Modelle): diese sind mit 💲 markiert, nur mit ⚙️ „💲 Bezahlte Modelle ohne eigenen Key erlaubt“ (Standard aus) und dann hinten in der Kette – nie stiller Fallback, sonst klare Meldung im Chat.
- **Eigene Keys/Volumen** (Secrets vorhanden: Venice, Gemini, LumiaRouter, Groq (`GROQ_API_KEY` in jeffa-hub + jeffa-chat, Free-Tier = 0 $, Limits pro Minute); Namen geprüft, Werte nie ausgegeben) dürfen ohne Freigabe normal in der Kette stehen; Preis steht am Modell (≈ $/Nachricht, Quelle `estimateCost` in `functions/api/chat.ts`). Code: `hasOwnKey`/`needsApproval` (apps/shared/models.js), Server `isFreeModel` (chat.ts) und Agent-Filter.
- Kostenlose Modelle (`:free`, `auto:`, Groq/Mistral) bleiben bevorzugt; Spanisch-Lehrer: `auto:nemotron-free`.
- Reihenfolge der Presets: **Normal** – Gemini/Groq weit oben (nemotron:free → gemini-flash-lite → Groq GPT-OSS 120B → dots → gemini-flash → Groq Qwen 3.8). Groq-Modelle: gpt-oss-120b, gpt-oss-20b, qwen3.8-27b (zensiert → bei FSK18 nur letzter Platz). **FSK18** – Venice oben, Gemini (zensiert) weit unten bzw. nur in „Schnell“ am Ende.
- Chat-Preise (≈ 3000 Tokens rein / 300 raus): Gemini-Lite ~0,0003 $, Gemini Flash ~0,0006 $, Venice Gemma-4 ~0,0007 $, Venice Uncensored 1.2 ~0,001 $, DeepSeek V4.1 ~0,0015 $, Role-Play ~0,002 $ pro Nachricht.
- Bildpreise stehen in ⚙️ „Bildqualität“: Einzelbild/chroma/Lustify ~0,01 $/Bild (1-Cent-Option), Spar-Mix ~0,03 $, HQ qwen-image-3 ~0,04 $, Premium ~0,05–0,07 $.
- Schlüssel (`LUMIAROUTER_API_KEY`, `VENICE_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `JEFFA_APP_PIN`) nur aus env/Secrets – nie in Code, Logs, Commits oder diese README.

## Tests

```bash
npm test
```

Unit-Tests laufen immer. E2E-Tests erfordern laufenden Server (npm run dev) und testen gegen http://localhost:8788.

## Limitierungen

- **Edge TTS**: Nur Browser-TTS implementiert. Serverseitiges Microsoft Edge TTS erfordert WebSocket-Protokoll und ist in Workers Functions nicht trivial machbar. Dokumentiert als 501.
- **Video**: Abhängig von HuggingFace Inference API, kann langsam sein.
- **Bilder**: Venice API bevorzugt, Fallback zu HuggingFace bei Bedarf.

## Lizenz

Proprietär

## Architektur (Runde 3): 3 schlanke Apps

| App | URL | Inhalt |
|---|---|---|
| Chat | https://jeffa-chat.pages.dev | Chat, Profile, Persona-/Look-Editor, Ich-Profil, KI-Werkzeuge |
| Wächter | https://jeffa-waechter.pages.dev | Provider-Kacheln, Verbrauch, Guthaben, Trials/Abos |
| Hub | https://jeffa-hub.pages.dev | bettet Chat + Wächter ein; Kollab, Einstellungen, Tresor (Admin) |

- Jede App lädt nur ihr eigenes JS (`apps/<app>/`) plus `apps/shared/`.
- Alle drei Pages-Projekte teilen `functions/` + `src/` (gleiche API, gleiche D1 `jeffa-kollab` + KV `jeffa-kv`, gleiches `VAULT_SECRET`).
- Build: `node scripts/build.mjs` → `dist/<app>/`; Deploy: `scripts/deploy.sh [chat waechter hub]` (setzt Projektname je App).
- Passkeys sind pro Origin → Admin/Tresor laufen im Hub. Profile/Chats liegen im localStorage der Chat-Origin.

### KI-Werkzeuge (Function Calling, `/api/agent`)
- Lesen (jede Rolle): `list_profiles`, `read_settings`, `read_status` (ohne Schlüsselwerte), `read_usage`, `list_tasks`.
- Admin: `update_profile` (inkl. Look/Regler), `change_setting` (encrypt/theme), `upsert_task`, `toggle_key` (nur an/aus, nie Werte).
- Schreibaktionen werden nie direkt ausgeführt: Bestätigungsdialog im Chat → `/api/agent/exec` (Admin-Check, Rate-Limit) → Audit in D1 `tool_audit`.
- Werkzeuge nur bei passender Nachricht (Auto) oder per Schalter „🛠 Werkzeuge: Auto/An/Aus“ im Anhang-Menü. Gemini nativ, OpenRouter/xAI im OpenAI-Format. Keine Code-Werkzeuge.

## Versionen v69–v78 (Kurzstand, Details siehe Versionsverlauf)

- v69–v73: Profile/Presets, Formulierung, Bild-Pipeline (imgsvc-*), FSK18-Presets, 21+-Schutz (`scrubYouth`, `minorRisk`).
- v74–v77: Promptapp (`src/promptapp/`), Identität aus Profil, zentrale Figur-Skalen (`apps/shared/figure.js`), Spanisch-Lehrer.
- v78: Modus-Umschalter, Prüfung (`src/imgsvc-checkparse.js`, Retry nur bei harten Gründen, `CHECK_SHEER_OK`), Bildkontext aus Chat (`apps/shared/img-context.js`), Build-Info/Health-Commit, Knappheit-Stufen (Stufe 10 „Micro, maximal knapp …“), Latex-Bikini-Dubletten zusammengeführt (`christianlook`→`bikini`), gestufte Regler-Begriffe und Kleidungsstil-Mini-Prompts (`apps/shared/persona-terms.js`).

## Zukünftige Pläne

- Feine Modellsteuerung pro Modul (Chat, Bild, Prüfung, Lehrer, Agent) – eigener Claude-Auftrag.
- Modell-Mix Hintergrund + Vordergrund (getrennte Modelle je Ebene).
- Tageszeit-Auswahl im Foto-Menü; Tageszeit automatisch aus dem Chat-Text.
- SZENEN-Liste in bild (zentral, gemeinsam mit chat).
- `apps/chat/chat.js` aufteilen (zu groß).
- Durchsichtigkeits-Prüfregel (`CHECK_SHEER_OK`) wartet auf OK von Christian.
- Geschlechtsfeld (gender) im Profil-UI.
- **Nächster Claude-Auftrag (gemeldet 31.10.2026 von Christian, noch NICHT geprüft) – nach Modulen getrennt:**
  > Grundregel: Jedes Modul einzeln bauen und testen; Module sprechen nur über klare Schnittstellen (`apps/shared/`, `/api/*`) miteinander. Kein großes Gesamtpaket, keine Logik doppelt in mehreren Modulen.

  **Prompt-App (eigenes System, zentrale Text-/Modell-Logik; Chat und Bild fragen sie nur ab)**
  - P1 Architektur: Prompt-App bleibt eigenes Modul, damit Größe/Komplexität andere Bereiche nicht ausbremst.
  - P2 Automatische Wahl des besten Sprach- und Bildmodells je Modell/Profil/Einstellung, Schalter manuell/automatisch.
  - P3 Zensur-Fehlerkennung: Modus „hemmungslos“/18+-Status zuverlässig an Prompt, Filter und Modellwahl durchreichen; bei Verweigerung eines zensierten Modells auf das nächste unzensierte der Kette wechseln statt Inhalte zu filtern.
  - P4 Männliche Profile: Labels, Dropdown-Inhalte und Prompt-Bausteine automatisch nach `gender` umschalten (z. B. Statur statt Körbchen, männliche Kleidung).
  - P5 Emojis nach Persönlichkeit (passende Emojis/Kombinationen je Profil).
  - P6 TTS-Textbereinigung: Satzzeichen nur als Pausen, Emojis/Sternchen/Rauten nicht vorlesen.

  **Chat**
  - C1 Vorlesen (hohe Priorität): Knopf als Start/Stopp-Umschalter, nur eine Wiedergabe gleichzeitig, sichtbarer Zustand, auch bei „automatisch vorlesen“.
  - C2 Stimme pro Profil leichter auffindbar machen (existiert im Profil-Editor, `apps/chat/persona.js`) und sicher je Profil speichern.
  - C3 Identitätsverwechslung: Coder-Bot hält sich für „Lena“ – Persona/Kontext/Memory je Profil isolieren.
  - C4 Sprachlehrer (Lucía, Javier): Verlauf geht beim Schließen verloren – dauerhaft speichern und wiederherstellen.
  - C5 Altersgrenze 18+ (Christians Entscheidung 31.10.2026, EU): Altersfeld, Prompt-Regeln, Texte. Minderjährige bleiben strikt ausgeschlossen.

  **Bild**
  - B1 Bildhäufigkeit im jugendfreien Modus: nur etwa jede 5.–10. Antwort ein Bild (Regler/Dropdown).
  - B2 Altersgrenze 18+ in Bild-Prompts und Prüfschwellen (scrubYouth/minorRisk), Schutz <18 bleibt.

  **Hub**
  - H1 Kacheln per Drag & Drop verschiebbar wie auf dem iPhone (langes Drücken, Reihenfolge speichern).
  - H2 Face ID funktioniert nicht – WebAuthn/Passkey in der PWA auf dem iPhone reparieren.
  - H3 Modal (GPU-Anbieter) anbinden: steht bisher nur als Platzhalter in `functions/api/costs.ts`; Schlüssel als Cloudflare-Secret, Status/Kosten in der Kostenanzeige.
- Claude-Aufträge je Modul: [docs/claude-auftraege/](docs/claude-auftraege/) (Gesamt: `00-gesamt.md`).

## Versionsverlauf

- v69: Abgleich (Konsistenz-Prüfung vor jedem Bild), Anatomie-Negatives, statische Pose; 21+-Schutz (`scrubYouth`, `minorRisk`).
- v70: Christians-Look-Bikini (Größe, blickdicht → rauchgrau halbtransparent).
- v71: Retry-Seed ≤ 999999999 (Venice-Limit).
- v72: Look-Dreiecke, Metall-Negative; fokussierter Bildcheck über Venice-Vision.
- v73: Explizite Outfit-Wahl gilt immer, sonst Story; Bikini-Oberteil nur wenn aktiv.
- v74: Prompt-App (`src/promptapp`), charakter-agnostische Identität, Prompt-Vorschau.
- v75: SFW-Filter für Nicht-18+, Story-Ort/-Pose → Szene, chroma-Default FSK18.
- v76: Kleidung automatisch – Story-Outfit schlägt kopiertes Preset.
- v77: Figur-Skalen Server = UI; Claude-Aufträge je Modul.
- v78: Modus-Schalter, Figur-Modul, Prüfung/Retry, Bildkontext, Knappheit-Labels, Latex-Bikini-Merge, gestufte Regler-Begriffe, Kleidungsstil-Prompts, kostenlos-zuerst-Modelle.
- v79: Knappheit 10 „Brustwarzen und Klitoris nicht mal mehr ganz verdeckt“ (nur 18+); Freigabe nur für Anbieter ohne eigenen Key; Venice/Gemini normal in der Kette mit Preisangabe; Gemini oben (SFW) / unten (18+).
- v80: Groq-Key als Secret (hub/chat), Groq = eigener Key (gpt-oss-120b/20b, qwen3.8-27b) in Ketten, Tresor-„Hinzufügen“-Absturz auf iPhone behoben (fehlendes `.view-inner`-Root).
<!-- KI-Zugang Test -->
