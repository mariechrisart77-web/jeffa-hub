# Auftrag: Profil / Figur-Tab: exakte Körperwerte
Geschätzte Kosten: 8 $

Ziel-Modell: claude-opus-5-5 via LumiaRouter. Repo: jeffa-app (Cloudflare Pages, Node-Tests `npm test`, `npx tsc --noEmit`).
Regeln: echter lauffähiger Code (kein Scaffold), keine Secrets/PINs in Code oder Logs, gespeicherte Profile/Chats (D1) nur lesend bzw. verlustfrei migrieren, 21+-Schutz (scrubYouth, minorRisk, isAdult) nie schwächen. Bild-Fixes wirken erst nach Deploy von hub UND bild (hub /api/image proxyt zum bild-Service). Abschluss: alle Tests grün, tsc sauber, neue Tests für jedes Akzeptanzkriterium.

## Ist
- persona.js: Größe (Slider cm), Statur (0–5), Kurven (1–10, Hüfte), Oberweite (1–7 = A,B,C,D,DD/E,F,G). Kein Gewicht, kein Unterbrustumfang.
- Prompt-Text entsteht DOPPELT: apps/chat/profiles.js (BUST_EN/Hüftliste, Client) und src/promptapp/identity.js figureText (Server). v77 hat die Server-Skalen an die UI angeglichen (vorher: Oberweite 6 → G, Kurven 5 → "pronounced hourglass").
- Freitext-Stil (look.style, z.B. Lora) kann der Zahl widersprechen; Freitext gewinnt teilweise.
## Auftrag
1. Neue Felder: `gewichtKg`, `unterbrustCm`, `cup` (A–G); Anzeige z.B. "70B". BMI = kg/(m²), berechnet, angezeigt mit Klartext (Untergewicht/normal/…) und als Prompt-Baustein ("slim build, BMI 19") statt "schlank/kurvig".
2. Prompt-Brust aus Unterbrust+Cup: Mapping-Tabelle → englische, modellnahe Beschreibung (z.B. 70A = "very small flat A-cup chest, petite frame"). Weil Christian beobachtet: A sah aus wie C, B wie D → Kalibrierungsoffset pro Modellfamilie (chroma/lustify/hq) in einer Tabelle `BUST_CALIBRATION`, Default: eine Stufe kleiner formulieren + Negative "large breasts" bei A/B.
3. Kalibrier-Werkzeug (Admin-only, kostet Bilder, nur auf Knopfdruck): erzeugt pro Cup 1 Bild je Modell, Christian bewertet "wirkt wie X" → Offset speichern.
4. EINE Quelle für Figur→Text: Modul src/promptapp/figure.js, von Client (Vorschau) und Server importiert; profiles.js-Kopie löschen.
5. Migration: oberweite 1–7 → cup A–G, unterbrustCm leer (= "unbekannt", dann altes Verhalten). Keine Werte stillschweigend ändern; Abweichungen Freitext↔Zahl als Hinweis anzeigen, Übernahme nur per Klick (Christians OK). Lora bleibt "zierlich".
## Akzeptanz
- Test: 70A ergibt Prompt ohne "medium/full/large"; BMI 168cm/55kg = 19.5. Alte Profile rendern identischen Prompt wie vor Migration, solange neue Felder leer.
- Ein einziges Mapping (grep findet BUST_EN nur noch in figure.js).
