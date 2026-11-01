// v87b: Wunsch-Outfit/-Pose ersetzt gespeicherte Auswahl (Marie), Solo-Nackt-Widerspruch, 1500-Zeichen-Grenze, Porträt
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImagePlan } from '../src/imgsvc-core.js';
import { wishOutfitText, wishPoseText, condenseOutfit } from '../src/promptapp/wish.js';
import { formatPrompt } from '../src/promptapp/format.js';

const LONG_OUTFIT = 'nude, straight barbell nipple piercings with small silver balls on both nipples, clearly visible as distinct bumps through the thin fabric, plus a christina piercing with silver ball at the top of the pubic mound, visible above the bikini bottom edge, tiny micro bikini top, a lot of sideboob and underboob visible, tiny string micro bikini, minuscule triangles barely the size of a nipple, sideboob, underboob, thong string bottom, cameltoe, labia outline visible through the tight fabric, glossy latex sheen, crisp fabric detail, separate top and bottom, visible waistline';
const PROFILE = { id: 'seraphina', name: 'Seraphina', persona: { look: { age: 34, hair: 'long black hair in a high sleek ponytail' }, figur: { groesse: '185 cm', statur: 'curvy hourglass figure' } } };
const resolvedWith = (photo = {}) => ({
  identity: 'adult woman, looks exactly 34 years old, long black hair in a high sleek ponytail, dark defined brows, full lips, glasses, elegant refined fashion, tailored fitted pieces, graceful, tanned skin, 185 cm tall, curvy hourglass figure, softly rounded hips, small A-cup bust',
  defaults: { expression: 'warm smile' },
  photo: { outfit: LONG_OUTFIT, pose: 'sitting on the edge of the bed, legs spread, leaning back on both hands, relaxed and inviting', intensity: '', frame: '', scene: '', ...photo },
});
const plan = (body, photo, story = null) => buildImagePlan({ profile: PROFILE, resolved: resolvedWith(photo), prevStory: story, body: { profile: 'seraphina', conversationId: 't', seedMode: 'same', preview: true, ...body }, composeLLM: null, rnd: () => 0.5 });
const outfitOf = (p) => (p.split('Outfit: ')[1] || '').split('. ')[0];
const poseOf = (p) => (p.split('Camera and pose: ')[1] || '').split('. ')[0];

test('v87b Erkennung: Wunsch-Outfit und -Pose aus deutschem Wunschtext', () => {
  assert.equal(wishOutfitText('am Strand im knappen roten Micro-Bikini, sie steht knietief im Meer'), 'red micro bikini');
  assert.equal(wishOutfitText('sie kniet auf dem Bett in schwarzer Spitzen-Lingerie mit Strapsen'), 'black lace lingerie with garter belt and stockings');
  assert.equal(wishOutfitText('im blauen Sommerkleid in der Bibliothek'), 'blue summer dress');
  assert.equal(wishOutfitText('sie ist nackt auf dem Sofa'), 'nude');
  assert.equal(wishOutfitText('Nahaufnahme von Kopf und Schultern'), '');
  assert.equal(wishOutfitText('am Pool, ohne Bikini'), '');
  assert.equal(wishPoseText('sie kniet auf dem Bett'), 'kneeling');
  assert.match(wishPoseText('sie steht knietief im Meer'), /knee-deep/);
  assert.equal(wishPoseText('im roten Kleid am Strand'), '');
});

