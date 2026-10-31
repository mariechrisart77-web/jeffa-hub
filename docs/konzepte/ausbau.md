# Jeffa Hub – Ausbau-Konzept (Server, LoRA, Sicherheits-App, Ersatzanbieter)

Stand: 30.10.2026 · Alle Preise sind ca.-Werte (USD, ohne MwSt.), Quellen unten.

## Kurz gesagt
- Eigener GPU-Server: **Modal** ist das Arbeitspferd (30 $ Gratis-Guthaben jeden Monat, sekundengenau, schaltet sich selbst auf 0). **RunPod** (nur Prepaid) ist das Backup. Details in Abschnitt 1a.
- LoRA für Lena: auf demselben Server, ca. 1–2 h, also ca. 1–3 $ pro Training.
- Sicherheits-Wächter: eigene kleine App, die nur Jeffa selbst prüft (legal, defensiv).
- Ersatzanbieter: Groq, Mistral und Runware springen ein, wenn Venice leer ist oder ausfällt.

## 0. 💾 Backup von D1 und KV (✅ umgesetzt in v67)
- **Stand v67:** Worker `jeffa-backup` (services/backup) sichert alle 23 D1-Tabellen + KV, gzip + AES-GCM, 30 Tage. Erstes Backup am 30.10.2026 (3,6 MB, in KV, weil R2 im Konto noch nicht aktiv ist). Restore-Test monatlich (Zeilenzahlen), Anzeige im Wächter unter „💾 Backup“. Wiederherstellen: `scripts/backup-restore.mjs`. Offen: täglicher Cron braucht einmal die workers.dev-Subdomain im Dashboard; R2 aktivieren; wöchentliche Kopie außerhalb von Cloudflare (TODO).
- **Was:** alle D1-Datenbanken (z. B. jeffa-kollab) und die KV-Namespaces des Hubs.
- **Wie:** täglicher Cloudflare-Cron-Worker: D1-Export (SQL-Dump) und KV-Schlüssel/Werte als JSON, verschlüsselt (AES-GCM, Schlüssel nur als Secret), in einen R2-Bucket mit Versionierung. 30 Tage aufbewahren, dazu eine wöchentliche Kopie außerhalb von Cloudflare (z. B. Google Drive).
- **Restore-Test:** einmal im Monat automatisch in eine leere Test-D1 bzw. einen Test-KV einspielen und Zeilenzahlen vergleichen. Ergebnis und Fehler meldet der Wächter.
- **Kosten:** praktisch 0 $ (R2-Gratiskontingent). Aufwand ca. 1 Job.

## 0a. 🚦 Kostenampel + Budget-Anzeige (✅ umgesetzt in v67)
- **Stand v67:** ⚙️ Einstellungen → „🚦 Kosten & Budget“ → „Kosten anzeigen“ (lädt erst auf Tippen). Heute/Monat/Prognose je Anbieter (Venice, OpenRouter, VNAIPro, Bilder …), Budget per Auswahl 5/10/20/30/50/100 $ (Standard 20 $). GPU-Start läuft immer über `budgetAllowsGpu()` und ist bei 100 % gesperrt.
- Eine Anzeige im Hub für alle bezahlten Dienste (Venice, Modal, RunPod, AWS, Runware …): Kosten heute, im Monat und als Prognose.
- Ampel: 🟢 unter 50 % des Monats-Budgets, 🟡 ab 50 %, 🔴 ab 80 %. Bei 100 % werden die GPU-Server gestoppt und lassen sich nicht mehr starten.
- Die Monats-Budget-Grenze (siehe 1/1a) wird hier eingestellt. Ersetzt die bisher getrennt geplante „Budget-Anzeige“.

