"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Markdown } from "@tiptap/markdown";
import { documentText, type DocNode } from "@jot/contracts";
import { isSupportedImage, uploadEditorImages } from "./image-import";
import { editorLowlight } from "./code-highlight";
import { LinkPopover } from "./link-popover";
import { FormatToolbar, SelectionMenu } from "./format-toolbar";
import { cleanClipboardHTML, insertClipboardContent, pasteAsMarkdown } from "@/lib/paste";
import { friendlyError } from "@/lib/errors";
import { safeUrl } from "@/lib/utils";
import { ErrorMessage } from "../ui/fields";
/** The editor's schema, shared with Markdown export so both read a draft the same way. */
export function editorExtensions() {
  return [
    StarterKit.configure({
      codeBlock: false,
      link: {
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
        isAllowedUri: (url, ctx) => !!safeUrl(url) && ctx.defaultValidate(url),
      },
    }),
    CodeBlockLowlight.configure({ lowlight: editorLowlight }),
    Image.configure({ allowBase64: false }),
    Placeholder.configure({ placeholder: "write" }),
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Markdown,
  ];
}
/** A Markdown file that opens with an H1 carries its title there, as Jot's own export writes it. */
export function markdownTitle(doc: DocNode): { title: string; rest: DocNode[] } | null {
  const [first, ...rest] = doc.content || [];
  if (first?.type !== "heading" || first.attrs?.level !== 1) return null;
  const title = documentText(first).replace(/\s+/g, " ").trim();
  return title ? { title, rest } : null;
}
// Long drafts hand their document over after a pause in typing, not on every keystroke: turning
// tens of thousands of nodes into JSON, copying it for the save queue and the recovery copy, and
// counting words would otherwise run on each key. Short drafts still hand it over at once.
const longDraft = 20_000; // ProseMirror positions, roughly three thousand words
const pause = 400;
const maxWait = 2000;
/**
 * Puts Markdown at the very top of the page, as parsed by the editor's own schema; an empty page
 * is replaced rather than left with a blank first line.
 */
export function prependMarkdown(editor: Editor, markdown: string) {
  const at = editor.isEmpty ? { from: 0, to: editor.state.doc.content.size } : 0;
  return editor.chain().insertContentAt(at, markdown, { contentType: "markdown" }).run();
}
/**
 * Puts Markdown at the very end of the page; an empty last line takes it instead of staying as a
 * gap above it.
 */
