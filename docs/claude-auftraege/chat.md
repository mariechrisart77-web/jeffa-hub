# Auftrag: Chat (apps/chat)
Geschätzte Kosten: 7 $

Ziel-Modell: claude-opus-5-5 via LumiaRouter. Repo: jeffa-app (Cloudflare Pages, Node-Tests `npm test`, `npx tsc --noEmit`).
Regeln: echter lauffähiger Code (kein Scaffold), keine Secrets/PINs in Code oder Logs, gespeicherte Profile/Chats (D1) nur lesend bzw. verlustfrei migrieren, 21+-Schutz (scrubYouth, minorRisk, isAdult) nie schwächen. Bild-Fixes wirken erst nach Deploy von hub UND bild (hub /api/image proxyt zum bild-Service). Abschluss: alle Tests grün, tsc sauber, neue Tests für jedes Akzeptanzkriterium.

## Auftrag
chat.js (1000 Zeilen) in Module teilen (Nachrichten, Bild-Trigger, Story-Kontext); Bild-Kontext nur letzte relevante Nachrichten senden (Token sparen); Look-Tab-Texte KI-lesbar; Non-18+-UI aus Presets-Auftrag übernehmen. Tests für Kontext-Kürzung.
