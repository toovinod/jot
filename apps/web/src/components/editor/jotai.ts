import type { Editor } from "@tiptap/react";
import { closeHistory } from "@tiptap/pm/history";
import type { Slice } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { aiChatLimits, type AIChatResult, type AIChatTurn, type DocNode } from "@jot/contracts";
import { markdownBody } from "./editor-controller";

/** The mention that turns a line in the prompt box into a question for jot ai. */
export const mention = "@jotai";
const mentionPattern = /(^|\s)@jotai(?![\w-])/gi;

export const hasMention = (value: string) => new RegExp(mentionPattern.source, "i").test(value);
/** The question without its mention: "@jotai make it shorter" asks "make it shorter". */
export const withoutMention = (value: string) =>
  value.replace(mentionPattern, "$1").replace(/\s+/g, " ").trim();

/** An "@" being typed at the caret that could still become @jotai, with where it starts. */
export function mentionAt(value: string, caret: number) {
  const match = /(^|\s)@(\w*)$/.exec(value.slice(0, caret));
  if (!match || !"jotai".startsWith(match[2]!.toLowerCase())) return null;
  return { start: caret - match[2]!.length - 1, end: caret };
}

export const byteLength = (value: string) => new TextEncoder().encode(value).length;
/** The first `limit` bytes of a string in UTF-8, without a broken character at the end. */
export function clipBytes(value: string, limit: number) {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length <= limit) return value;
  return new TextDecoder().decode(bytes.slice(0, limit)).replace(/�+$/, "");
}

export const countWords = (value: string) =>
  value.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;

/** The finished exchanges, newest last, trimmed to the turns and bytes a chat may send. */
export function chatHistory(exchanges: { prompt: string; reply?: string }[]): AIChatTurn[] {
  return exchanges
    .flatMap((item): AIChatTurn[] => [
      { role: "user", content: item.prompt },
      { role: "assistant", content: item.reply || "" },
    ])
    .slice(-aiChatLimits.turns)
    .map((turn) => ({ ...turn, content: clipBytes(turn.content, aiChatLimits.turn) }));
}

/** A finished chat job's result; a reply that isn't the expected JSON still reads as a reply. */
export function readResult(result: string | undefined): AIChatResult {
  try {
    const value = JSON.parse(result || "");
    if (value && typeof value.reply === "string") {
      const text = (key: string) => (typeof value[key] === "string" ? value[key] : null);
      return {
        reply: value.reply,
        edit: text("edit"),
        title: text("title"),
        subtitle: text("subtitle"),
      };
    }
  } catch {}
  return { reply: result || "", edit: null, title: null, subtitle: null };
}

type PageDoc = Editor["state"]["doc"];
/** What a chat is about: the page, or the selected range with what it held when asked, marks and
 * all. The range moves with the page (see followTarget); `doc` is the page it last moved over. */
export type ChatTarget =
  { scope: "page" } | { scope: "selection"; from: number; to: number; slice: Slice; doc: PageDoc };

const rangeText = (editor: Editor, from: number, to: number) =>
  editor.state.doc.textBetween(from, to, "\n\n", " ");

/** The selected part of the page as Markdown, or the whole page when nothing is selected. */
export function chatTarget(editor: Editor): { target: ChatTarget; text: string } {
  const { doc, selection } = editor.state;
  const { from, to, empty } = selection;
  if (empty || !rangeText(editor, from, to).trim())
    return { target: { scope: "page" }, text: markdownBody(editor.getJSON() as DocNode) };
  const slice = doc.slice(from, to);
  return {
    target: { scope: "selection", from, to, slice, doc },
    text: markdownBody({ type: "doc", content: slice.content.toJSON() as DocNode[] }),
  };
}

/** Moves a selection's range over changes to the page, the way they move its text. A range that
 * missed a change stays on the page it last saw, so it no longer holds (see targetHolds). */
export function followTarget(target: ChatTarget, transactions: readonly Transaction[]) {
  if (target.scope !== "selection") return;
  for (const tr of transactions) {
    if (tr.before !== target.doc) return;
    // Text typed right at either edge stays outside the range.
    target.from = tr.mapping.map(target.from, 1);
    target.to = tr.mapping.map(target.to, -1);
    target.doc = tr.doc;
  }
}
/** Picks a range up on a new editor over the same page, as when the page opens again. */
export function rebaseTarget(target: ChatTarget, doc: PageDoc) {
  if (target.scope === "selection" && target.doc !== doc && target.doc.eq(doc)) target.doc = doc;
}

/** Whether the page still holds what was asked about: the same content, marks and all, in the
 * selected range as it moved, or the same page when the whole page was sent. */
export function targetHolds(editor: Editor, target: ChatTarget, sent: string) {
  if (target.scope === "page") return markdownBody(editor.getJSON() as DocNode) === sent;
  const { doc } = editor.state;
  return (
    target.doc === doc &&
    target.from < target.to &&
    doc.slice(target.from, target.to).eq(target.slice)
  );
}

/** The parsed edit opened at its first and last text blocks, the way a copied selection is, so
 * a sentence replaced inside a paragraph joins the text around it instead of splitting it. */
function openSlice(doc: PageDoc) {
  let start = 0,
    end = doc.content.size,
    node = doc;
  while (!node.isTextblock && node.firstChild && !node.firstChild.isLeaf) {
    node = node.firstChild;
    start++;
  }
  node = doc;
  while (!node.isTextblock && node.lastChild && !node.lastChild.isLeaf) {
    node = node.lastChild;
    end--;
  }
  return doc.slice(start, Math.max(start, end));
}

/**
 * Replaces the selected range, or the whole page, with Markdown in one transaction, so a single
 * undo restores it and the editor's update reaches autosave like any typing. It is an undo step of
 * its own: typing just before or after it never joins it.
 */
export function replaceWithMarkdown(editor: Editor, target: ChatTarget, markdown: string) {
  const parsed = editor.schema.nodeFromJSON(editor.markdown!.parse(markdown));
  const applied = editor
    .chain()
    .command(({ tr }) => {
      closeHistory(tr);
      if (target.scope === "selection") tr.replace(target.from, target.to, openSlice(parsed));
      else
        tr.replaceWith(
          0,
          tr.doc.content.size,
          parsed.content.size ? parsed.content : editor.schema.nodes.paragraph!.create(),
        );
      return true;
    })
    .run();
  editor.view.dispatch(closeHistory(editor.state.tr));
  return applied;
}
