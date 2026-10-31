# Prompt-Baukasten – Entwurf

Ziel: Aus den Profil-Einstellungen einer Figur und dem aktuellen Chat-Kontext automatisch einen umfassenden, konsistenten Bild-Prompt bauen.

## 1. Bestand (Stand a37d33b) – ✅ vorhanden / 🔨 zu bauen

| Baustein | Status | Ort im Code |
|---|---|---|
| Profil-Look (Typ, Alter ≥18, Haare, Stil, Besonderes, Figur) | ✅ | `apps/chat/profiles.js` → `buildImagePrompt()` |
| Look-Presets (Kleidung/Pose/Umgebung/Ausdruck, FSK18-Flag) | ✅ | `defaultLooks()`, `apps/chat/look.js` |
| Outfit-Feld mit Stichwort + Negativ (`outfitKeyword/outfitText/outfitNeg`) | ✅ | `outfitFor()` in `chat.js` |
| Szene-zuerst-Gewichtung, Kamerawinkel | ✅ | `generateImageInChat()`, `pickAngle()` |
| Fester Seed pro Figur, „Seed variieren“ | ✅ | `profile.seed`, `profile.seedVary` |
| „🔁 Ähnlich wie letztes Bild“ (Seed/Prompt wiederverwenden) | ✅ | Aktion `similar` |
| Gesichts-Referenzbild (qwen-edit) | ✅ | `functions/api/image.ts` (`ref_profile`) |
| Generische Negativ-Prompts | ✅ | `NEG_SINGLE`, `NEG_COMIC` |
| Zähne/Gesichtsdetails als eigene Felder | 🔨 | – |
| Stil-Presets inkl. „Eigener Stil“ (CRUD, lokal gespeichert) + Posen-Liste | ✅ | `apps/chat/styles.js`, Look-Tab `look.js` |
| Feedback 👍/👎 → Korrekturen (D1 `image_feedback`, Cache `image_feedback_corr`) | ✅ | `functions/api/imagefb/[[path]].ts`, `rateImage()` in `chat.js` |
| LLM-Composer (Schalter „Prompt automatisch erstellen“) | ✅ Basis | `POST /api/imagefb/compose`; eigener Stil-Text hat Vorrang |
| Charakter-Sheet (fixe Identitäts-Beschreibung) | 🔨 (Teil: `looks.refLook`) | – |

## 2. Datenmodell

```ts
interface CharacterSheet {        // stabil, ändert sich selten
  profileId: string;
  identity: string;               // kompakte EN-Beschreibung: Gesicht, Haare, Augen, Haut, Figur
  faceDetails?: string;           // z. B. Zähne, Lächeln, Sommersprossen
  ageApprox: number;              // immer >= 18
  seed?: number;                  // fester Seed
  faceRefId?: string;             // aktives Gesichtsbild (profile_refs)
}
interface StyleSelection { presetId?: string; customText?: string; poseId?: string; render: 'realistisch'|'comic'|'anime'; quality?: string; }
interface SceneContext { lastMessages: string[]; sceneHint?: string; outfitOverride?: string; people?: string[]; }
interface FeedbackCorrections { positive: string; negative: string; goodSeed?: number | null; }
interface ComposedPrompt { prompt: string; negative: string; seed?: number; refImage?: boolean; debug: Record<string,string>; }
```

## 3. Pipeline

