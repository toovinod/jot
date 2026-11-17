"use client";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { isTextSelection, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Icon } from "@phosphor-icons/react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CaretDown,
  Code,
  CodeBlock,
  FileArrowUp,
  Image as ImageIcon,
  LinkSimple,
  ListBullets,
  ListChecks,
  ListNumbers,
  Minus,
  Plus,
  Quotes,
  Table,
  TextB,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  TextT,
  TextUnderline,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { IconButton } from "../app/toolbar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { lowlight } from "./code-highlight";

function Divider() {
  return <span aria-hidden="true" className="mx-1.5 h-5 w-px shrink-0 bg-border" />;
}

/** One icon tool. Pressing it keeps the selection in the document. */
export function Tool({
  label,
  active,
  className,
  ...props
}: ComponentProps<"button"> & { label: string; active?: boolean }) {
  return (
    <IconButton
      label={label}
      variant="ghost"
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      className={cn(active && "bg-sky-soft text-sky-deep hover:bg-sky-soft", className)}
      {...props}
    />
  );
}

/** A text button that opens a menu, sized like the icon tools. */
function MenuTrigger({ className, children, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium text-foreground outline-none transition-colors hover:bg-sky-soft focus-visible:ring-3 focus-visible:ring-sky/50 disabled:pointer-events-none disabled:opacity-45 data-[state=open]:bg-sky-soft [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      <CaretDown weight="bold" aria-hidden="true" className="size-3! text-muted-foreground" />
    </button>
  );
}

/**
 * A toolbar menu. Choosing an item hands focus back to the page so writing carries on; closing
 * it with Escape returns focus to the trigger, as a menu should.
 */
function ToolMenu({
  editor,
  trigger,
  children,
}: {
  editor: Editor;
  trigger: ReactNode;
  children: (choose: () => void) => ReactNode;
}) {
  const chose = useRef(false);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="min-w-44 font-sans"
        onCloseAutoFocus={(event) => {
          if (!chose.current) return;
          chose.current = false;
          event.preventDefault();
          editor.commands.focus();
        }}
      >
        {children(() => (chose.current = true))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const textStyles = [
  { id: "paragraph", label: "paragraph", icon: TextT },
  { id: "h2", label: "heading", icon: TextHTwo },
  { id: "h3", label: "subheading", icon: TextHThree },
] as const;

/** Whether a scroller has more to show past either edge, for its fades. */
function useEdges() {
  const scroller = useRef<HTMLDivElement>(null),
    row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const update = () => {
      const start = element.scrollLeft > 1,
        end = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      setEdges((now) => (now.start === start && now.end === end ? now : { start, end }));
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    // Observing both sizes catches a resized window and context tools that come and go.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    if (row.current) observer?.observe(row.current);
    return () => {
      element.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, []);
  const fade = 28;
  const mask =
    edges.start || edges.end
      ? `linear-gradient(to right, ${edges.start ? "transparent" : "#000"}, #000 ${fade}px, #000 calc(100% - ${fade}px), ${edges.end ? "transparent" : "#000"})`
      : undefined;
  return { scroller, row, mask };
}

/**
 * The formatting row: undo and redo, text style, inline marks, blocks, and an insert menu, with
 * code and table tools joining at the end while the cursor is in one. One row that never wraps;
 * on a narrow screen it scrolls sideways with soft edges.
 */
export function FormatToolbar({
  editor,
  disabled,
  uploading,
  linkOpen,
  onToggleLink,
  onPickImages,
  onPickMarkdown,
}: {
  editor: Editor;
  disabled: boolean;
  uploading: boolean;
  linkOpen: boolean;
  onToggleLink: () => void;
  onPickImages: () => void;
  onPickMarkdown: () => void;
}) {
  const { scroller, row, mask } = useEdges();
  const chain = () => editor.chain().focus();
  const style = editor.isActive("heading", { level: 2 })
    ? textStyles[1]
    : editor.isActive("heading", { level: 3 })
      ? textStyles[2]
      : textStyles[0];
  const marks: { label: string; icon: Icon; active: boolean; run: () => void }[] = [
    {
      label: "Bold",
      icon: TextB,
      active: editor.isActive("bold"),
      run: () => chain().toggleBold().run(),
    },
    {
      label: "Italic",
      icon: TextItalic,
      active: editor.isActive("italic"),
      run: () => chain().toggleItalic().run(),
    },
    {
      label: "Underline",
      icon: TextUnderline,
      active: editor.isActive("underline"),
      run: () => chain().toggleUnderline().run(),
    },
    {
      label: "Strike",
      icon: TextStrikethrough,
      active: editor.isActive("strike"),
      run: () => chain().toggleStrike().run(),
    },
    {
      label: "Inline code",
      icon: Code,
      active: editor.isActive("code"),
      run: () => chain().toggleCode().run(),
    },
  ];
  const blocks: typeof marks = [
    {
      label: "Bulleted list",
      icon: ListBullets,
      active: editor.isActive("bulletList"),
      run: () => chain().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      icon: ListNumbers,
      active: editor.isActive("orderedList"),
      run: () => chain().toggleOrderedList().run(),
    },
    {
      label: "Task list",
      icon: ListChecks,
      active: editor.isActive("taskList"),
      run: () => chain().toggleTaskList().run(),
    },
    {
      label: "Quote",
      icon: Quotes,
      active: editor.isActive("blockquote"),
      run: () => chain().toggleBlockquote().run(),
    },
    {
      label: "Code block",
      icon: CodeBlock,
      active: editor.isActive("codeBlock"),
      run: () => chain().toggleCodeBlock().run(),
    },
  ];
  const inCode = editor.isActive("codeBlock"),
    inTable = editor.isActive("table");
  const language: string = inCode ? editor.getAttributes("codeBlock").language || "" : "";
  const languages = inCode ? lowlight.listLanguages() : [];
  return (
    <div
      ref={scroller}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
      className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div
        ref={row}
        role="toolbar"
        aria-label="Text formatting"
        className="mx-auto flex w-max flex-nowrap items-center px-3 py-1.5 font-sans"
      >
        <div role="group" aria-label="History" className="flex items-center gap-0.5">
          <Tool
            label="Undo"
            disabled={disabled || !editor.can().undo()}
            onClick={() => chain().undo().run()}
          >
            <ArrowCounterClockwise weight="bold" />
          </Tool>
          <Tool
            label="Redo"
            disabled={disabled || !editor.can().redo()}
            onClick={() => chain().redo().run()}
          >
            <ArrowClockwise weight="bold" />
          </Tool>
        </div>
        <Divider />
        <div role="group" aria-label="Text style" className="flex items-center">
          <ToolMenu
            editor={editor}
            trigger={
              <MenuTrigger
                aria-label={`Text style: ${style.label}`}
                disabled={disabled}
                className="w-[8.5rem] justify-between"
              >
                <span className="flex items-center gap-1.5">
                  <style.icon weight="bold" aria-hidden="true" />
                  {style.label}
                </span>
              </MenuTrigger>
            }
          >
            {(choose) => (
              <DropdownMenuRadioGroup
                value={style.id}
                onValueChange={(id) => {
                  choose();
                  if (id === "h2") chain().setHeading({ level: 2 }).run();
                  else if (id === "h3") chain().setHeading({ level: 3 }).run();
                  else chain().setParagraph().run();
                }}
              >
                {textStyles.map((item) => (
                  <DropdownMenuRadioItem key={item.id} value={item.id}>
                    <item.icon weight="bold" aria-hidden="true" />
                    {item.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            )}
          </ToolMenu>
        </div>
        <Divider />
        <div role="group" aria-label="Inline formatting" className="flex items-center gap-0.5">
          {marks.map((tool) => (
            <Tool
              key={tool.label}
              label={tool.label}
              active={tool.active}
              disabled={disabled}
              onClick={tool.run}
            >
              <tool.icon weight="bold" />
            </Tool>
          ))}
          <Tool
            label="Add or edit link"
            active={editor.isActive("link")}
            disabled={disabled}
            aria-haspopup="dialog"
            aria-expanded={linkOpen}
            onClick={onToggleLink}
          >
            <LinkSimple weight="bold" />
          </Tool>
        </div>
        <Divider />
        <div role="group" aria-label="Blocks" className="flex items-center gap-0.5">
          {blocks.map((tool) => (
            <Tool
              key={tool.label}
              label={tool.label}
              active={tool.active}
              disabled={disabled}
              onClick={tool.run}
            >
              <tool.icon weight={tool.active ? "fill" : "bold"} />
            </Tool>
          ))}
        </div>
        <Divider />
        <div role="group" aria-label="Insert" className="flex items-center">
          <ToolMenu
            editor={editor}
            trigger={
              <MenuTrigger aria-label="Insert" disabled={disabled}>
                <Plus weight="bold" aria-hidden="true" />
                insert
              </MenuTrigger>
            }
          >
            {(choose) => (
              <>
                <DropdownMenuItem disabled={uploading} onSelect={onPickImages}>
                  <ImageIcon weight="bold" />
                  image
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    choose();
                    chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                  }}
                >
                  <Table weight="bold" />
                  table
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    choose();
                    chain().setHorizontalRule().run();
                  }}
                >
                  <Minus weight="bold" />
                  divider
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onPickMarkdown}>
                  <FileArrowUp weight="bold" />
                  import markdown
                </DropdownMenuItem>
              </>
            )}
          </ToolMenu>
        </div>
        {inCode && (
          <>
            <Divider />
            <div role="group" aria-label="Code block" className="flex items-center">
              <ToolMenu
                editor={editor}
                trigger={
                  <MenuTrigger
                    aria-label={`Code language: ${language || "auto detect"}`}
                    disabled={disabled}
                  >
                    <span className="text-muted-foreground">language</span>
                    {language || "auto detect"}
                  </MenuTrigger>
                }
              >
                {(choose) => (
                  <DropdownMenuRadioGroup
                    value={language}
                    onValueChange={(value) => {
                      choose();
                      chain()
                        .updateAttributes("codeBlock", { language: value || null })
                        .run();
                    }}
                  >
                    <DropdownMenuRadioItem value="">auto detect</DropdownMenuRadioItem>
                    {language && !languages.includes(language) && (
                      <DropdownMenuRadioItem value={language}>{language}</DropdownMenuRadioItem>
                    )}
                    {languages.map((name) => (
                      <DropdownMenuRadioItem key={name} value={name}>
                        {name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                )}
              </ToolMenu>
            </div>
          </>
        )}
        {inTable && (
          <>
            <Divider />
            <div role="group" aria-label="Table" className="flex items-center">
              <ToolMenu
                editor={editor}
                trigger={
                  <MenuTrigger aria-label="Table" disabled={disabled}>
                    <Table weight="bold" aria-hidden="true" />
                    table
                  </MenuTrigger>
                }
              >
                {(choose) => (
                  <>
                    {[
                      { label: "add row", run: () => chain().addRowAfter().run() },
                      { label: "add column", run: () => chain().addColumnAfter().run() },
                      { label: "delete row", run: () => chain().deleteRow().run() },
                      { label: "delete column", run: () => chain().deleteColumn().run() },
                    ].map((item) => (
                      <DropdownMenuItem
                        key={item.label}
                        onSelect={() => {
                          choose();
                          item.run();
                        }}
                      >
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => {
                        choose();
                        chain().deleteTable().run();
                      }}
                    >
                      delete table
                    </DropdownMenuItem>
                  </>
                )}
              </ToolMenu>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Both stay the same object across renders: the menu re-sends its options whenever they change,
// and that transaction would render the editor again.
const bubbleOptions = { placement: "top", offset: 8 } as const;
const showForSelection: NonNullable<ComponentProps<typeof BubbleMenu>["shouldShow"]> = ({
  editor,
  view,
  state,
  from,
  to,
  element,
}) =>
  // A read-only editor (while busy) is not editable, so the menu stays away then too.
  editor.isEditable &&
  isTextSelection(state.selection) &&
  !state.selection.empty &&
  !editor.isActive("codeBlock") &&
  (view.hasFocus() || element.contains(document.activeElement)) &&
  !!state.doc.textBetween(from, to).trim();

/** A small tray over selected text: bold, italic, link and heading. */
export function SelectionMenu({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const chain = () => editor.chain().focus();
  return (
    <BubbleMenu
      editor={editor}
      options={bubbleOptions}
      shouldShow={showForSelection}
      className="z-10"
    >
      <div
        role="toolbar"
        aria-label="Selection formatting"
        className="flex items-center gap-0.5 rounded-full bg-white p-1 font-sans shadow-[0_0_0_1px_var(--border),0_10px_24px_-12px_rgba(0,40,100,.4)]"
      >
        <Tool
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => chain().toggleBold().run()}
          className="size-8"
        >
          <TextB weight="bold" />
        </Tool>
        <Tool
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => chain().toggleItalic().run()}
          className="size-8"
        >
          <TextItalic weight="bold" />
        </Tool>
        <Tool
          label="Add or edit link"
          active={editor.isActive("link")}
          aria-haspopup="dialog"
          onClick={onLink}
          className="size-8"
        >
          <LinkSimple weight="bold" />
        </Tool>
        <Tool
          label="Heading"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => chain().toggleHeading({ level: 2 }).run()}
          className="size-8"
        >
          <TextHTwo weight="bold" />
        </Tool>
      </div>
    </BubbleMenu>
  );
}