test('v87b hemmungslos: Wunsch-Outfit ERSETZT die gespeicherte Kleidung komplett (nicht angehängt), Wunsch-Pose ersetzt gespeicherte Pose', async () => {
  const p = await plan({ style: 'real', adult: true, quality: 'spar', context: { scene: 'Seraphina im Schlafzimmer, sie kniet auf dem Bett in schwarzer Spitzen-Lingerie mit Strapsen, gedimmtes Licht', messages: [] } });
  assert.ok(!p.error, JSON.stringify(p.error));
  const o = outfitOf(p.prompt);
  assert.match(o, /black lace lingerie/);
  assert.ok(!/micro bikini|piercing|cameltoe|thong|bikini top/i.test(p.prompt), p.prompt);
  assert.match(poseOf(p.prompt), /^kneeling/);
  assert.ok(!/edge of the bed|legs spread/i.test(poseOf(p.prompt)), p.prompt);
  assert.ok(p.abgleich.some((n) => /Bild-Wunsch.*ersetzt die gespeicherte Auswahl/.test(n)), JSON.stringify(p.abgleich));
});

test('v87b jugendfrei: Wunsch-Outfit ersetzt gespeicherte Kleidung; freizügiger Wunsch wird weiter jugendfrei ersetzt', async () => {
  const ok = await plan({ style: 'real', adult: false, quality: 'spar', context: { scene: 'Seraphina in der Bibliothek im blauen Sommerkleid, sie steht zwischen den Bücherregalen', messages: [] } }, { outfit: 'grey wool sweater, black jeans' });
  assert.match(outfitOf(ok.prompt), /blue summer dress/);
  assert.ok(!/sweater|jeans/.test(ok.prompt), ok.prompt);
  const bad = await plan({ style: 'real', adult: false, quality: 'spar', context: { scene: 'Seraphina am Strand im roten Micro-Bikini', messages: [] } }, { outfit: 'grey wool sweater, black jeans' });
  assert.ok(!bad.error, JSON.stringify(bad.error));
  assert.ok(!/bikini|nude|topless|sideboob|cameltoe/i.test(outfitOf(bad.prompt)), bad.prompt);
  assert.match(bad.negative, /nude/);
});

test('v87b einmalige Auswahl für genau dieses Bild (photoOverride) schlägt den Wunschtext weiterhin', async () => {
  const p = await plan({ style: 'real', adult: true, quality: 'spar', photoOverride: { outfit: 'white summer dress' }, context: { scene: 'Seraphina am Strand im roten Bikini', messages: [] } });
  assert.match(outfitOf(p.prompt), /white summer dress/);
  assert.ok(!/red bikini/.test(p.prompt));
});

test('v87b Porträt + Wunsch-Outfit: Wunsch gilt, Porträt-Ausschnitt/-Pose gewinnt; ohne Wunsch keine Unterkörper-Details', async () => {
  const w = await plan({ style: 'real', adult: true, quality: 'spar', context: { scene: 'Porträt von Seraphina im roten Sommerkleid, Nahaufnahme von Kopf und Schultern, sie lächelt', messages: [] } });
  assert.match(w.prompt, /^Framing: close-up portrait/);
  assert.match(outfitOf(w.prompt), /red summer dress/);
  assert.ok(!/bikini|piercing/i.test(w.prompt), w.prompt);
  assert.match(poseOf(w.prompt), /^head and shoulders/);
  const n = await plan({ style: 'real', adult: true, quality: 'spar', context: { scene: 'Porträt von Seraphina: Nahaufnahme von Kopf und Schultern, sie lächelt', messages: [] } });
  assert.ok(!/thong|cameltoe|labia|pubic|string bottom/i.test(n.prompt), n.prompt);
  assert.ok(!/legs spread/.test(n.prompt));
});

test('v87b (1) Solo: gespeicherte Auswahl nennt „nude“ → kein nude/topless im Negativ und kein erzwungenes „bikini top worn“', async () => {
  for (const quality of ['spar', 'mittel', 'qualitaet', 'single']) {
    const p = await plan({ style: 'real', adult: true, quality, context: { scene: 'Seraphina in ihrer Wohnung, warmes Abendlicht', messages: [] } });
    assert.ok(!p.error, JSON.stringify(p.error));
    assert.ok(!/\b(nude|topless|bare breasts)\b/i.test(p.negative), quality + ': ' + p.negative);
    assert.ok(!/bikini top worn/i.test(p.prompt), quality + ': ' + p.prompt);
    assert.match(p.negative, /second person/);
  }
  // echter Bikini ohne Nacktheit in der Auswahl: Oberteil-Tag + nude im Negativ bleiben
  const b = await plan({ style: 'real', adult: true, quality: 'spar', context: { scene: 'Seraphina am Strand im roten Bikini', messages: [] } });
  assert.match(b.prompt, /bikini top worn/);
  assert.match(b.negative, /\bnude\b/);
});

