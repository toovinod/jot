"use client";
import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "@tiptap/markdown";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Code,
  Image as ImageIcon,
  LinkSimple,
  ListBullets,
  ListChecks,
  ListNumbers,
  Minus,
  Quotes,
  Table,
  TextB,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  UploadSimple,
} from "@phosphor-icons/react";
import type { DocNode } from "@jot/contracts";
import { isSupportedImage, uploadEditorImages } from "./image-import";
import { cleanClipboardHTML, insertClipboardContent, looksLikeMarkdown } from "@/lib/paste";
import { cn, safeUrl } from "@/lib/utils";
import { Button } from "../ui/button";
import { ErrorMessage } from "../ui/fields";
export function RichEditor({
  document,
  onChange,
  disabled,
  beginPendingWork,
  isOperationBlocked,
}: {
  document: DocNode;
  onChange: (document: DocNode) => void;
  disabled: boolean;
  beginPendingWork: () => () => void;
  isOperationBlocked: () => boolean;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [uploads, setUploads] = useState(0);

  const callbacks = useRef({ onChange, disabled, beginPendingWork, isOperationBlocked });
  callbacks.current = { onChange, disabled, beginPendingWork, isOperationBlocked };
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
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: "noopener noreferrer nofollow" },
          isAllowedUri: (url, ctx) => !!safeUrl(url) && ctx.defaultValidate(url),
        },
      }),
      Image.configure({ allowBase64: false }),
      Placeholder.configure({ placeholder: "Begin anywhere. Write, paste, or drop an image…" }),
      TableKit.configure({ table: { resizable: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown,
    ],
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Story content",
        "aria-multiline": "true",
        class:
          "min-h-[440px] outline-none prose prose-stone dark:prose-invert max-w-none text-lg leading-8 prose-headings:font-normal prose-headings:tracking-tight prose-img:rounded-xl prose-a:text-primary prose-pre:bg-foreground prose-pre:text-background [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-3 [&_th]:border [&_th]:border-border [&_th]:p-3 [&_ul[data-type=taskList]]:list-none [&_li[data-type=taskItem]]:flex [&_li[data-type=taskItem]]:gap-3 [&_li[data-type=taskItem]>label]:mt-2 [&_li[data-type=taskItem]>div]:flex-1 [&_.is-editor-empty:first-child]:before:text-muted-foreground/50 [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:pointer-events-none",
      },
      transformPastedHTML: (html) => {
        const result = cleanClipboardHTML(html);
        if (result.warning) setWarning(result.warning);
        else if (/<img/i.test(result.html))
          setWarning(
            "Remote images are linked to their original source and may be private or disappear later. Upload original files for reliable copies.",
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
        const html = event.clipboardData?.getData("text/html"),
          text = event.clipboardData?.getData("text/plain");
        if (!html && text && looksLikeMarkdown(text)) {
          event.preventDefault();
          editor?.commands.insertContent(text, { contentType: "markdown" });
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => callbacks.current.onChange(editor.getJSON() as DocNode),
  });
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);
  if (!editor) return <div className="min-h-96 animate-pulse bg-muted/20" />;
  const tools = [
    {
      label: "Bold",
      icon: TextB,
      active: editor.isActive("bold"),
      action: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic",
      icon: TextItalic,
      active: editor.isActive("italic"),
      action: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "Strike",
      icon: TextStrikethrough,
      active: editor.isActive("strike"),
      action: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: "Heading",
      icon: TextHTwo,
      active: editor.isActive("heading"),
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Bulleted list",
      icon: ListBullets,
      active: editor.isActive("bulletList"),
      action: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      icon: ListNumbers,
      active: editor.isActive("orderedList"),
      action: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Task list",
      icon: ListChecks,
      active: editor.isActive("taskList"),
      action: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      label: "Quote",
      icon: Quotes,
      active: editor.isActive("blockquote"),
      action: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "Code block",
      icon: Code,
      active: editor.isActive("codeBlock"),
      action: () => editor.chain().focus().toggleCodeBlock().run(),
    },
  ];
  return (
    <div>
      <div
        className="sticky top-[76px] z-10 -mx-2 mb-9 flex flex-wrap items-center gap-0.5 rounded-full border border-border bg-white/95 p-1.5 font-sans shadow-[0_3px_0_var(--border)] backdrop-blur"
        role="toolbar"
        aria-label="Text formatting"
      >
        {tools.map((tool) => (
          <Button
            key={tool.label}
            type="button"
            size="icon"
            variant="ghost"
            className={cn(
              "rounded-full",
              tool.active && "bg-sky-soft text-sky-deep hover:bg-sky-soft",
            )}
            disabled={disabled}
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={tool.active}
            onClick={tool.action}
          >
            <tool.icon size={17} weight={tool.active ? "fill" : "bold"} />
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full"
          disabled={disabled}
          aria-label="Add or remove link"
          title="Link"
          onClick={() => {
            const value = prompt(
              "Link URL (leave empty to remove)",
              editor.getAttributes("link").href || "",
            );
            if (value === null) return;
            if (!value) {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              return;
            }
            const href = safeUrl(value);
            if (!href) {
              setError("Use a complete http, https, or mailto link.");
              return;
            }
            editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
          }}
        >
          <LinkSimple weight="bold" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full"
          disabled={disabled}
          aria-label="Insert table"
          title="Insert table"
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          <Table weight="bold" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full"
          disabled={disabled}
          aria-label="Insert divider"
          title="Divider"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus weight="bold" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full"
          disabled={disabled || uploads > 0}
          aria-label="Upload image"
          title="Upload image"
          onClick={() => file.current?.click()}
        >
          <ImageIcon weight="bold" />
        </Button>
        <label
          className={cn(
            "inline-flex size-10 cursor-pointer items-center justify-center rounded-full hover:bg-sky-soft focus-within:ring-2 focus-within:ring-ring",
            disabled && "pointer-events-none opacity-40",
          )}
          title="Import Markdown"
        >
          <UploadSimple size={16} weight="bold" />
          <span className="sr-only">Import Markdown file</span>
          <input
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            className="sr-only"
            disabled={disabled}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 1024 * 1024) {
                setError("Markdown imports must be smaller than 1 MB.");
                return;
              }
              const finish = callbacks.current.beginPendingWork();
              try {
                const text = await file.text();
                if (callbacks.current.disabled || callbacks.current.isOperationBlocked()) {
                  setError(
                    "The editor is busy. Import this file again after the operation finishes.",
                  );
                  return;
                }
                if (!editor.isDestroyed)
                  editor.chain().focus().insertContent(text, { contentType: "markdown" }).run();
                if (!editor.isDestroyed) e.target.value = "";
              } catch (error) {
                setError((error as Error).message);
              } finally {
                finish();
              }
            }}
          />
        </label>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="rounded-full"
          aria-label="Undo"
          disabled={disabled || !editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <ArrowCounterClockwise weight="bold" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="rounded-full"
          aria-label="Redo"
          disabled={disabled || !editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <ArrowClockwise weight="bold" />
        </Button>
      </div>
      {editor.isActive("table") && (
        <div className="mb-5 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => editor.chain().focus().addRowAfter().run()}
          >
            Add row
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            Add column
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => editor.chain().focus().deleteRow().run()}
          >
            Delete row
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => editor.chain().focus().deleteColumn().run()}
          >
            Delete column
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            Delete table
          </Button>
        </div>
      )}
      <input
        ref={file}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/gif"
        className="hidden"
        onChange={(e) => {
          void insertFiles(editor, Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      {warning && (
        <div
          role="status"
          className="mb-5 rounded-2xl bg-sky-soft p-3 font-sans text-xs leading-6 text-sky-deep"
        >
          {warning}
          <button className="ml-3 underline" onClick={() => setWarning("")}>
            Dismiss
          </button>
        </div>
      )}
      <ErrorMessage message={error} />
      {uploads > 0 && (
        <p role="status" className="mb-4 text-sm text-primary">
          Uploading {uploads} image{uploads === 1 ? "" : "s"}. Keep this page open.
        </p>
      )}
      <EditorContent editor={editor} />
      <p className="mt-10 border-t border-dashed border-border pt-5 font-sans text-[11px] leading-6 text-muted-foreground">
        Paste from your notes or documents. Supported formatting includes headings, lists, tables,
        tasks, links and code. Unsupported styles are simplified. Images tied to another app may
        need uploading. Videos are not supported.
      </p>
    </div>
  );
}