## 1. 🚀 Eigener Server (GPU auf Abruf)
- **Stand v67:** Schalter-Gerüst im Hub (Modal / RunPod / AWS, nur nach Entsperren), zeigt „nicht eingerichtet“; Budget-Sperre und 30-Min-Auto-Aus sind vorbereitet und getestet. Noch keine echten Konten/Aufrufe.
**Optionen (ca. Preis pro Stunde):**
- RunPod Pod: RTX 4090 ca. 0,34 $ (Community) bzw. 0,89 $ (Secure). Sekundengenau abgerechnet, Start per API. **Backup** (siehe 1a).
- Vast.ai: RTX 4090 ab ca. 0,30–0,47 $. Am billigsten, aber private Anbieter mit schwankender Qualität.
- Modal (serverless, schaltet sich selbst auf 0): L4 ca. 0,80 $, L40S ca. 1,95 $. 30 $ Gratis-Guthaben pro Monat, **Arbeitspferd** (siehe 1a).
- AWS EC2 (Frankfurt): g6.xlarge (L4) ca. 1,01 $, g5.xlarge (A10G) ca. 1,26 $. Bis 200 $ Startguthaben für Neukunden, aber GPU-Kontingent muss erst beantragt werden (kann Tage dauern) und die Einrichtung ist am kompliziertesten.

**Warum RunPod als Backup:** einfache API (Start/Stop), fertige ComfyUI-Vorlagen, keine Kontingent-Anträge, passt gut zum Cloudflare-Hub (der Hub ruft nur eine Adresse auf).

**So soll es funktionieren:**
- Schalter „🚀 Eigener Server“ in ⚙️, nur sichtbar, wenn du eingeloggt bist.
- Einschalten → Server startet in ca. 2–5 Min, der Hub zeigt „startet…“.
- Nach 30 Min ohne Nutzung schaltet er sich automatisch aus.
- Anzeige: Kosten pro Stunde und bisher im Monat. Monats-Budget-Grenze (z. B. 20 $). Bei Erreichen geht er aus und lässt sich nicht mehr starten.
- Darauf laufen: Flux/Chroma über ComfyUI (Bilder, auch eigene LoRAs) und ein unzensiertes Chat-Modell über vLLM oder Ollama.
- Fallback: Ist der Server aus, startet er gerade oder antwortet er nicht, nutzt der Hub automatisch weiter Venice (wie heute).

**Kostenbeispiel:** 10 Abende à 1 h im Monat mit RTX 4090 (Secure) ≈ 9 $ + Speicher für Modelle (Netzwerk-Volume, ca. 50 GB) ≈ 3–4 $/Monat.

## 1a. GPU-Server: Modal als Arbeitspferd + Backup (Entscheidung 30.10.2026)
**Aufbau:** Bild-Dienst (jeffa-bild.pages.dev) und Prompt-App → **Modal-Endpoint** (ComfyUI/Flux bzw. Chat-Modell, serverless) → bei Fehler, Budget-Stopp oder Zeitüberschreitung → **RunPod Serverless** (Backup) → zuletzt **Venice** (wie heute). Die Keys liegen nur als Cloudflare-Secrets, nie im Browser. Claude/Cursor-Agents programmieren das später.

**Modal (Starter-Plan):** 0 $ Grundgebühr, **30 $ Compute-Guthaben pro Monat, erneuert sich automatisch jeden Monat**. **Eine Zahlungsart (Karte) ist Pflicht.** Was über 30 $ hinausgeht, wird am Monatsende von der Karte abgebucht.
**RunPod (Backup):** reines Prepaid-Guthaben. Bei 0 $ stoppen die Pods automatisch, **ohne Auto-Pay wird die Karte nie nachbelastet**. Nur Speicher (Volumes) kostet weiter und wird bei leerem Guthaben irgendwann gelöscht.
**Warum nicht Vast.ai:** Ist eine Karte hinterlegt, gleicht Vast ein negatives Guthaben automatisch über die Karte aus (Speicher läuft weiter). Damit gibt es keine harte Grenze.
**„Immer wieder erneuern“:** Mehrere Konten nur für neue Gratis-Guthaben verstoßen gegen die Anbieter-AGB (Sperre möglich). Der legale Weg: Modals 30 $ erneuern sich sowieso jeden Monat, und RunPod lädt man bei Bedarf mit 10 $ auf.

