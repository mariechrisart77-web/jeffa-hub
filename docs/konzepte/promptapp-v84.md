# Prompt-App v84 – Modul & Chat

## Modulgrenzen
- **Chat (Browser + Server):** `apps/shared/promptapp/chat.js` (reines JS, kein DOM, kein localStorage). Enthält Systemprompt-Bau, Geschlechts-/Emoji-Regeln, Modus-Normalisierung, Modellwahl-Wunschliste, Ablehnungs-Erkennung + Gate, Bild-Entscheidung.
- **Bild (Server):** `src/promptapp/index.js` (unverändert, `buildPromptPlan`).
- **Einstieg:** `src/promptapp/api.js` re-exportiert beides – Bild als `buildImagePrompt`/`buildPromptPlan`, Chat komplett. Server-Code importiert nur diesen Einstieg; Browser-Code importiert direkt `./shared/promptapp/chat.js`.
- `apps/chat/sysprompt.js` re-exportiert `castLine`, `otherProfileNames`, `identityAnchor`, `capSystem` (Implementierung liegt jetzt in shared), damit bestehende Aufrufer/Tests unverändert bleiben.

## Prioritäten Modellwahl (`pickChatModels` / `resolveChain`)
1. Ausdrückliche Wahl (Chat > Profil) immer vorne.
2. Automatik (Standard seit v84): hemmungslos → unzensierte Route-Modelle zuerst (sonst Venice Uncensored), Spanisch-Lehrer → Qwen (Groq) bzw. DeepSeek-Flash-Uncensored, Technik/Sachprofile → Gemini Flash, Bilder im Verlauf → Nemotron VL, sonst Route-Reihenfolge.
3. Danach unverändert: kostenlose/eigene-Key-Modelle vor 💲-Modellen (nur mit Freigabe), max 6.

## Ablehnungs-Fallback (nur Modus hemmungslos)
- Stream: erst nach ≥240 sichtbaren Zeichen (oder Stream-Ende) prüfen, ob das Modell abgelehnt hat. Keine Ablehnung → Puffer raus, Rest direkt durchreichen.
- Ablehnung → Client bekommt nur eine Notice, dann nächstes unzensiertes Modell (`refusalFallback`), max 2 Wechsel, sonst letzte Antwort normal ausliefern. Fehler-Fallback (429/leer) zählt nicht mit.

## Bildhäufigkeit
- Hemmungslos: wie bisher (Foto-Zeile, Nutzerwunsch oder Auto-Quote).
- Jugendfrei: Auto-Bilder nur alle N Antworten (`imageEverySfw`: 5–10 Standard, 3/5/10 fest, „request“ = nur auf Anfrage). Zähler `conv.repliesSinceImg`, Schwelle `conv.nextImgAt`.
- Die `[FOTO: …]`-Zeile wird immer aus dem Text entfernt, auch wenn kein Bild entsteht.

## Altersgrenze
- Jeder Modus trägt serverseitig `CHAT_AGE_RULE`: alle Figuren sind fiktive Erwachsene, mindestens 18, niemals Minderjährige.
