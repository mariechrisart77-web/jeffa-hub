# Auftrag: SPÄTER: Modell-Mix (Hintergrund mit Menschen + Vordergrund-Figur)
Geschätzte Kosten: 8 $

Ziel-Modell: claude-opus-5-5 via LumiaRouter. Repo: jeffa-app (Cloudflare Pages, Node-Tests `npm test`, `npx tsc --noEmit`).
Regeln: echter lauffähiger Code (kein Scaffold), keine Secrets/PINs in Code oder Logs, gespeicherte Profile/Chats (D1) nur lesend bzw. verlustfrei migrieren, 21+-Schutz (scrubYouth, minorRisk, isAdult) nie schwächen. Bild-Fixes wirken erst nach Deploy von hub UND bild (hub /api/image proxyt zum bild-Service). Abschluss: alle Tests grün, tsc sauber, neue Tests für jedes Akzeptanzkriterium.

## Auftrag (später, nach den anderen Paketen)
Günstiges Modell erzeugt Hintergrund mit Personen (~1 Cent/Bild), Figur separat, Komposition per Inpainting/Overlay. Prototyp hinter Flag, Kostenmessung, 21+-Prüfung für alle Personen im Bild.
