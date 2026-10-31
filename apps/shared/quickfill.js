// v64: fewer typing – a "📋 Vorlage wählen" dropdown in front of free-text fields. Picking appends to the text
// (never replaces what is already there); free text stays usable as the fallback.
export const PRESETS = {
  'p-desc': ['Fröhliche Freundin zum Plaudern', 'Flirtende Begleiterin mit Humor', 'Ruhige, einfühlsame Zuhörerin', 'Abenteuerlustige Reisepartnerin', 'Spanischlehrerin mit Witz'],
  'look-details': ['Sommersprossen', 'Muttermal an der Wange', 'kleines Tattoo am Handgelenk', 'Grübchen beim Lächeln', 'Brille mit dünnem Rahmen', 'Ohrringe aus Gold', 'gebräunte Haut'],
  'me-kleidung': ['Jeans und T-Shirt', 'Hemd und Chino', 'Anzug', 'Sportkleidung', 'Shorts und Leinenhemd', 'Pullover und Jeans'],
  'me-besonderes': ['Bart', 'Dreitagebart', 'Brille', 'Tattoo am Arm', 'graue Schläfen', 'Glatze'],
  'imgfb-t': ['Gesicht passt nicht', 'Haare falsch', 'Kleidung falsch', 'falsche Umgebung', 'Hände/Finger verformt', 'zu dunkel', 'Pose passt nicht', 'sieht nicht wie sie aus'],
  'cm-story': ['Sie bestellt in einer Bar in Valencia Tapas und versteht die Kellnerin falsch', 'Ein Ausflug an den Strand mit Picknick', 'Ein Abend im Restaurant mit Kerzenlicht', 'Zufälliges Treffen im Supermarkt', 'Spaziergang durch die Altstadt von Madrid', 'Ein verregneter Abend auf dem Sofa'],
  'own-scene-input': ['am Strand bei Sonnenuntergang', 'in einem Café in Madrid', 'auf einer Dachterrasse bei Nacht', 'im Park im Herbst', 'in einer gemütlichen Küche', 'am Pool im Sommer'],
};
export function quickfill(root = document, ids = Object.keys(PRESETS)) {
  for (const id of ids) {
    const el = root.querySelector('#' + id); if (!el || el.dataset.qf) continue; el.dataset.qf = '1';
    const sel = document.createElement('select'); sel.className = 'qf-select'; sel.setAttribute('aria-label', 'Vorlage wählen');
    sel.innerHTML = '<option value="">📋 Vorlage wählen …</option>' + PRESETS[id].map((p) => `<option>${p.replace(/</g, '&lt;')}</option>`).join('');
    sel.style.cssText = 'display:block;width:100%;margin:2px 0 4px;font-size:16px';
    sel.addEventListener('change', () => { const v = sel.value; if (!v) return; const cur = el.value.trim(); const max = +el.getAttribute('maxlength') || 4000; el.value = (cur ? (cur.includes(v) ? cur : cur + ', ' + v) : v).slice(0, max); sel.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
    el.parentNode.insertBefore(sel, el);
  }
}
