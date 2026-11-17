"use client";
import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { LinkSimple } from "@phosphor-icons/react";
import { safeUrl } from "@/lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/fields";
/** Inline link editor: Enter applies, Escape cancels, and an existing link can be removed. */
export function LinkPopover({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const current: string = editor.getAttributes("link").href || "";
  const [value, setValue] = useState(current),
    [error, setError] = useState("");
  function close() {
    onClose();
    editor.commands.focus();
  }
  function apply() {
    const href = /^(https?|mailto):/i.test(value.trim()) ? safeUrl(value.trim()) : undefined;
    if (!href) {
      setError("use a complete http, https or mailto link.");
      return;
    }
    const chain = editor.chain().focus().extendMarkRange("link");
    // With nothing selected, insert the address itself as the link text.
    (editor.state.selection.empty && !current
      ? chain.insertContent({
          type: "text",
          text: href,
          marks: [{ type: "link", attrs: { href } }],
        })
      : chain.setLink({ href })
    ).run();
    onClose();
  }
  return (
    <div
      role="dialog"
      aria-label="Edit link"
      className="absolute left-1/2 top-full z-30 mt-1 grid w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 gap-2 rounded-2xl bg-white p-3 font-sans shadow-[0_0_0_1px_var(--border),0_18px_40px_-18px_rgba(0,40,100,.45)]"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      }}
    >
      <label htmlFor="link-url" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LinkSimple weight="bold" aria-hidden="true" className="size-3.5" />
        link address
      </label>
      <div className="flex gap-2">
        <Input
          id="link-url"
          autoFocus
          value={value}
          placeholder="https://"
          aria-invalid={!!error}
          aria-describedby={error ? "link-error" : undefined}
          className="h-9 font-mono text-xs md:text-xs"
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
        />
        <Button type="button" variant="sky" size="sm" className="h-9" onClick={apply}>
          apply
        </Button>
      </div>
      {error && (
        <p id="link-error" role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-1">
        {current && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              onClose();
            }}
          >
            remove link
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={close}>
          cancel
        </Button>
      </div>
    </div>
  );
}
