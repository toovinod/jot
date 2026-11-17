import { common, createLowlight } from "lowlight";
import "./code-highlight.css";
/** One grammar set for the editor and the published page, so code is highlighted the same way. */
export const lowlight = createLowlight(common);

type Tree = ReturnType<typeof lowlight.highlight>;
// The published page detects only these, and only on short code, so the editor does the same.
const detectable = [
  "bash",
  "css",
  "go",
  "java",
  "javascript",
  "json",
  "python",
  "rust",
  "sql",
  "typescript",
  "xml",
  "yaml",
];
const plain = (text: string): Tree => ({
  type: "root",
  children: [{ type: "text", value: text }],
  data: { language: undefined, relevance: 0 },
});
const cache = new Map<string, Tree>();
function remember(key: string, make: () => Tree) {
  const hit = cache.get(key);
  if (hit) {
    // Move to the newest end so the blocks a writer is working in stay cached.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const tree = make();
  cache.set(key, tree);
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return tree;
}
/**
 * The highlighter the editor hands to Tiptap. Tiptap re-highlights every code block whenever any
 * one changes, so results are cached by text: typing in one block of a long post redoes only that
 * block. Size limits match the published page.
 */
export const editorLowlight = {
  ...lowlight,
  highlight: (language: string, text: string) =>
    text.length > 100_000
      ? plain(text)
      : remember(`${language}\n${text}`, () => lowlight.highlight(language, text)),
  highlightAuto: (text: string) =>
    text.length >= 10_000
      ? plain(text)
      : remember(`\n${text}`, () => lowlight.highlightAuto(text, { subset: detectable })),
};
