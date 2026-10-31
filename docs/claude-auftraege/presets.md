# Auftrag: Presets: Szenen, Posen, Kleidung (apps/chat/photoopts.js)
Geschätzte Kosten: 9 $

Ziel-Modell: claude-opus-5-5 via LumiaRouter. Repo: jeffa-app (Cloudflare Pages, Node-Tests `npm test`, `npx tsc --noEmit`).
Regeln: echter lauffähiger Code (kein Scaffold), keine Secrets/PINs in Code oder Logs, gespeicherte Profile/Chats (D1) nur lesend bzw. verlustfrei migrieren, 21+-Schutz (scrubYouth, minorRisk, isAdult) nie schwächen. Bild-Fixes wirken erst nach Deploy von hub UND bild (hub /api/image proxyt zum bild-Service). Abschluss: alle Tests grün, tsc sauber, neue Tests für jedes Akzeptanzkriterium.

## Ist
CATALOG mit OUTFIT, KOERPER, POSE, INTENSITY, SCENE, LIGHT, FRAME, MOOD, RENDER; Option = [id, label, prompt, adultOnly, negative]. Labels deutsch & vage, Prompts teils generisch, Dubletten.
## Auftrag
1. Streichliste umsetzen NUR nach Christians OK (siehe 00-gesamt.md, 12 Einträge): sport, jogging, sommer, shorts, strick, jeanspulli, office, cocktail, abendkleid (vage/"normal"), hemd (Dublette zu hemdoffen), christianlook (Dublette bikini/latex → als "Meine Presets" migrieren), plus generische LIGHT/MOOD-Dubletten zusammenlegen.
2. Provokante Einträge bleiben; jeder bekommt ein englisches Mini-Prompt (12–25 Wörter, konkrete Materialien, Sitz, Kamera), modellgeeignet für chroma/lustify. Label = kurze, eindeutige deutsche Bezeichnung, die die KI direkt versteht ("Latex-Body transparent, ohne Träger").
3. Szenen mit Tageszeit-Slot: `{time}` (Tag/Abend/Nacht) → z.B. Parkdeck abends = "dim sodium lights, evening, concrete parking deck". Default-Tageszeit pro Szene in SCENE_DEFAULTS.
4. Posen mit Details: Auto = "sitting sideways in car seat, door wide open, one leg outside on the ground".
5. Einteiler-Verschmelzung: Wörter "second skin / no gaps / oiled / wet-look" nicht mehr gleichzeitig in Outfit + Körper; Regel in Zusammenbau, wenn zwei Teile gewählt (Top+Unterteil) → "separate top and bottom, visible waistline".
6. Nicht-18+-Profile: alle adultOnly-Presets hart gesperrt (Server prüft zusätzlich, nicht nur UI-Filter); Auswahl nur: freie Szene + Richtung "elegant / locker / sportlich" (je 1 jugendfreies Prompt).
7. Labels/Prompts als Daten-Tabelle (JSON) mit Schema-Test, damit Server und Client dieselbe Liste nutzen.
## Akzeptanz
- Test: jedes Preset hat EN-Prompt, keine doppelten Prompts, kein adultOnly in non-18+-Antwort (Server-Test mit adult:false → 403/gefiltert).
- Snapshot-Test der fertigen Prompts für 5 Beispielkombis; Prompt-Länge ≤ 900 Zeichen.
- Textänderungen bestehender Presets nur nach OK (Diff-Datei für Christian erzeugen).
