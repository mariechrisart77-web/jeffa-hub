# Auftrag: Wächter (apps/waechter)
Geschätzte Kosten: 4 $

Ziel-Modell: claude-opus-5-5 via LumiaRouter. Repo: jeffa-app (Cloudflare Pages, Node-Tests `npm test`, `npx tsc --noEmit`).
Regeln: echter lauffähiger Code (kein Scaffold), keine Secrets/PINs in Code oder Logs, gespeicherte Profile/Chats (D1) nur lesend bzw. verlustfrei migrieren, 21+-Schutz (scrubYouth, minorRisk, isAdult) nie schwächen. Bild-Fixes wirken erst nach Deploy von hub UND bild (hub /api/image proxyt zum bild-Service). Abschluss: alle Tests grün, tsc sauber, neue Tests für jedes Akzeptanzkriterium.

## Auftrag
Kosten-/Statusübersicht: Bild-, Check-, Composer-Kosten pro Tag und Retry-Quote aus Prüfung anzeigen; Timeouts (8 s) mit Retry-Anzeige; Warnung bei Retry-Quote > 30 %. Tests für Aggregation.
