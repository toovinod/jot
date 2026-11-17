/** Strips Markdown markers from one line, so "# **Slow** mornings" reads "Slow mornings". */
export function plainLine(line: string) {
  return line
    .replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|`)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_]([^*_\s][^*_]*)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits a paste of several lines into its first line, as plain text for a title or subtitle,
 * and the rest, kept as Markdown for the page. A single line returns null and pastes as usual.
 */
export function splitPaste(text: string): { first: string; rest: string } | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const index = lines.findIndex((line) => line.trim());
  if (index < 0) return null;
  const after = lines.slice(index + 1);
  while (after.length && !after[0]!.trim()) after.shift();
  const rest = after.join("\n").trimEnd();
  return rest ? { first: plainLine(lines[index]!), rest } : null;
}

/**
 * What a paste into a field of `limit` characters leaves in it. `value` is the field's text and
 * `start`/`end` its selection. Returns null when the browser's own paste is right: one line that
 * fits. Otherwise returns the new value, the caret, the Markdown meant for the page, and whether
 * the field's limit cut the text short.
 */
export function pasteIntoField(
  value: string,
  start: number,
  end: number,
  text: string,
  limit: number,
): { value: string; caret: number; rest: string; clipped: boolean } | null {
  const split = splitPaste(text);
  const insert = split ? split.first : text.replace(/\r?\n/g, " ");
  const before = value.slice(0, start),
    after = value.slice(end);
  const room = Math.max(0, limit - before.length - after.length);
  if (!split && insert.length <= room) return null;
  const kept = insert.slice(0, room);
  return {
    value: before + kept + after,
    caret: before.length + kept.length,
    rest: split?.rest ?? "",
    clipped: kept.length < insert.length,
  };
}
