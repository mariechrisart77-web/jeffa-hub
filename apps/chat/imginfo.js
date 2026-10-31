export function imgInfoHtml(gen, esc, id = '') {
  if (!gen) return '';
  const model = gen.model || '?';
  const cost = typeof gen.cost === 'number' ? gen.cost.toFixed(2).replace('.', ',') : '?';
  const seed = gen.seed ?? '?';
  const scene = gen.llmScene || '';
  const sceneError = gen.sceneError || '';
  const prompt = gen.prompt || '';
  
  const sceneWarn = sceneError ? `<div class="img-warn">⚠️ Szene nicht erstellt – Rohtext verwendet</div>` : '';
  const sceneBlock = scene ? `<div><strong>Szene:</strong> ${esc(scene)}</div>` : '';
  const promptTrunc = prompt.length > 600 ? prompt.slice(0, 600) + '…' : prompt;
  const promptBlock = prompt ? `<div><strong>Prompt:</strong> ${esc(promptTrunc)}</div>` : '';
  const negative = gen.negative || '';
  const negativeBlock = negative ? `<div><strong>Negative:</strong><pre style="white-space:pre-wrap">${esc(negative.slice(0, 600))}${negative.length > 600 ? '…' : ''}</pre></div>` : '';
  const notes = Array.isArray(gen.notes) ? gen.notes : (Array.isArray(gen.abgleich) ? gen.abgleich : []);
  const notesBlock = notes.length ? `<div><strong>Abgleich:</strong><ul>${notes.map((n) => `<li>${esc(String(n))}</li>`).join('')}</ul></div>` : '';
  const check = gen.check ? `<div><strong>Check:</strong> ${gen.check.first?.pass === false ? '⚠️ ' + esc(JSON.stringify(gen.check.first).slice(0, 240)) : '✓ OK'}</div>` : '';
  const copyBtn = prompt ? `<button class="chip" data-action="copyprompt" data-id="${esc(String(id))}" style="margin-top:4px">📋 Prompt kopieren</button>` : '';
  
  return `<details class="img-info"><summary>ℹ️ ${esc(model)} · ${cost} $ · Seed ${esc(String(seed))}</summary>${sceneWarn}${sceneBlock}${promptBlock}${negativeBlock}${notesBlock}${check}${copyBtn}</details>`;
}

export function nextAngle(cur, list) {
  if (!Array.isArray(list) || list.length === 0) return cur;
  const idx = list.indexOf(cur);
  if (idx < 0) return list[0];
  return list[(idx + 1) % list.length];
}