1. **Sammeln** – Profil (Look, Figur, Presets, Outfit), Stil/Pose, letzte 4–6 Chat-Nachrichten, Feedback-Korrekturen, Referenzbild-Status, Seed.
2. **Normalisieren** – Deutsch → englische Prompt-Stichworte; Dubletten entfernen; Längen kappen; Alter immer „adult, 18+“.
3. **LLM-Composer** – kleines Textmodell (z. B. Gemini Flash-Lite) bekommt alle Bausteine als JSON und gibt `{scene, action, camera, lighting, outfit}` zurück. Identität kommt **nicht** vom LLM, sondern unverändert aus dem Charakter-Sheet.
4. **Konsistenz-Anker** – feste Reihenfolge: `Szene (1.35) → Kamera (1.25) → Outfit → Identität (Sheet) → Stil-Preset → Qualität`; fester Seed; Gesichts-Referenzbild, falls aktiv.
5. **Negativ-Prompt** – generisch + Outfit-Negativ + Feedback-Negativ.
6. **Feedback-Schleife** – 👍/👎 + Kommentar in D1 → LLM fasst die letzten 10 zu Korrekturen zusammen (gecacht pro Figur) → fließt in Schritt 4/5 ein; 👍-Seed als Vorschlag.

## 4. Beispiel-System-Prompt für den Composer

```
Du bist ein Prompt-Designer für einen Bildgenerator. Du erhältst JSON mit: Charakter-Sheet, Stil, Pose,
Outfit, Feedback-Korrekturen und den letzten Chat-Nachrichten.
Aufgabe: Beschreibe die aktuelle Szene so, dass sie exakt zum Chat-Verlauf passt.
Regeln:
- Ändere nie die Identität (Gesicht, Haare, Figur) – sie wird separat eingefügt.
- Alle Personen sind Erwachsene (18+).
- Nutze kurze englische Stichworte, keine ganzen Sätze, keine Texte/Schrift im Bild.
- Berücksichtige Feedback-Korrekturen vorrangig.
Antworte NUR mit JSON: {"scene":"","action":"","camera":"","lighting":"","outfit":""}
```

## 5. TypeScript-Skelett

```ts
export async function composeImagePrompt(
  sheet: CharacterSheet, style: StyleSelection, ctx: SceneContext,
  fb: FeedbackCorrections, llm: (system: string, user: string) => Promise<string>,
): Promise<ComposedPrompt> {
  let parts = { scene: ctx.sceneHint ?? '', action: '', camera: '', lighting: '', outfit: ctx.outfitOverride ?? '' };
  try {
    const raw = await llm(COMPOSER_SYSTEM, JSON.stringify({ style, ctx, fb }));
    parts = { ...parts, ...JSON.parse(raw.match(/\{[\s\S]*\}/)![0]) };
  } catch { /* Fallback: heuristische Szene wie heute (pickAngle, outfitFor) */ }
  const w = (s: string, x: number) => (s ? `(${s}:${x})` : '');
  const prompt = [w(parts.scene + ', ' + parts.action, 1.35), w(parts.camera, 1.25), parts.lighting,
    parts.outfit, sheet.identity, sheet.faceDetails, styleText(style), fb.positive, 'no text']
    .filter(Boolean).join(', ');
  const negative = [NEG_SINGLE, fb.negative].filter(Boolean).join(', ');
  return { prompt, negative, seed: sheet.seed ?? fb.goodSeed ?? undefined, refImage: !!sheet.faceRefId, debug: parts };
}
```

Einbau: `generateImageInChat()` ruft `composeImagePrompt()` statt der manuellen Verkettung; Ergebnis landet wie heute in `ph.gen` (für „Ähnlich“ und Feedback).

## 6. Umsetzung per Claude API

1. Repo-Ausschnitt (dieses Dokument + `apps/chat/chat.js` `generateImageInChat`, `apps/chat/profiles.js` `buildImagePrompt`, `functions/api/image.ts`) als Kontext mitgeben.
2. Auftrag: „Implementiere `composeImagePrompt` gemäß Entwurf als `apps/chat/composer.js`, binde es in `generateImageInChat` ein, Fallback auf bisherige Logik, keine Änderungen an Nutzer-Presets.“
3. Aufruf (Schlüssel nur als Umgebungsvariable, nie im Code):

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-5","max_tokens":8000,
       "messages":[{"role":"user","content":"<Entwurf + Code-Ausschnitte + Auftrag>"}]}'
```

4. Antwort als Patch prüfen, `npm run typecheck && npm test`, lokal mit `npm run dev` testen, dann deployen.