**Status Modal (30.10.2026):** ✅ Konto freigegeben, Workspace `mariechrisart77-web`, Login über GitHub. Zahlungsmethode Visa ••••3685 hinterlegt, Starter-Plan mit 30 $/Monat Gratis-Credits. Spend-Limit für Zusatzgebühren = 0 $ (Workloads stoppen, wenn die Credits aufgebraucht sind; Volume-Speicher kostet trotzdem). Gesamtlimit von Modal gesetzt: 42,50 $. **Offen:** API-Token anlegen und als Cloudflare-Secrets `MODAL_TOKEN` / `MODAL_ENDPOINT_URL` speichern, sobald `services/gpu-modal` per Claude gebaut ist; danach AWS.

**Kostenbremse:**
- Modal → Usage & Billing: **Gesamtlimit 42,50 $ (von Modal gesetzt)**, **Spend-Limit Zusatzgebühren 0 $** → effektiv nur die 30 $ Gratis-Credits. Dann stoppt Modal alles, was echtes Geld kosten würde (Volume-Speicher ausgenommen). Kosten entstehen nur, wenn du das Limit selbst anhebst.
- RunPod: nur Prepaid (z. B. 10 $), **Auto-Pay aus**, Low-Balance-Alarm an, nur Serverless/Pods ohne Volumes (oder Volume löschen).
- Hub: Auto-Aus nach 30 Min, Monats-Zähler. Der Wächter meldet bei 80 % Budget, ungewöhnlich vielen Aufrufen oder einem Fallback auf Venice.

**Kündigung / keine Folgekosten:**
- *Modal:* 1) Apps stoppen (`modal app stop` bzw. Dashboard), Volumes löschen. 2) Spend-Limit auf 0 lassen. 3) Das Entfernen der Karte und das Löschen des Workspace geht laut Modal **nur per Mail an support@modal.com** („Bitte Workspace löschen und Zahlungsart entfernen“). 4) Die letzte Monatsabrechnung prüfen (bei Limit 0 sollten es 0 $ sein).
- *RunPod:* 1) Alle Pods, Endpoints und Network Volumes löschen (nur gestoppt reicht nicht, weil Speicher kostet). 2) Auto-Pay aus, Karte entfernen. 3) Restguthaben verfällt bzw. kann man beim Support anfragen. Ohne Ressourcen und ohne Auto-Pay entstehen keine Kosten. Konto-Löschung per Support-Anfrage.

## 1b. ☁️ Optional: eigener AWS-GPU-Server auf Abruf
- Zusätzlich zu Modal (Arbeitspferd) und RunPod (Backup): eine eigene EC2-GPU-Instanz in Frankfurt (g6.xlarge/L4 bzw. g5.xlarge/A10G) mit eigenem Bildmodell (ComfyUI/Flux) und eigenem Chatbot (vLLM/Ollama).
- **Nur eingeloggt im Hub** ein- und ausschaltbar (Schalter in den Einstellungen). Der Start und Stopp läuft über einen Worker mit eng begrenzten IAM-Rechten (nur Start/Stop dieser einen Instanz).
- **Auto-Aus** nach 30 Min ohne Nutzung, dazu die harte Budget-Grenze der Kostenampel (0a) und ein AWS-Budget-Alarm.
- Voraussetzung: GPU-Kontingent bei AWS beantragen (kann Tage dauern). Startguthaben für Neukunden nutzen.

## 2. LoRA-Training (eigener Stil / Lena)
- Werkzeuge: ai-toolkit (einfach, Flux) oder kohya_ss.
- Dauer: ca. 1–2 h auf einer RTX 4090 oder L40S → ca. 1–3 $ pro LoRA. Fertige Trainingsdienste kosten meist ca. 5–10 $.
- Wichtig: **Venice kann keine eigenen LoRAs laden.** Eigene LoRAs funktionieren nur auf dem eigenen Server.
- Ablauf für Lena:
  1. Du wählst 15–30 freigegebene Bilder aus (nichts wird automatisch ausgewählt).
  2. Der Hub erstellt automatisch Beschreibungen. Du kannst sie prüfen.
  3. Ein Klick auf „Training starten“ startet den Server, trainiert und speichert die LoRA. Danach geht der Server wieder aus.
  4. Die LoRA erscheint im Bild-Menü als Stil „Lena (eigene LoRA)“, aber nur wenn der eigene Server läuft.

