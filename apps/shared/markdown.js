// Minimal, safe markdown -> HTML (escape first). Supports code, headings, bold/italic, *,-,+ and 1. lists, links.
export function renderMarkdown(text) {
  const src = String(text ?? '').replace(/\r\n?/g, '\n');
  const blocks = [];
  let s = src.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_, code) => { blocks.push(`<pre><code>${esc(code.replace(/\n$/, ''))}</code></pre>`); return `\u0000B${blocks.length - 1}\u0000`; });
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of s.split('\n')) {
    let m;
    if ((m = line.match(/^\s*[*+-]\s+(.*)$/)) && !/^\s*([*-])\s*\1\s*\1\s*$/.test(line)) {
      if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    close();
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { const n = Math.min(m[1].length + 2, 6); out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line)) { out.push('<hr>'); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    out.push(line.trim() === '' ? '<br>' : inline(line) + '<br>');
  }
  close();
  return out.join('').replace(/(<br>)+$/, '').replace(/\u0000B(\d+)\u0000(<br>)?/g, (_, i) => blocks[+i]);
}
function inline(t) {
  let h = esc(t);
  const codes = [];
  h = h.replace(/`([^`]+)`/g, (_, c) => { codes.push(`<code>${c}</code>`); return `\u0001${codes.length - 1}\u0001`; });
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '$1<em>$2</em>').replace(/(^|\W)_(?!\s)(.+?)(?<!\s)_(?=\W|$)/g, '$1<em>$2</em>');
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return h.replace(/\u0001(\d+)\u0001/g, (_, i) => codes[+i]);
}
function esc(t) { return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
