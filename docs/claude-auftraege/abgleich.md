# Auftrag: Abgleich (src/imgsvc-abgleich.js)
Geschätzte Kosten: 5 $

Ziel-Modell: claude-opus-5-5 via LumiaRouter. Repo: jeffa-app (Cloudflare Pages, Node-Tests `npm test`, `npx tsc --noEmit`).
Regeln: echter lauffähiger Code (kein Scaffold), keine Secrets/PINs in Code oder Logs, gespeicherte Profile/Chats (D1) nur lesend bzw. verlustfrei migrieren, 21+-Schutz (scrubYouth, minorRisk, isAdult) nie schwächen. Bild-Fixes wirken erst nach Deploy von hub UND bild (hub /api/image proxyt zum bild-Service). Abschluss: alle Tests grün, tsc sauber, neue Tests für jedes Akzeptanzkriterium.

## Auftrag
Abgleich Profil↔Prompt↔Bild als strukturierte Liste ("gefordert / im Prompt / im Bild"), inkl. Cup-Kalibrierung aus profil-figur; Widersprüche Profil-Zahl vs. Stil-Freitext anzeigen (nur Hinweis, keine Auto-Änderung). Explizite Begriffe nie in Identität (decheck EXPLICIT_RX). Tests mit Fixtures aus v69/v76.