## 3. 🛡️ Sicherheits-Wächter (eigene App, nur defensiv)
- Eigene Hub-App, wird erst geladen, wenn du sie öffnest (spart Ladezeit).
- Prüft **nur Jeffas eigene Dienste**:
  - Erreichbarkeit/Uptime der eigenen Endpunkte.
  - Sicherheits-Header und TLS-Zertifikat (Ablaufdatum).
  - Bekannte Lücken (CVE) in verwendeten Paketen.
  - Suche nach versehentlich veröffentlichten Schlüsseln, nur in den eigenen Repos und Dateien.
- Tor: Eine Web-App (PWA) im Browser kann kein Tor ausführen. Möglich ist nur ein Tor-Proxy auf dem eigenen Server, über den der Hub bestimmte Abfragen schickt. Für privates Surfen auf dem iPhone ist der Orion-/Onion-Browser eine eigene, getrennte App.
- Gratis-VPN „nur für diesen Dienst“ mit Länderwahl: technisch nur über den eigenen Server machbar (Server-Standort = Land). Gratis-VPNs sind oft langsam, loggen Daten oder verkaufen sie. Darum nicht empfohlen. VPN und Tor sind in Spanien/Deutschland legal.
- Grenzen: Es wird nichts Fremdes gescannt oder angegriffen. Das wäre illegal.
- Risiken: Ein eigener Proxy kann missbraucht werden, wenn er offen ist. Deshalb nur mit Login und nur für die eigenen Prüfungen.

## 4. Ersatzanbieter (✅ Adapter in v67, aktiv sobald der Key im Tresor liegt)
- **Groq** (gratis, keine Karte): schneller Chat (gpt-oss-120b, ca. 1.000 Anfragen/Tag) und **Whisper** für Spracheingabe (ca. 2.000 Anfragen/Tag). Wird als Chat-Ersatz und für Diktieren genutzt.
- **Mistral** (Free mode, keine Karte): zweiter Chat-Ersatz mit kleinem Monatskontingent.
- **Runware** (2 $ Startguthaben): Bild-Ersatz, wenn Venice leer ist.
- **OpenRouter**: ist schon eingebaut (Gratis-Modelle mit 50 Anfragen/Tag).
- Reihenfolge im Hub: Venice → eigener Server (wenn an) → Runware (Bilder) bzw. Groq/Mistral/OpenRouter (Chat).

## 5. Reihenfolge, Aufwand, Kosten

**Reihenfolge (Stand 30.10.2026):** 1. D1/KV-Backup → 2. Kostenampel + Budget → 3. Server-Ausbau (Modal Haupt, RunPod Backup, AWS optional) → danach die übrigen Punkte.

| # | Schritt | Aufwand (Claude-Jobs) | laufende Kosten |
|---|---|---|---|
| 0 | 💾 D1/KV-Backup mit Restore-Test | 1 Job | ca. 0 $ |
| 0a | 🚦 Kostenampel + Budget-Anzeige | 1 Job | 0 $ |
| 1 | Ersatzanbieter Groq + Whisper, Mistral, Runware | 1–2 Jobs | 0 $ (Runware 2 $ gratis) |
| 2 | 🚀 Eigener Server (Modal Haupt, RunPod Backup, AWS optional; ComfyUI, Auto-Aus) | 3–4 Jobs | ca. 5–20 $/Monat je nach Nutzung |
| 3 | LoRA-Training für Lena | 2 Jobs | ca. 1–3 $ pro Training |
| 4 | Uncensored-Chat auf dem Server (vLLM/Ollama) | 1–2 Jobs | in Server-Stunden enthalten |
| 5 | 🛡️ Sicherheits-Wächter (ohne Tor/VPN) | 2 Jobs | 0 $ |
| 6 | Optional: Tor-Proxy auf dem Server | 1 Job | gering |

