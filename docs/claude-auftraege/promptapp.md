# Auftrag: Promptapp (src/promptapp, Composer, reconcile)
Geschätzte Kosten: 8 $

Ziel-Modell: claude-opus-5-5 via LumiaRouter. Repo: jeffa-app (Cloudflare Pages, Node-Tests `npm test`, `npx tsc --noEmit`).
Regeln: echter lauffähiger Code (kein Scaffold), keine Secrets/PINs in Code oder Logs, gespeicherte Profile/Chats (D1) nur lesend bzw. verlustfrei migrieren, 21+-Schutz (scrubYouth, minorRisk, isAdult) nie schwächen. Bild-Fixes wirken erst nach Deploy von hub UND bild (hub /api/image proxyt zum bild-Service). Abschluss: alle Tests grün, tsc sauber, neue Tests für jedes Akzeptanzkriterium.

## Ist
LLM-Composer (parseComposerJson) + reconcile + resolveLayers/useScene in imgsvc-core + imgsvc-plan; Story-Outfit vs. Preset (v76 gefixt). Logik doppelt Client (photoFragments) und Server.
## Auftrag
1. Eine Pipeline: Profil → Identität (figure.js) → Story-Fakten (Ort, Tageszeit, Pose, Outfit) → Presets → Prompt; Priorität dokumentiert und getestet (Story > Preset nur wenn Preset nicht explizit gewählt).
2. Composer-Aufruf nur wenn Story-Kontext neu (Cache pro Chat-Nachricht-Hash) → weniger KI-Calls.
3. Prompt-Budget: harte Obergrenze, Dedupe von Synonymen (BUST_RX doppelt in imgsvc-core und profilesync → ein Modul).
4. Tageszeit + Pose-Details aus Story extrahieren (scene-map.js erweitern: "abends", "Tür offen", "Bein draußen").
## Akzeptanz
- Tests: Parkdeck abends → "evening"; Auto-Story → door open; Composer-Cache-Treffer ruft kein LLM.
