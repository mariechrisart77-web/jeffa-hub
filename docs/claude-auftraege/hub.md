# Auftrag: Hub (apps/hub, settings, tresor, Bot, Kollab, Comic)
Geschätzte Kosten: 7 $

Ziel-Modell: claude-opus-5-5 via LumiaRouter. Repo: jeffa-app (Cloudflare Pages, Node-Tests `npm test`, `npx tsc --noEmit`).
Regeln: echter lauffähiger Code (kein Scaffold), keine Secrets/PINs in Code oder Logs, gespeicherte Profile/Chats (D1) nur lesend bzw. verlustfrei migrieren, 21+-Schutz (scrubYouth, minorRisk, isAdult) nie schwächen. Bild-Fixes wirken erst nach Deploy von hub UND bild (hub /api/image proxyt zum bild-Service). Abschluss: alle Tests grün, tsc sauber, neue Tests für jedes Akzeptanzkriterium.

## Auftrag
Versionsstring (window.__JEFFA_V='jeffa-v67') aus Build-Commit erzeugen; Settings-Labels KI-lesbar; gemeinsame Komponenten aus apps/shared statt Kopien (chat.js/profiles.js existieren in hub und chat); /api/models 404 bereinigen oder Route ergänzen. Tests + Build-Check, dass hub keine veralteten Kopien bundelt.
