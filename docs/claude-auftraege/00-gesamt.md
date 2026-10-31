# Jeffa Hub – Gesamtauftrag (Reihenfolge, Kosten, Widersprüche)

Ziel-Modell: claude-opus-5-5 via LumiaRouter. Repo: jeffa-app (Cloudflare Pages, Node-Tests `npm test`, `npx tsc --noEmit`).
Regeln: echter lauffähiger Code (kein Scaffold), keine Secrets/PINs in Code oder Logs, gespeicherte Profile/Chats (D1) nur lesend bzw. verlustfrei migrieren, 21+-Schutz (scrubYouth, minorRisk, isAdult) nie schwächen. Bild-Fixes wirken erst nach Deploy von hub UND bild (hub /api/image proxyt zum bild-Service). Abschluss: alle Tests grün, tsc sauber, neue Tests für jedes Akzeptanzkriterium.

## Reihenfolge & Kosten
1. profil-figur.md – 8 $
2. presets.md – 9 $ (Streichliste/Textänderungen erst nach Christians OK)
3. promptapp.md – 8 $
4. pruefung.md – 6 $ (Sheer-Regel nur mit OK)
5. abgleich.md – 5 $
6. bild.md – 6 $
7. chat.md – 7 $
8. hub.md – 7 $
9. waechter.md – 4 $
10. backup.md – 4 $
11. modell-mix.md – 8 $ (später)
Summe ≈ 72 $ (ohne Modell-Mix 64 $).

## Widersprüche (bremsen / kosten Tokens)
1. Figur→Text doppelt (profiles.js Client vs. identity.js Server) mit verschiedenen Skalen – v77 Skalen angeglichen, Zusammenlegung offen.
2. Profilzahl vs. Stil-Freitext (Lora: Cup A vs. Freitext) – nur Hinweis, Lora bleibt "zierlich".
3. hub→bild-Proxy: Bildlogik in beiden Bundles, Fix nur im hub wirkt nicht.
4. BUST_RX doppelt (imgsvc-core, profilesync); Preset-Logik Client (photoFragments) und Server.
5. Composer-LLM-Call bei jedem Bild, auch ohne neuen Story-Kontext.
6. Check-Retry bei Kleidungs-Fehlalarmen (Sheer-Latex) → doppelte Bildkosten.
7. Lange Prompts: MICRO/SHARP_TAGS + INTENSITY + "second skin/oiled" → Einteiler-Verschmelzung und Token-Kosten.
8. Hub-Version veraltet (jeffa-v67), /api/models 404.
9. apps/bild hat eigene Szenenliste.

## Streichliste Dropdowns (12, nur mit OK)
sport, jogging, sommer, shorts, strick, jeanspulli, office, cocktail, abendkleid, hemd (→hemdoffen), christianlook (→ Meine Presets), generische LIGHT/MOOD-Dublette(n) zusammenlegen. Provokante Einträge bleiben, bekommen EN-Mini-Prompts.

## Braucht Christians OK
Streichliste und Preset-Texte; Sheer-Regel im Check; Übernahme von Zahl↔Freitext-Abweichungen; Default-Tageszeiten; Kalibrier-Offsets; Migration gespeicherter Profile.
