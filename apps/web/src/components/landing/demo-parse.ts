export type DemoBlock = {
  kind: "h1" | "h2" | "p" | "li" | "todo" | "code";
  text: string;
  done?: boolean;
};

export const DEMO_LIMIT = 2000;

export const SAMPLE_NOTE = `# slow mornings
i stopped checking my phone before nine.
- coffee first
- a walk, no podcast
- [x] write one page
- [ ] add the photo from the lake
\`\`\`js
const day = slow("coffee first")
\`\`\``;

/** A tiny Markdown-ish parser for the landing demo. Output is plain text, never HTML. */
export function parseDemoNote(input: string): DemoBlock[] {
  const blocks: DemoBlock[] = [];
  let code: string[] | null = null;
  for (const line of input.slice(0, DEMO_LIMIT).split("\n")) {
    if (code) {
      if (line.trim().startsWith("```")) {
        blocks.push({ kind: "code", text: code.join("\n") });
        code = null;
      } else code.push(line);
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("```")) code = [];
    else if (trimmed.startsWith("## ")) blocks.push({ kind: "h2", text: trimmed.slice(3).trim() });
    else if (trimmed.startsWith("# ")) blocks.push({ kind: "h1", text: trimmed.slice(2).trim() });
    else if (/^[-*] \[[ xX]\] /.test(trimmed))
      blocks.push({ kind: "todo", text: trimmed.slice(6).trim(), done: trimmed[3] !== " " });
    else if (/^[-*] /.test(trimmed)) blocks.push({ kind: "li", text: trimmed.slice(2).trim() });
    else blocks.push({ kind: "p", text: trimmed });
  }
  if (code) blocks.push({ kind: "code", text: code.join("\n") });
  return blocks;
}