**Offene Entscheidungen (du):**
- ✅ Modal-Konto angelegt (30.10.2026, Spend-Limit 0 $). Offen nur noch: API-Token/Deploy nach dem Code-Bau. Danach RunPod mit 10 $ Prepaid.
- Monats-Budget-Grenze: 10, 20 oder 30 $?
- Lena-LoRA: welche Bilder freigeben?
- Groq- und Mistral-Key besorgen (gratis) und im Grok-Bot-Chat ins Secret-Feld legen?
- Tor-Proxy überhaupt gewünscht?

## Bedienung & Inhalte (Okt 2026, umgesetzt)

| Vorschlag | Umsetzung | Version |
|---|---|---|
| Weniger Tippfelder | „📋 Vorlage wählen …“-Auswahl an Persona, Ich, Comic, Bild-Szene und Bild-Feedback (fügt an, überschreibt nie); ✨ Automatisch ausfüllen für Stil/Outfit | v61, v64 |
| Chat lädt zuerst | Andere Apps lazy, Wächter-CSS erst beim Öffnen, Service Worker network-first mit 2,5-s-Fallback; Erststart 26→23 Anfragen, 248→229 KB | v63 |
| Spanischlehrerin Lucía | Neue Figur-Vorlage (26 J., Kastilisch, Deutsch-Übersetzung, sanfte Korrektur, Vokabel pro Gespräch), Niveau Anfänger/Mittel/Fortgeschritten, normal + FSK18, ein Tipp | v65 |
| Rote Punkte an Tabs | Push- und Chat-Ereignisse markieren Tabs, Öffnen löscht den Punkt; keine neue Abfrage | v66 |

## Quellen
- RunPod Preise: https://www.runpod.io/pricing
- Vast.ai Marktpreise (30.10.2026): https://gpueconomy.com/providers/vast-ai/rtx-4090
- Modal Preise: https://modal.com/pricing
- Modal Budgets/Billing: https://modal.com/docs/guide/budgets · https://modal.com/docs/guide/billing
- RunPod Billing: https://docs.runpod.io/accounts-billing/billing
- Vast.ai Billing: https://docs.vast.ai/guides/reference/billing
- AWS g5/g6 Frankfurt: https://www.doit.com/compute/compute/aws/eu-central-1/g6.xlarge
- AWS Free Plan: https://aws.amazon.com/free/
- Groq Limits: https://console.groq.com/docs/rate-limits
- Mistral Free mode: https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key
- Runware: https://runware.ai/pricing
- OpenRouter Limits: https://openrouter.ai/docs/api_reference/limits

## Änderungen
- 30.10.2026: Erste Fassung.
- 2026-10-30: Modal ist jetzt Arbeitspferd, RunPod (Prepaid) das Backup. Dazu Kostenbremse und Kündigungswege (Abschnitt 1a).
- 2026-10-30: Bedienung & Inhalte ergänzt (v63–v66: Tippfelder, Chat-zuerst, Spanischlehrerin, Neuigkeiten-Punkte).
- 2026-10-30: D1/KV-Backup (vor dem GPU-Server), Kostenampel + Budget als ein Feature und optionaler AWS-GPU-Server auf Abruf ergänzt; Reihenfolge angepasst.
- 2026-10-30: v67 umgesetzt: Backup (0), Kostenampel + Budget (0a), Groq/Mistral/Runware-Adapter (4), GPU-Schalter-Gerüst (1). Gebaut hat Claude über die VNAIPro-API (ca. 1,18 $), geprüft, korrigiert und getestet von Grok Bot.
- 2026-10-30: Ausführliches App-Konzept für Bild, Chat, Wächter und Hub (Ist-Zustand, Prioritäten, Arbeitspakete mit Kosten, Lessons Learned) von Claude über VNAIPro (ca. 6,34 $) → docs/konzepte/apps-konzept.md bzw. Tresor-Dokument „apps-konzept“.
- 2026-10-30: Modal eingerichtet (30 $ Credits, Spend-Limit 0 $), Token/Deploy folgt nach Code-Bau.
