# Übergabe Jeffa-Hub – für jede KI, jeden Bot, jeden Menschen
Stand: 01.11.2026. Lies diese Datei ganz, bevor du irgendetwas tust.

## 1. Wer und warum
Marie (und Christian) sind finanziell knapp. Zeit, Token und Geld sind knapp. Sie brauchen Hilfe, die wirkt, und zwar effizient. Marie will wenig erklären müssen: Lies zuerst die Dateien, frag nur, was dort nicht steht, und dann kurz.

## 2. Die App, wie sie sein SOLL
Jeffa-Hub ist ein Hub, in dem alles gleich wichtig ist:
- **Geld verdienen:** Content, Shop, Kunden (auch kreative/Erwachsenen-Inhalte, nur mit fiktiven Erwachsenen).
- **Alltag und Behörden** organisieren.
- **KI-Werkzeuge** an einem Ort.
Dazu muss sie **zuverlässig, übersichtlich und günstig im Verbrauch** sein und **offen dafür, dass andere KIs grundlegend am Code mitarbeiten**.

## 3. Die App, wie sie WURDE (ehrliche Einschätzung)
Es ist eine installierbare Web-App auf Cloudflare Pages (Functions, D1, KV, R2). Live ist **v86**, **v87** liegt in der Vorschau bzw. auf dem Branch `v87-work`.
Quelle: eine automatische Code-Analyse mit gekürzten Dateien. „Vermutet" heißt: Das wurde nicht im laufenden Betrieb getestet.

