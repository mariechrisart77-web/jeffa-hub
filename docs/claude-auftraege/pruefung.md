# Auftrag: Prüfung (Auto-Check, gemma-4-uncensored)
Geschätzte Kosten: 6 $

Ziel-Modell: claude-opus-5-5 via LumiaRouter. Repo: jeffa-app (Cloudflare Pages, Node-Tests `npm test`, `npx tsc --noEmit`).
Regeln: echter lauffähiger Code (kein Scaffold), keine Secrets/PINs in Code oder Logs, gespeicherte Profile/Chats (D1) nur lesend bzw. verlustfrei migrieren, 21+-Schutz (scrubYouth, minorRisk, isAdult) nie schwächen. Bild-Fixes wirken erst nach Deploy von hub UND bild (hub /api/image proxyt zum bild-Service). Abschluss: alle Tests grün, tsc sauber, neue Tests für jedes Akzeptanzkriterium.

## Ist
autoCheck: Bild → Check-Modell → bei Fehler 1 Retry (zweites Bild), Kosten ~0,002 $ Check + Bildpreis Retry. Bekannt: meldet "Top fehlt" bei transparentem Latex (Fehlalarm → unnötiger Retry).
## Auftrag
1. Check-Antwort strikt als JSON-Schema (checkparse), Gründe kategorisiert; Logging der Retry-Gründe in Kosten-Tabelle.
2. Retry nur bei harten Fehlern (falsche Person, Minderjährig-Risiko, falsche Szene), nicht bei Kleidungs-Details → spart Bilder.
3. OPTION, NUR MIT CHRISTIANS ZUSTIMMUNG (nicht umsetzen ohne OK): Regel "transparentes/sheer Top zählt als getragen".
4. Retry-Prompt verkürzt nur das Fehlende statt den ganzen Prompt neu zu bauen.
## Akzeptanz
- Tests mit gespeicherten Check-Antworten (Fixtures), Retry-Quote messbar; keine Änderung an Regeln ohne Flag `CHECK_SHEER_OK` (default aus).