test('v87b (2) Länge: z-image/qwen/flux ≤ 1500 Zeichen, sauberes Ende, Szene/Stil/Personen vor dem Outfit', async () => {
  const scenes = [
    { style: 'real', scene: 'Seraphina sitzt am Strand im Sand, Sonnenuntergang, Wellen' },
    { style: 'comic', scene: 'Comic-Panel: Seraphina nachts allein im Büro, sie sitzt auf dem Schreibtisch, Tusche-Comicstil' },
    { style: 'real', scene: 'Seraphina im Schlafzimmer, gedimmtes Licht' },
  ];
  const longId = resolvedWith().identity + ', ' + 'freckles across the nose, a small mole above the lip, subtle smile lines, '.repeat(6);
  for (const quality of ['spar', 'mittel', 'qualitaet']) for (const s of scenes) {
    const r = await buildImagePlan({ profile: PROFILE, resolved: { ...resolvedWith(), identity: longId }, body: { profile: 'seraphina', conversationId: 't', seedMode: 'same', preview: true, style: s.style, adult: true, quality, context: { scene: s.scene, messages: [] } }, composeLLM: null, rnd: () => 0.5 });
    assert.ok(!r.error, JSON.stringify(r.error));
    assert.notEqual(r.route.model, 'chroma');
    assert.ok(r.prompt.length <= 1500, `${quality}/${s.style}: ${r.prompt.length}`);
    assert.match(r.prompt, /[a-z)]\.$/, 'Ende: ' + r.prompt.slice(-40));
    assert.ok(!/\b(no|a|the|with|and|of|in)\.$/.test(r.prompt), 'Fragment am Ende: ' + r.prompt.slice(-40));
    const iOut = r.prompt.indexOf('Outfit:');
    if (iOut > 0) {
      assert.ok(r.prompt.indexOf('Scene:') > 0 && r.prompt.indexOf('Scene:') < iOut, 'Szene vor Outfit');
      assert.ok(r.prompt.indexOf('looks exactly 34') < iOut, 'Alter vor Outfit');
      if (s.style === 'comic') assert.ok(r.prompt.indexOf('Style:') < iOut, 'Stil vor Outfit');
      assert.ok(outfitOf(r.prompt).length <= 330, 'Outfit gekürzt: ' + outfitOf(r.prompt).length);
    }
  }
});

test('v87b Kürzung: condenseOutfit/formatPrompt schneiden nur ganze Segmente', () => {
  const c = condenseOutfit(LONG_OUTFIT, { max: 250 });
  assert.ok(c.text.length <= 250, c.text.length);
  assert.match(c.text, /micro bikini top/);
  for (const seg of c.text.split(', ')) assert.ok(LONG_OUTFIT.includes(seg.replace(/^a christina/, 'plus a christina')), seg);
  const f = formatPrompt('z-image-turbo', { framing: 'full body shot', identity: 'adult woman, looks exactly 30 years old', scene: 'beach', outfitText: 'bikini', pose: Array.from({ length: 200 }, (_, i) => 'pose detail ' + i).join(', '), quality: 'high detail, sharp focus, no text, no letters' });
  assert.ok(f.prompt.length <= 1500, f.prompt.length);
  assert.match(f.prompt, /Scene: beach\. Outfit: bikini\./);
  assert.match(f.prompt, /pose detail \d+\.$/);
  assert.ok(!/no text, no$/.test(f.prompt));
});