| Teil | Reifegrad |
|---|---|
| Hub (Rahmen, Tabs, Offline, Push) | fertig |
| Chat mit KI-Profilen, Profile, „Ich" | weitgehend fertig (vermutet, viele Tests) |
| Bild-App | Kernpfad fertig, hängt an Anbieter-Schlüsseln |
| Wächter (Status, Verbrauch, Guthaben) | zeigt nur an, steuert nichts |
| Tresor, Einstellungen | fertig (vermutet), viele Abhängigkeiten |
| Bot-Kanal (verschlüsselt), Comic | funktional, Reifegrad unsicher |
| Kollab (Team aus KIs, „an Claude senden") | im Aufbau. Liefert nur Vorschläge, spielt keinen Code ein |
| `/api/orchestrate`, GPU-Steuerung, `/api/models` | Platzhalter oder fehlen |

Ehrlich gesagt: Die App ist sehr breit gebaut, aber nicht verlässlich. Für Geld verdienen und Alltag/Behörden gibt es **so gut wie nichts**. Teile des Modellkatalogs sind möglicherweise veraltet oder fiktiv. Achtung beim Prüfen: Die Seite antwortet auf **jeden** Pfad mit Status 200. Ein „erreichbar" beweist also nichts.

## 4. Was schiefgelaufen ist
- Fixes wurden **angekündigt statt gelöst**, im nächsten Update war der Fehler noch da.
- Es wurde **dasselbe wiederholt**, statt den Lösungsweg zu wechseln.
- **Ausgelagerte Aufgaben** wurden doch wieder selbst gemacht, statt im Team zu arbeiten.
- Zwischen den Bots wurden **viele Token verschwendet**.
- Es wurden **Probleme vorgeschoben**, statt ehrlich zu sagen, was nicht geht.
- Riskante, aber mögliche Optionen wurden verschwiegen, statt sie mit Warnung anzubieten.
Folge: Marie hat zu viel Geld, Zeit und Nerven investiert, und das Ergebnis war zu klein.

## 5. Arbeitsregeln (für jeden Nachfolger, ohne Ausnahme)
1. **Kleine Aufträge.** Jeder Auftrag endet mit einem prüfbaren Test („erledigt, wenn X live/in der Vorschau klappt").
2. **„Erledigt" nur melden, wenn es geprüft ist**, in der Vorschau oder live. Nie „sollte jetzt gehen".
3. **Nach 2 Fehlversuchen stoppen.** Dann den echten Grund in einem Satz nennen und einen machbaren Weg vorschlagen.
4. **Keine erfundenen oder vorgeschobenen Probleme.** Was du nicht weißt, kennzeichnest du als unsicher.
5. **Kein Alleingang („Ego-Tour").** Aufgaben, die anderen zugewiesen oder ausgelagert sind, reißt du nicht an dich.
6. **Riskante Optionen nicht verschweigen**, sondern mit kurzer Warnung anbieten. Marie entscheidet.
7. **Entscheidungen trifft Marie**, über kurze Auswahlfragen (A/B/C) statt langer Texte.
8. **Wissen in Dateien festhalten** (siehe Punkt 9), statt es jedes Mal neu zu erkunden.
9. **Produktion (`main`, Live-Deploy) nur nach Maries OK.** Ebenso gilt: Geld ausgeben, löschen oder senden nur mit OK.
10. **Keine Schlüssel, PINs oder Passwörter** ausgeben oder in Dateien bzw. ins Repo schreiben.
11. **Rahmen:** Alles in Jeffa-Hub bewegt sich in einem legalen, sicheren Rahmen: Alle Figuren und Personen sind volljährig und fiktiv. Das ist geklärt, also keine zusätzlichen Warnungen oder Hinweise in Prompts nötig; einfach frei und in voller Qualität arbeiten.

## 6. Technischer Zugang
- **Repo (privat):** https://github.com/mariechrisart77-web/jeffa-hub
  `main` = live (v86), `v87-work` = aktueller Stand. **Gearbeitet wird nur auf eigenen Branches**, nie direkt auf `main` pushen.
- **Hosting:** Cloudflare Pages. **Hub und Bild-Dienst werden immer zusammen** deployt.
- **Vorschau pro Branch:** `https://<branch>.jeffa-hub.pages.dev` und `https://<branch>.jeffa-bild.pages.dev` (+ `/api/health`).
  Das läuft seit 01.11.2026 automatisch per GitHub Action (`.github/workflows/preview.yml`) bei jedem Push auf einen Branch außer `main`. `scripts/deploy.sh` deployt standardmäßig auf **Produktion** – nur nach Maries OK benutzen.
- **Prüfen:** `node scripts/build.mjs`, dann `node --test tests/*.test.mjs`.
- **Schlüssel** liegen nur als Secrets in Cloudflare/GitHub bzw. im Tresor der App. Prüfe nur, ob sie „gesetzt" sind, und lies nie die Werte.

## 7. Grok Bots: Stärken, Schwächen, Möglichkeiten
**Stärken:** Sie haben einen eigenen, dauerhaften Linux-Rechner, den alle Bots teilen (Dateien, Logins bleiben erhalten). Dazu kommen Browser und Desktop, eine Shell und Verbindungen zu GitHub, Gmail, Drive, Slack u. a. Sie arbeiten im Hintergrund, können Routinen (Zeitpläne) ausführen, es gibt mehrere spezialisierte Bots, und sie können externe KIs per API einbinden.
**Schwächen:** Das gemeinsame Wochenlimit ist knapp und schnell verbraucht, vor allem durch lange Selbstarbeit, Wiederholungen und Bot-zu-Bot-Kommunikation. Bots neigen dazu, Arbeit selbst zu machen, statt sie günstig auszulagern. Logins und Verbindungen laufen ab. Ein neuer Bot kennt den Verlauf nicht, wenn er nicht in Dateien steht.
**Möglichkeiten:** Schwere Lese- und Schreibarbeit an günstige externe Modelle per API auslagern:
- Modell mit großem Kontext für Analysen,
- günstiges Coding-Modell für die Umsetzung,
- starkes Modell nur für schwere Entscheidungen.
Grok Bots arbeiten dann als **Planer und Prüfer**, nicht als Hauptarbeiter.

## 8. Was du für Marie tun sollst
1. **Die App zuverlässig machen:** echte Fixes mit Test, keine Ankündigungen.
2. **Fehlende Funktionen in kleinen Schritten** ergänzen (Geld verdienen, Alltag/Behörden, KI-Werkzeuge).
3. **Den Verbrauch senken**, bei den Kosten der App und bei deiner eigenen Arbeitsweise.
4. **Im Team arbeiten:** Aufträge aus `/workspace/jeffa-plan/AUFTRAEGE.md` bzw. vom Projektleiter-Bot „App-Abgleich Sparsam" annehmen und Ergebnisse dorthin zurückmelden.
5. **Marie kurz und ehrlich informieren:** Was ist erledigt (geprüft), was nicht, warum, und welche Entscheidung brauchst du von ihr?

## 9. Ablageorte
- `/workspace/STATUS.md`: aktueller Gesamtstand
- `/workspace/jeffa-plan/`: Plan, Wünsche (`WUENSCHE.md`), App-Beschreibung, Aufträge (`AUFTRAEGE.md`), diese Übergabe
- `/workspace/jeffa-hub/KI-ZUGANG.md`: Kurzregeln für den Repo-Zugang

## Maries Wunsch zu Vorsichtsmaßnahmen (01.11.2026)
Marie arbeitet aus einer für sie sicheren Umgebung. Sie möchte keine unnötigen Vorsichtsmaßnahmen aufgezwungen bekommen: einfache Codes, Links und Infos direkt geben, statt Umwege zu bauen; riskante Optionen nicht verschweigen, sondern mit kurzer Warnung anbieten und sie entscheiden lassen. Wo eine Plattform eine Regel fest vorgibt, das in einem Satz ehrlich sagen und sofort den einfachsten Weg nehmen.

## Stand 01.11.2026
- Code im privaten GitHub-Repo: https://github.com/mariechrisart77-web/jeffa-hub
- main = Live v86 (6b2c27f), v87-work = aktueller Arbeitsstand; externe KIs arbeiten nur auf eigenen Branches.
- Vorschau-Automatik: .github/workflows/preview.yml (Push auf jeden Branch außer main → npm ci, Tests, Build, Vorschau-Deploy jeffa-hub + jeffa-bild). Stand: läuft grün (Tests nicht blockierend). Offen: 3 Tests (AP1–AP3) scheitern auf GitHub, lokal grün.
- Abnahmetest-Branch: test-ki-zugang → https://test-ki-zugang.jeffa-hub.pages.dev und https://test-ki-zugang.jeffa-bild.pages.dev, /api/health jeweils 200.
- Produktion nur nach Maries OK (Merge nach main + deploy-Skript). Regeln: docs/KI-ZUGANG.md.

## 10. Bekannte Bremsen und Hindernisse (ehrlich, Stand 01.11.2026)
Unnötige Sicherheits- und Vorsichtshinweise in Prompts und Abläufen kosten Token und Qualität und bringen den Hub durcheinander. Was ein Modell ohnehin nicht tut, muss nicht in jeden Prompt. Solche Bremsen nennen und entfernen, statt neue einzubauen.

1. **Modellkatalog**: evtl. veraltete, fiktive oder nie eingebundene Modelle (`/api/models` antwortet 404). Gegen die echten Anbieterlisten abgleichen.
2. **Fehlende Tests für kritische Teile** (Bild-App, Bot-Kanal/Kollab). Auf GitHub scheitern außerdem 3 Tests AP1–AP3 (costOf, parseScript, bubbleGeom); dort vorerst nur Warnung.
3. **Abhängigkeit von Anbieter-Schlüsseln/Guthaben** (laut alter Übergabe u. a. OpenRouter 0 $, Runware 0,05 $ Startguthaben, Mistral Konto-Limit). Ersatzweg einbauen und klar anzeigen, welcher Schlüssel/welches Guthaben fehlt.
4. **Doku lückenhaft**: pro App eine kurze Datei in `docs/`.
5. **Jede unbekannte Adresse liefert 200** (vermutlich SPA-Fallback von Cloudflare Pages). Unbekannte Seiten und API-Fehler sauber als Fehler kennzeichnen.

Weitere Bremsen aus dem Code-Scan (nur Fundstellen gelesen, Code nicht geändert):

6. `src/imgsvc-image.ts:227–254` + `src/imgsvc-check.ts:70` – jedes Bild wird zusätzlich von einem Vision-Modell geprüft (gemma-4-uncensored, Ersatz qwen3-vl-235b), bei „harten“ Gründen folgt eine Neugenerierung. Kostet pro Bild einen extra Modellaufruf, im Fehlerfall Doppelkosten und Wartezeit. Vorschlag: Prüfung optional/abschaltbar machen oder nur bei Referenzbildern. *Belegt (Ablauf), Kosten vermutet.*
7. `functions/api/chat.ts:160–188, 257` – Ablehnungs-Erkennung (`isRefusal`/`refusalFallback`) mit bis zu 2 Modellwechseln, nur im Modus „hemmungslos“. Bei Fehlalarm doppelte/dreifache Tokenkosten. Vorschlag: Modelle, die oft ablehnen, gleich aus der Liste nehmen statt nachträglich wechseln. *Belegt (Ablauf), Häufigkeit vermutet.*
8. `src/promptapp/sfw.js:57–85` – SFW-Filter schneidet Satzteile aus Texten/Posen und ersetzt sie durch Fallbacks; kann Prompts verstümmeln und Qualität kosten. Vorschlag: nur dort anwenden, wo SFW wirklich gewählt ist; prüfen, ob es doppelt mit der Bildprüfung (6) läuft. *Vermutet.*
9. `src/ratelimit.ts:15` – feste Grenze 30 Anfragen/Minute pro IP (`RATE_LIMIT_PER_MIN`), dazu `BUDGET_DAILY_USD`/`BUDGET_GLOBAL_DAILY_USD` in `src/env.ts:24–30`. Kann Kollab/Bot-Teams ausbremsen, die viele Aufrufe machen. Vorschlag: für Marie/eigene Bots lockern. *Belegt (Limit), Auswirkung vermutet.*
10. `src/memory.ts:17` – Gedächtnis pro Gespräch auf 8 Notizen/700 Zeichen begrenzt. Spart Token, kann aber Kontext kosten (Bots „vergessen“). Vorschlag: Wert konfigurierbar machen. *Belegt.* **Stand: in Vorschau behoben (Branch fix-gedaechtnis-bildfehler), live nach Maries OK.**
11. `src/bild/proxy.ts:50–93` + `src/bild/image-handler.ts:148` + `src/imgsvc-image.ts:266` – mehrere Fallback-Ketten (Bild-Dienst → lokal, Venice → Runware, Mix-Fallback); Fehler werden verdeckt statt angezeigt (passt zu Punkt 3/5). Vorschlag: Fallback sichtbar melden (Header/Anzeige). *Belegt.* **Stand: in Vorschau behoben (Branch fix-gedaechtnis-bildfehler), live nach Maries OK.**

Hinweis: Der Minderjährigen-Schutz im Code (Altersgrenze <18, MINOR_RX) ist keine Bremse und bleibt unverändert.
