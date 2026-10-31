// v82 C1: Text für die Sprachausgabe säubern (rein, Node-testbar).

export function cleanForTTS(text) {
  let s = String(text ?? '');
  // abschließende Foto-/Bildzeile
  s = s.replace(/\[\s*(?:FOTO|BILD|PHOTO)\s*:?[^\]]*\]?\s*$/i, '');
  // Codeblöcke
  s = s.replace(/```[\s\S]*?```/g, ' (Codebeispiel) ');
  s = s.replace(/```[\s\S]*$/g, ' (Codebeispiel) ');
  // Inline-Code: Backticks weg, Text bleibt
  s = s.replace(/`([^`]*)`/g, '$1');
  // fett mit doppelten Markern -> nur Text (vor den Regieanweisungen)
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '$1');
  s = s.replace(/(?<![\p{L}\p{N}_])__([^_\n]+)__(?![\p{L}\p{N}_])/gu, '$1');
  // Regieanweisungen in einfachen Sternchen/Unterstrichen komplett entfernen (nicht in snake_case oder 2 * 3 * 4)
  s = s.replace(/(?<![\p{L}\p{N}*])\*(?![\s*])([^*\n]{1,300}?)(?<!\s)\*(?![\p{L}\p{N}*])/gu, ' ');
  s = s.replace(/(?<![\p{L}\p{N}_])_(?![\s_])([^_\n]{1,300}?)(?<!\s)_(?![\p{L}\p{N}_])/gu, ' ');
  // Links
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // nackte URLs
  s = s.replace(/\b(?:https?:\/\/|www\.)\S+/gi, '(Link)');
  // Markdown-Zeilenmarker
  s = s.replace(/^\s{0,3}#{1,6}\s*/gm, '');
  s = s.replace(/^\s{0,3}>\s?/gm, '');
  s = s.replace(/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/gm, '');
  // Tabellen-Pipes
  s = s.replace(/\s*\|\s*/g, ' ');
  s = s.replace(/^\s*:?-{2,}:?\s*$/gm, '');
  // Emojis
  s = s.replace(/\p{Extended_Pictographic}/gu, '');
  s = s.replace(/\p{Regional_Indicator}{1,2}/gu, '');
  s = s.replace(/[\uFE0F\u200D\u20E3]/g, '');
  s = s.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');
  // Normalisieren
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/ *\n */g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}
