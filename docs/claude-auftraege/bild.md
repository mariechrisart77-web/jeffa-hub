# Auftrag: Bild-Service (services/bild, apps/bild)
Geschätzte Kosten: 6 $

Ziel-Modell: claude-opus-5-5 via LumiaRouter. Repo: jeffa-app (Cloudflare Pages, Node-Tests `npm test`, `npx tsc --noEmit`).
Regeln: echter lauffähiger Code (kein Scaffold), keine Secrets/PINs in Code oder Logs, gespeicherte Profile/Chats (D1) nur lesend bzw. verlustfrei migrieren, 21+-Schutz (scrubYouth, minorRisk, isAdult) nie schwächen. Bild-Fixes wirken erst nach Deploy von hub UND bild (hub /api/image proxyt zum bild-Service). Abschluss: alle Tests grün, tsc sauber, neue Tests für jedes Akzeptanzkriterium.

## Auftrag
1. services/bild als einzige Bild-Engine; hub /api/image nur Proxy → doppelte Bundles entfernen, Deploy-Skript deployt bei Änderungen in src/imgsvc-* automatisch beide.
2. apps/bild: feste SCENES-Liste (8 Einträge) durch gemeinsame Preset-Tabelle ersetzen.
3. MODEL_TABLE/routeModel: Kosten pro Qualität sichtbar; Health liefert Version/Commit.
Akzeptanz: Health zeigt Commit; Test, dass hub und bild dieselbe Prompt-Ausgabe liefern.
