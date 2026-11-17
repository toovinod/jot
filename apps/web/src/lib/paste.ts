import type { Editor } from "@tiptap/react";
import type { DocNode } from "@jot/contracts";
import { safeUrl } from "./utils";
const allowedAttributes = new Set([
  "href",
  "src",
  "alt",
  "title",
  "colspan",
  "rowspan",
  "start",
  "data-type",
  "data-checked",
]);
/** Keep common clipboard semantics before the editor schema parses the resulting HTML. */
export function cleanClipboardHTML(html: string): { html: string; warning: string | null } {
  const document = new DOMParser().parseFromString(html, "text/html");
  const unsupportedImages = Array.from(document.querySelectorAll("img")).filter(
    (img) => !safeUrl(img.getAttribute("src"), true),
  );
  unsupportedImages.forEach((img) => img.remove());
  document
    .querySelectorAll("script,style,iframe,video,audio,object,embed,svg,math")
    .forEach((node) => node.remove());
  document
    .querySelectorAll("form,button")
    .forEach((node) => node.replaceWith(...Array.from(node.childNodes)));
  // Office and Google Docs often put formatting on spans rather than semantic tags.
  document.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    let node = element;
    if (
      (["B", "STRONG"].includes(node.tagName) &&
        /^(normal|[1-5]00)$/.test(node.style.fontWeight)) ||
      (["I", "EM"].includes(node.tagName) && node.style.fontStyle === "normal")
    ) {
      const neutral = document.createElement("span");
      neutral.setAttribute("style", node.getAttribute("style") || "");
      neutral.append(...Array.from(node.childNodes));
      node.replaceWith(neutral);
      node = neutral;
    }
    const weight = node.style.fontWeight;
    const decoration = `${node.style.textDecoration} ${node.style.textDecorationLine}`;
    const tags = [
      /^(bold|bolder|[6-9]00)$/.test(weight) ? "strong" : "",
      /italic|oblique/.test(node.style.fontStyle) ? "em" : "",
      /underline/.test(decoration) ? "u" : "",
      /line-through/.test(decoration) ? "s" : "",
    ].filter(Boolean);
    for (const tag of tags) {
      const mark = document.createElement(tag);
      mark.append(...Array.from(node.childNodes));
      node.append(mark);
    }
  });
  document.querySelectorAll<HTMLInputElement>('li input[type="checkbox"]').forEach((input) => {
    const item = input.closest("li");
    if (!item) return;
    item.setAttribute("data-type", "taskItem");
    item.setAttribute("data-checked", String(input.checked));
    item.parentElement?.setAttribute("data-type", "taskList");
  });
  document.querySelectorAll("input").forEach((node) => node.remove());
  document.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      if (!allowedAttributes.has(attribute.name)) node.removeAttribute(attribute.name);
      if (
        ["href", "src"].includes(attribute.name) &&
        !safeUrl(attribute.value, attribute.name === "src")
      )
        node.removeAttribute(attribute.name);
    }
  });
  return {
    html: document.body.innerHTML,
    warning: unsupportedImages.length
      ? "Some clipboard images could not be imported. Upload the original image files to keep them."
      : null,
  };
}
export function looksLikeMarkdown(text: string) {
  return /(^|\n)(#{1,6} |```|[-*+] |\d+\. |> |\|.+\|)|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)/.test(text);
}

/** Code editors such as VS Code copy styled spans rather than structure. When the HTML has no
 * structure of its own and the plain text reads as Markdown, the text is what was meant. */
export function pasteAsMarkdown(html: string, text: string) {
  if (!text || !looksLikeMarkdown(text)) return false;
  if (!html) return true;
  const document = new DOMParser().parseFromString(html, "text/html");
  return !document.querySelector("h1,h2,h3,h4,h5,h6,ul,ol,li,table,a,pre,blockquote,img");
}

export type ClipboardPayload = { html: string; text: string; attachmentCount: number };
/** Keep clipboard text and remote images. Attachments may duplicate refs whose pairing is unknown. */
export function insertClipboardContent(
  editor: Pick<Editor, "commands">,
  payload: ClipboardPayload,
): string | null {
  const source = payload.html;
  const result = source ? cleanClipboardHTML(source) : { html: "", warning: null };
  if (result.html.trim()) editor.commands.insertContent(result.html, { contentType: "html" });
  else if (payload.text) {
    const paragraphs: DocNode[] = payload.text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((text) => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] }));
    editor.commands.insertContent(paragraphs);
  }
  return payload.attachmentCount
    ? "Text and supported formatting are kept. Clipboard attachments are uploaded after the pasted text; check their position. Remote images remain linked and may duplicate an attachment."
    : result.warning;
}