export function appendMarkdown(editor: Editor, markdown: string) {
  const { doc } = editor.state;
  const end = doc.content.size,
    last = doc.lastChild;
  const at =
    last?.type.name === "paragraph" && !last.content.size
      ? { from: end - last.nodeSize, to: end }
      : end;
  return editor.chain().insertContentAt(at, markdown, { contentType: "markdown" }).run();
}
export function RichEditor({
  document,
  onChange,
  disabled,
  beginPendingWork,
  isOperationBlocked,
  onImportTitle,
  registerFlush,
  toolbarSlot,
  editorRef,
}: {
  document: DocNode;
  onChange: (document: DocNode) => void;
  disabled: boolean;
  beginPendingWork: () => () => void;
  isOperationBlocked: () => boolean;
  /** Offered an imported file's H1; returns true when it became the draft's title. */
  onImportTitle?: (title: string) => boolean;
  /** Lets the owner pull a change still waiting for a pause; returns the unregister function. */
  registerFlush?: (flush: () => void) => () => void;
  /** Where the formatting toolbar renders: an element in the owner's strip over the page. Leave it
   * out to render the toolbar above the page; null holds it back until the element exists. */
  toolbarSlot?: HTMLElement | null;
  /** Receives the editor once it exists, so the owner can put text into the page. */
  editorRef?: RefObject<Editor | null>;
}) {
  const file = useRef<HTMLInputElement>(null),
    markdownFile = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [uploads, setUploads] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);

  const callbacks = useRef({
    onChange,
    disabled,
    beginPendingWork,
    isOperationBlocked,
    onImportTitle,
    registerFlush,
  });
  callbacks.current = {
    onChange,
    disabled,
    beginPendingWork,
    isOperationBlocked,
    onImportTitle,
    registerFlush,
  };
  const pending = useRef<{ doc: Editor["state"]["doc"]; since: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const change = pending.current;
    pending.current = null;
    if (change) callbacks.current.onChange(change.doc.toJSON() as DocNode);
  }, []);
  useEffect(() => {
    const unregister = callbacks.current.registerFlush?.(flush);
    return () => {
      flush();
      unregister?.();
    };
  }, [flush]);
  function insertFiles(editor: Editor, files: File[], position?: number) {
    const finish = callbacks.current.beginPendingWork();
    return uploadEditorImages({
      editor,
      files,
      position,
      onPendingChange: (delta) => setUploads((value) => value + delta),
      onError: setError,
      isDisabled: () => callbacks.current.disabled || callbacks.current.isOperationBlocked(),
    }).finally(finish);
  }
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editable: !disabled,
    content: document,
    extensions: editorExtensions(),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Story content",
        "aria-multiline": "true",
        class:
          "min-h-[40svh] outline-none prose prose-stone max-w-none break-words text-lg leading-8 prose-headings:font-normal prose-headings:tracking-tight prose-h2:mt-12 prose-h3:mt-9 prose-a:text-primary prose-a:decoration-primary/30 prose-blockquote:border-primary/40 prose-blockquote:font-normal prose-img:rounded-xl prose-pre:bg-[#16140f] prose-pre:text-[#eae8df] prose-table:text-base [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-3 [&_th]:border [&_th]:border-border [&_th]:bg-background [&_th]:p-3 [&_.selectedCell]:bg-sky-soft [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0 [&_li[data-type=taskItem]]:flex [&_li[data-type=taskItem]]:gap-3 [&_li[data-type=taskItem]>label]:mt-1.5 [&_li[data-type=taskItem]>label_input]:accent-primary [&_li[data-type=taskItem]>div]:flex-1 [&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-muted-foreground/50 [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] [&_hr]:border-dashed [&_hr.ProseMirror-selectednode]:border-sky [&_img.ProseMirror-selectednode]:ring-3 [&_img.ProseMirror-selectednode]:ring-sky/60",
      },
      transformPastedHTML: (html) => {
        const result = cleanClipboardHTML(html);
        if (result.warning) setWarning(result.warning);
        else if (/<img/i.test(result.html))
          setWarning(
            "remote images are linked to their original source and may be private or disappear later. upload the original files for copies that last.",
          );
        return result.html;
      },
      handleDrop: (view, event, moved) => {
        if (moved || !event.dataTransfer?.files.length || !editor || callbacks.current.disabled)
          return false;
        event.preventDefault();
        const position =
          view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ??
          editor.state.selection.to;
        void insertFiles(editor, Array.from(event.dataTransfer.files), position);
        return true;
      },
      handlePaste: (_view, event) => {
        if (!editor || callbacks.current.disabled) return false;
        const clipboard = event.clipboardData;
        if (clipboard?.files.length) {
          event.preventDefault();
          const files = Array.from(clipboard.files);
          const attachmentCount = files.filter(isSupportedImage).length;
          const warning = insertClipboardContent(editor, {
            html: clipboard.getData("text/html"),
            text: clipboard.getData("text/plain"),
            attachmentCount,
          });
          if (warning) setWarning(warning);
          void insertFiles(editor, files);
          return true;
        }
        const html = event.clipboardData?.getData("text/html") || "",
          text = event.clipboardData?.getData("text/plain") || "";
        if (pasteAsMarkdown(html, text)) {
          event.preventDefault();
          editor?.commands.insertContent(text, { contentType: "markdown" });
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const doc = editor.state.doc;
      const now = Date.now();
      const since = pending.current?.since ?? now;
      pending.current = { doc, since };
      clearTimeout(timer.current);
      if (doc.content.size < longDraft || now - since >= maxWait) flush();
      else timer.current = setTimeout(flush, Math.min(pause, maxWait - (now - since)));
    },
  });
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);
  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = editor;
    return () => {
      if (editorRef.current === editor) editorRef.current = null;
    };
  }, [editor, editorRef]);
  if (!editor) return <div className="min-h-96 animate-pulse rounded-2xl bg-muted/30" />;
  async function importMarkdown(input: HTMLInputElement) {
    const chosen = input.files?.[0];
    if (!chosen || !editor) return;
    if (chosen.size > 1024 * 1024) {
      setError("markdown imports must be smaller than 1 MB.");
      return;
    }
    const finish = callbacks.current.beginPendingWork();
    try {
      const text = await chosen.text();
      if (callbacks.current.disabled || callbacks.current.isOperationBlocked()) {
        setError("the editor is busy. import this file again once it finishes.");
        return;
      }
      if (!editor.isDestroyed) {
        const parsed = editor.markdown?.parse(text) as DocNode | undefined;
        const titled = parsed && markdownTitle(parsed);
        if (titled && callbacks.current.onImportTitle?.(titled.title))
          editor.chain().focus().insertContent(titled.rest).run();
        else editor.chain().focus().insertContent(text, { contentType: "markdown" }).run();
      }
      if (!editor.isDestroyed) input.value = "";
    } catch (error) {
      setError(friendlyError(error, { auto: false }).message);
    } finally {
      finish();
    }
  }
  const toolbar = (
    <div className="relative">
      <FormatToolbar
        editor={editor}
        disabled={disabled}
        uploading={uploads > 0}
        linkOpen={linkOpen}
        onToggleLink={() => setLinkOpen((open) => !open)}
        onPickImages={() => file.current?.click()}
        onPickMarkdown={() => markdownFile.current?.click()}
      />
      {linkOpen && !disabled && <LinkPopover editor={editor} onClose={() => setLinkOpen(false)} />}
    </div>
  );
  return (
    <div>
      {/* The owner gives the toolbar a place in its strip; on its own it sits on top. */}
      {toolbarSlot === undefined
        ? toolbar
        : toolbarSlot
          ? createPortal(toolbar, toolbarSlot)
          : null}
      <SelectionMenu editor={editor} onLink={() => setLinkOpen(true)} />
      <input
        ref={file}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          void insertFiles(editor, Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      <input
        ref={markdownFile}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        className="hidden"
        aria-label="Import Markdown file"
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => void importMarkdown(e.target)}
      />
      <div className="space-y-3 font-sans empty:hidden [&:not(:empty)]:mb-6">
        {warning && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl bg-sky-soft px-3.5 py-2.5 text-sm leading-6 text-sky-deep"
          >
            <span className="flex-1">{warning}</span>
            <button
              type="button"
              className="cursor-pointer rounded-full px-2 text-xs underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-sky"
              onClick={() => setWarning("")}
            >
              dismiss
            </button>
          </div>
        )}
        <ErrorMessage message={error} />
        {uploads > 0 && (
          <p role="status" className="text-sm text-sky-deep">
            uploading {uploads} image{uploads === 1 ? "" : "s"}. keep this page open.
          </p>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
