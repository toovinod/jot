"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { postPath, type Snapshot } from "@jot/contracts";
import { slugify } from "@/lib/utils";
import { Button } from "../ui/button";
import { Field, Input, Select } from "../ui/fields";
import { useEditorController } from "./editor-controller";
export function PublicationPanel() {
  const {
    busy,
    uploads,
    publishOpen,
    post,
    snapshot,
    config,
    updateDraft,
    emailSubscribers,
    setEmailSubscribers,
    publishDraft,
    unpublishPost,
  } = useEditorController();
  const disabled = busy;
  const [slugInput, setSlugInput] = useState(snapshot.slug);
  useEffect(() => setSlugInput(snapshot.slug), [snapshot.slug]);
  return (
    <>
      {publishOpen && (
        <section
          aria-label="Publication settings"
          className="border-b border-border bg-muted/40 px-5 py-7"
        >
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[1fr_1fr_auto]">
            <div>
              <h2 className="font-serif text-2xl">
                {post.published ? "Ready for a fresh edition?" : "Ready to share it?"}
              </h2>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                {post.published
                  ? "Your live story stays unchanged until you publish this draft."
                  : "Publishing makes a separate snapshot. You can keep editing your draft afterwards."}
              </p>
              {post.published && (
                <a
                  href={postPath(post.author.username, post.published.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-primary"
                >
                  Open live story <ArrowUpRight size={13} />
                </a>
              )}
            </div>
            <div className="grid gap-4">
              <Field
                label="Story address"
                hint={
                  post.reservedSlug || post.published?.slug
                    ? "Published addresses stay stable."
                    : "Lowercase letters, numbers, and hyphens."
                }
              >
                <Input
                  value={slugInput}
                  required
                  maxLength={100}
                  disabled={disabled || !!(post.reservedSlug || post.published?.slug)}
                  onChange={(e) => setSlugInput(e.target.value)}
                  onBlur={() => updateDraft({ slug: slugify(slugInput) })}
                />
              </Field>
              <Field label="Who can find it?">
                <Select
                  value={snapshot.visibility}
                  disabled={disabled}
                  onChange={(e) =>
                    updateDraft({ visibility: e.target.value as Snapshot["visibility"] })
                  }
                >
                  <option value="public">Public · visible in discovery and your profile</option>
                  <option value="unlisted">Unlisted · accessible to anyone with the link</option>
                </Select>
              </Field>
              <label className="flex items-start gap-2 text-xs leading-5">
                <input
                  type="checkbox"
                  className="mt-1 accent-primary"
                  checked={emailSubscribers && snapshot.visibility === "public"}
                  disabled={!config.emailEnabled || disabled || snapshot.visibility !== "public"}
                  onChange={(e) => setEmailSubscribers(e.target.checked)}
                />
                <span>
                  Email confirmed subscribers
                  {!config.emailEnabled && (
                    <span className="block text-muted-foreground">
                      Email delivery is not configured.
                    </span>
                  )}
                </span>
              </label>
            </div>
            <div className="flex flex-col gap-3 md:pt-7">
              <Button
                disabled={disabled || uploads > 0 || !snapshot.title.trim() || !slugify(slugInput)}
                onClick={() => {
                  updateDraft({ slug: slugify(slugInput) });
                  void publishDraft();
                }}
              >
                {busy ? "Publishing…" : post.published ? "Publish update" : "Publish story"}
                <ArrowUpRight />
              </Button>
              {post.published && (
                <Button
                  variant="outline"
                  disabled={disabled || uploads > 0}
                  onClick={unpublishPost}
                >
                  Unpublish
                </Button>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
