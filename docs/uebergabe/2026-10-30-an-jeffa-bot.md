# Übergabe an den Jeffa-Bot (30.10.2026, von Helfer)

## Projekt
- Jeffa Hub PWA: https://jeffa-hub.pages.dev · Bild-Dienst https://jeffa-bild.pages.dev · Wächter https://jeffa-waechter.pages.dev
- Repo: /workspace/jeffa-app (nur lokales git, kein Remote). Deploy: `bash scripts/deploy.sh hub|bild|waechter|chat|backup`
- Cloudflare-Konto: Mmd77@gmx.net (Login über Google, Passwort im Tresor des Nutzers). Workers-Subdomain mmd77.workers.dev.
- Aktueller Stand: v67 + Deploy-Fix (Commit 1e1d885). 134 Tests grün.
- Pläne: docs/konzepte/ausbau.md (Ausbau-Konzept, auch als Page: https://cursor.com/canvas/store-9f6b9a3d-a6be-4276-8a2e-6b66b73a6d30/76469c22-6f12-402b-958f-d487619c0934). Pflege: Datei + Changelog-Zeile → `bash scripts/doc-upsert.sh ausbau-konzept "Jeffa Hub – Ausbau-Konzept (Server, LoRA, Sicherheits-App, Ersatzanbieter)" docs/konzepte/ausbau.md` → Page aktualisieren.
- Prompt-Baukasten-Entwurf: docs/prompt-builder-entwurf.md (Datenmodell, Pipeline, Composer).

## Wie die Bild-&-Prompt-App arbeiten SOLL
Ziel: Christian wählt nur per Dropdown/Vorlage, die App baut daraus selbst einen guten, konsistenten Bild-Prompt – er muss nichts beschreiben oder tippen.
1. **Figur (Profil)**: feste Identität (Gesicht, Haare, Augen, Haut, Figur, Alter ≥ 21), fester Seed, optional Gesichts-Referenzbild. ✨ „Automatisch ausfüllen“ / 🔄 „Neu erzeugen“ / ↩️ „Rückgängig“ füllen Profilfelder (v61). Die Identität ändert sich zwischen Bildern NICHT.
2. **Auswahl per Dropdown**: Stil (realistisch/Comic/Anime + Stil-Presets + „Eigener Stil“), Outfit, Pose, Umgebung, Ausdruck, Kamerawinkel, Qualität/Modell (z. B. „Hohe Qualität“, „Lustify v8“). „📋 Vorlage wählen …“ (v64).
3. **Szene aus dem Chat**: Die letzten 4–6 Chat-Nachrichten liefern Szene/Handlung. Ein kleines Textmodell (Composer) gibt nur {scene, action, camera, lighting, outfit} zurück – nie Identität, nie zusätzliche Personen, die nicht gewünscht sind.
4. **Feste Prompt-Reihenfolge**: Szene (1.35) → Kamera (1.25) → Outfit → Identität → Stil → Qualität; Negativ-Prompt = generisch + Outfit-Negativ + Feedback-Negativ.
5. **Gewählte Kleidung/Zustand muss sichtbar umgesetzt werden** (z. B. nasses Shirt muss nass aussehen) – ggf. höhere Gewichtung + Negativ („dry clothes“).
6. **Feedback**: 👍/👎 (+ Kommentar) → D1 `image_feedback` → Korrekturen pro Figur fließen in die nächsten Bilder; 👍-Seed als Vorschlag. „🔁 Ähnlich wie letztes Bild“.
7. **Anbieter**: Venice (Standard), Runware als Ersatz, später eigener GPU-Server (Modal zuerst, dann AWS) für eigene LoRAs (Venice kann keine eigenen LoRAs laden). Jede Generierung prüft Budget/Kostenampel.
8. **Sicherheit**: Altersschutz 21+ (scrubYouth, minorRisk, 403 „Profil muss eindeutig erwachsen sein (21+)“) bleibt immer aktiv.
9. **Performance**: Bild-App lädt getrennt/auf Abruf, damit der Chat schnell bleibt.

## Bekannte Probleme
- Outfit/Szene werden oft nicht umgesetzt (nasses Shirt kam trocken).
- Szenen-Schreiber fügt ungewollt Personen hinzu (Vorschlag zum Verschärfen wartet auf Christians OK).
- Qualität hängt stark vom Modell ab; Standardwerte/Negativ-Prompts fehlen.
- Zähne/Gesichtsdetails + vollständiges Charakter-Sheet noch nicht gebaut.
- GPU-Server (Modal/RunPod/AWS) nur Schalter-Gerüst (503 „nicht eingerichtet“), nicht in der Kostenampel.
- Groq/Mistral/Runware eingebaut, aber ungetestet (kein Schlüssel im Tresor).
- Backup läuft täglich 04:17 (Madrid) nur bei Cloudflare (KV); Kopie außerhalb fehlt; R2 noch nicht aktiv.
- Offene Fragen: Autokorrektur (Handy/Tastatur-Angaben fehlen); kommen Admin-Antworten bei Jeffa an?

## Laufend / in Arbeit
- Claude (über VNAIPro, bis 10 $) schreibt gerade ein ausführliches App-Konzept (Bild, Chat, Wächter, Hub) → docs/konzepte/apps-konzept.md + Tresor + Page. Nur Konzept, kein Code. Helfer leitet das Ergebnis weiter.
- Modal-Konto (GitHub mariechrisart77-web, Gmail konto 2 mariechrisart77@gmail.com) wartet auf Freigabe; Helfer hat eine Routine, die alle 3 Std. (9–21 Uhr) nach der Freigabe-Mail schaut. Danach Modal, dann AWS einrichten – Christian hat dafür sein Ja gegeben. Karte (Visa ••4707) nur mit seiner Bestätigung im Chat.

## Werkzeuge
- Claude über VNAIPro: OpenAI-kompatibel https://apikey.vnaipro.app/v1/chat/completions, Schlüssel in /workspace/vnaipro_helfer_key.txt (nie ausgeben). Verbrauch: /v1/dashboard/billing/usage (Stand ~886 Cent gesamt; Guthaben ~19 $). Frühere Build-Skripte: /workspace/jeffa-build/ (r*/run.sh, apply.py).
- Helfer-Kanal aus der App: Routine bei Helfer; Antworten mit `JEFFA_BOT_KEYS=/workspace/jeffa-bot/helfer.keys.json python3 /workspace/jeffa-bot/jeffa_bot.py antwort <ref> --file <txt>`.

## Christians Wünsche an die Arbeitsweise
- Ideen erst im Konzept sammeln, dann gebündelt an Claude (5–10 $ pro Paket), echter Code statt Gerüste; selbst nur prüfen/testen/live stellen.
- Vorher sagen, was ein Auftrag liefert; nachher ehrlich, was funktioniert. Grenzen offen sagen.
- Deutsch, Dropdowns statt Tippen, Tokens sparen, „Automatisch vorlesen“ standardmäßig aus.
- Nie Schlüssel/PINs in Dateien/Commits; keine Anmeldungen/Zahlungen ohne sein Ja; Presets/Texte nur mit seinem OK ändern.
