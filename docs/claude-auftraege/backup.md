# Auftrag: Backup-Worker (services/backup)
Geschätzte Kosten: 4 $

Ziel-Modell: claude-opus-5-5 via LumiaRouter. Repo: jeffa-app (Cloudflare Pages, Node-Tests `npm test`, `npx tsc --noEmit`).
Regeln: echter lauffähiger Code (kein Scaffold), keine Secrets/PINs in Code oder Logs, gespeicherte Profile/Chats (D1) nur lesend bzw. verlustfrei migrieren, 21+-Schutz (scrubYouth, minorRisk, isAdult) nie schwächen. Bild-Fixes wirken erst nach Deploy von hub UND bild (hub /api/image proxyt zum bild-Service). Abschluss: alle Tests grün, tsc sauber, neue Tests für jedes Akzeptanzkriterium.

## Auftrag
Restore-Probe (restoreCheck) monatlich mit Bericht in Wächter; Migrationen aus profil-figur vor Deploy automatisch snapshotten; Test, dass neue Felder (gewichtKg, unterbrustCm, cup) im Snapshot/Restore erhalten bleiben.
