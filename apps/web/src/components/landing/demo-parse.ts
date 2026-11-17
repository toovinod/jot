export type DemoBlock = {
  kind: "h1" | "h2" | "p" | "li" | "ol" | "todo" | "code";
  text: string;
  done?: boolean;
  /** The number an ordered list item was written with. */
  n?: number;
};

// Every sample post is well under this, so none of them is cut. Only pastes past it are trimmed.
export const DEMO_LIMIT = 12000;

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
    else if (/^\d{1,9}[.)] /.test(trimmed)) {
      const marker = trimmed.indexOf(" ");
      blocks.push({ kind: "ol", text: trimmed.slice(marker).trim(), n: parseInt(trimmed, 10) });
    } else blocks.push({ kind: "p", text: trimmed });
  }
  if (code) blocks.push({ kind: "code", text: code.join("\n") });
  return blocks;
}

/** The first "# " heading outside code, without parsing the whole note. */
export function demoTitle(input: string) {
  let code = false;
  for (const line of input.slice(0, DEMO_LIMIT).split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) code = !code;
    else if (!code && trimmed.startsWith("# ")) return trimmed.slice(2).trim();
  }
  return "";
}
