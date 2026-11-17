"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, CalendarBlank, Eye, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { maxTags, postPath, tagPattern, type Post } from "@jot/contracts";
import { cn, slugify } from "@/lib/utils";
import { Button } from "../ui/button";
import { Critter } from "../world/critters";
import { PanelLabel, Segmented, Switch, SwitchList } from "./controls";
import { useEditorController } from "./editor-controller";

/** Where the page stands: live or unlisted once published, else scheduled or still a draft. */
export function pageStatus(post: Post): "draft" | "live" | "unlisted" | "scheduled" {
  if (post.published) return post.published.visibility === "unlisted" ? "unlisted" : "live";
  return post.scheduledAt ? "scheduled" : "draft";
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }).toLowerCase();

/** Why the API would refuse this schedule time, checked before sending: it takes times between
 * 2 minutes and 1 year from now. */
function scheduleIssue(value: string, now: number) {
  const at = new Date(value).getTime();
  if (!value || Number.isNaN(at)) return "";
  if (at < now + 2 * 60_000) return "pick a time at least 2 minutes from now.";
  const latest = new Date(now);
  latest.setFullYear(latest.getFullYear() + 1);
  return at > latest.getTime() ? "pick a time within a year from now." : "";
}

// Letters and planes that fly off the publish button, as in the landing demo.
const burst = [
  { x: -110, y: -150, r: -30 },
  { x: -40, y: -210, r: -10 },
  { x: 50, y: -190, r: 15 },
  { x: 120, y: -130, r: 35 },
  { x: 0, y: -240, r: 0 },
];

export function PublicationPanel() {
  const {
    busy,
    uploads,
    post,
    snapshot,
    config,
    updateDraft,
    emailSubscribers,
    setEmailSubscribers,
    publishDraft,
    schedulePublish,
    cancelSchedule,
    createShareLink,
    revokeShareLink,
    unpublishPost,
  } = useEditorController();
  const disabled = busy;
  const reduceMotion = useReducedMotion();
  const [slugInput, setSlugInput] = useState(snapshot.slug),
    [tagInput, setTagInput] = useState(""),
    [tagError, setTagError] = useState(""),
    [scheduling, setScheduling] = useState(false),
    [scheduleAt, setScheduleAt] = useState(""),
    // When the schedule time was last checked, so a time that has since come too close is caught.
    [checkedAt, setCheckedAt] = useState(() => Date.now()),
    [copied, setCopied] = useState(false),
    [flying, setFlying] = useState(0);
  useEffect(() => setSlugInput(snapshot.slug), [snapshot.slug]);
  // A new publishedAt means a publish just went through: send the critters off.
  const publishedAt = useRef(post.publishedAt);
  useEffect(() => {
    if (post.publishedAt && post.publishedAt !== publishedAt.current) setFlying((n) => n + 1);
    publishedAt.current = post.publishedAt;
  }, [post.publishedAt]);
  // Once a schedule is set the panel shows it, and the button goes back to publishing now.
  useEffect(() => {
    if (post.scheduledAt) setScheduling(false);
  }, [post.scheduledAt]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  const tags = snapshot.tags || [];
  const lockedSlug = !!(post.reservedSlug || post.published?.slug);
  const hasTitle = !!snapshot.title.trim(),
    hasSlug = !!slugify(slugInput);
  const canPublish = !disabled && uploads === 0 && hasTitle && hasSlug;
  const shareUrl = post.shareToken ? `${location.origin}/share/${post.shareToken}` : "";
  const scheduleError = post.scheduleError;
  const isPublic = snapshot.visibility === "public";
  const status = pageStatus(post);
  function addTag() {
    const tag = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (!tag) return;
    if (!tagPattern.test(tag)) {
      setTagError("tags use up to 24 lowercase letters, numbers or hyphens.");
      return;
    }
    if (!tags.includes(tag) && tags.length >= maxTags) {
      setTagError(`up to ${maxTags} tags.`);
      return;
    }
    setTagError("");
    setTagInput("");
    if (!tags.includes(tag)) updateDraft({ tags: [...tags, tag] });
  }
  const scheduleProblem = scheduling ? scheduleIssue(scheduleAt, checkedAt) : "";
  function go() {
    if (scheduling) {
      const now = Date.now();
      setCheckedAt(now);
      if (scheduleIssue(scheduleAt, now)) return;
    }
    updateDraft({ slug: slugify(slugInput) });
    if (scheduling) void schedulePublish(new Date(scheduleAt).toISOString());
    else void publishDraft();
  }
  const action = !hasTitle
    ? "add a title to publish"
    : !hasSlug
      ? "add an address to publish"
      : busy
        ? "publishing"
        : scheduling
          ? scheduleAt
            ? `schedule for ${when(scheduleAt)}`
            : "pick a time to schedule"
          : post.published
            ? "publish update"
            : "publish";
  return (
    <section aria-label="Publication settings" className="relative space-y-5">
      {scheduleError && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/[0.07] px-3 py-2.5 text-xs leading-5 text-destructive"
        >
          the scheduled publish didn&apos;t go out: {scheduleError}
        </p>
      )}
      <div>
        <PanelLabel htmlFor="post-slug">address</PanelLabel>
        <div
          className={cn(
            "flex h-10 items-center rounded-xl bg-white pl-3 shadow-[0_0_0_1px_var(--border),0_2px_0_var(--border)] focus-within:shadow-[0_0_0_2px_var(--sky)]",
            (disabled || lockedSlug) && "bg-background",
          )}
        >
          <span className="max-w-[45%] shrink-0 truncate font-mono text-xs text-muted-foreground">
            /@{post.author.username}/
          </span>
          <input
            id="post-slug"
            value={slugInput}
            required
            maxLength={100}
            disabled={disabled || lockedSlug}
            aria-describedby="post-slug-hint"
            onChange={(e) => setSlugInput(e.target.value)}
            onBlur={() => updateDraft({ slug: slugify(slugInput) })}
            className="h-full min-w-0 flex-1 bg-transparent pr-3 font-mono text-xs outline-none disabled:cursor-not-allowed disabled:text-muted-foreground"
          />
        </div>
        <span id="post-slug-hint" className="mt-1.5 block text-xs text-muted-foreground">
          {lockedSlug
            ? "published addresses stay the same."
            : "lowercase letters, numbers and hyphens."}
        </span>
      </div>
      <div>
        <Segmented
          id="editor-visibility"
          label="who can find it"
          value={snapshot.visibility}
          options={["public", "unlisted"] as const}
          disabled={disabled}
          onChange={(visibility) => updateDraft({ visibility })}
        />
        <span className="mt-1.5 block text-xs text-muted-foreground">
          {isPublic
            ? "shows in discover and on your profile."
            : "only people with the link can open it."}
        </span>
      </div>
      <div>
        <PanelLabel htmlFor="post-tags">tags</PanelLabel>
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-white p-1.5 shadow-[0_0_0_1px_var(--border)] focus-within:shadow-[0_0_0_2px_var(--sky)]">
          <AnimatePresence initial={false}>
            {tags.map((tag) => (
              <motion.span
                layout
                key={tag}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-1 rounded-full bg-sky-soft py-0.5 pl-2.5 pr-1 font-mono text-xs text-sky-deep"
              >
                #{tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  disabled={disabled}
                  onClick={() => updateDraft({ tags: tags.filter((t) => t !== tag) })}
                  className="grid size-4 cursor-pointer place-items-center rounded-full outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-sky"
                >
                  <X weight="bold" className="size-2.5" />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
          <input
            id="post-tags"
            value={tagInput}
            maxLength={40}
            placeholder={tags.length >= maxTags ? `${maxTags} tags added` : "add a tag"}
            disabled={disabled || tags.length >= maxTags}
            aria-describedby="post-tags-hint"
            aria-invalid={!!tagError || undefined}
            onChange={(e) => {
              setTagInput(e.target.value);
              setTagError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
            className="h-7 min-w-20 flex-1 bg-transparent px-1.5 text-xs outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
        </div>
        <span
          id="post-tags-hint"
          role={tagError ? "alert" : undefined}
          className={cn(
            "mt-1.5 block text-xs",
            tagError ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {tagError || `press enter to add. up to ${maxTags}.`}
        </span>
      </div>
      <SwitchList>
        <Switch
          label="allow comments"
          hint="takes effect when you publish."
          on={!snapshot.commentsOff}
          disabled={disabled}
          onChange={(on) => updateDraft({ commentsOff: !on })}
        />
        <Switch
          label="email my subscribers"
          hint={
            !config.emailEnabled
              ? "email delivery is not configured."
              : !isPublic
                ? "only public pages can be emailed."
                : emailSubscribers
                  ? "sent when it goes live."
                  : "not this time."
          }
          on={emailSubscribers && isPublic}
          disabled={!config.emailEnabled || disabled || !isPublic}
          onChange={setEmailSubscribers}
        />
        {post.scheduledAt ? (
          <div className="flex items-center justify-between gap-3 px-3.5 py-3">
            <span className="min-w-0">
              <span className="block text-sm">scheduled</span>
              <span className="block text-xs text-muted-foreground">
                publishes {when(post.scheduledAt)}
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => void cancelSchedule()}
            >
              cancel schedule
            </Button>
          </div>
        ) : (
          <>
            <Switch
              label="schedule it"
              hint={
                !scheduling
                  ? "publish right away."
                  : post.published
                    ? "this edition stays live until then."
                    : "goes live at the time you pick."
              }
              on={scheduling}
              disabled={disabled}
              onChange={setScheduling}
            />
            {scheduling && (
              <div className="px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="schedule-at" className="flex items-center gap-1.5 text-sm">
                    <CalendarBlank weight="bold" aria-hidden="true" className="size-4" />
                    publish at
                  </label>
                  <input
                    id="schedule-at"
                    type="datetime-local"
                    value={scheduleAt}
                    disabled={disabled}
                    aria-invalid={!!scheduleProblem || undefined}
                    aria-describedby={scheduleProblem ? "schedule-at-hint" : undefined}
                    onChange={(e) => {
                      setScheduleAt(e.target.value);
                      setCheckedAt(Date.now());
                    }}
                    className="min-w-0 rounded-full bg-background px-3 py-1.5 text-xs outline-none focus-visible:shadow-[0_0_0_2px_var(--sky)] aria-invalid:shadow-[0_0_0_2px_var(--destructive)]"
                  />
                </div>
                {scheduleProblem && (
                  <p
                    id="schedule-at-hint"
                    role="alert"
                    className="mt-1.5 text-xs leading-5 text-destructive"
                  >
                    {scheduleProblem}
                  </p>
                )}
              </div>
            )}
          </>
        )}
        <Switch
          label="private draft link"
          hint={
            post.shareToken ? "anyone with it can read the draft." : "only you can see the draft."
          }
          on={!!post.shareToken}
          disabled={disabled}
          onChange={(on) => (on ? void createShareLink() : revokeShareLink())}
        />
        {post.shareToken && (
          <div className="flex items-center gap-2 px-3.5 py-2.5">
            <input
              readOnly
              value={shareUrl}
              aria-label="Private draft link"
              onFocus={(e) => e.target.select()}
              className="min-w-0 flex-1 truncate bg-transparent font-mono text-xs text-muted-foreground outline-none"
            />
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard
                  .writeText(shareUrl)
                  .then(() => setCopied(true))
                  .catch(() => {})
              }
              className="shrink-0 cursor-pointer rounded-full bg-background px-2.5 py-1 text-xs outline-none transition-colors hover:bg-sky-soft focus-visible:ring-2 focus-visible:ring-sky"
            >
              {copied ? "copied" : "copy"}
            </button>
          </div>
        )}
      </SwitchList>
      <div className="relative">
        <Button
          variant="sky"
          className="w-full"
          disabled={!canPublish || (scheduling && (!scheduleAt || !!scheduleProblem))}
          onClick={go}
        >
          <PaperPlaneTilt weight="fill" />
          {action}
        </Button>
        <AnimatePresence>
          {flying > 0 &&
            !reduceMotion &&
            burst.map((to, i) => (
              <motion.span
                key={`${flying}-${i}`}
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-0"
                initial={{ x: 0, y: 0, opacity: 1, scale: 0.6, rotate: 0 }}
                animate={{ x: to.x, y: to.y, opacity: 0, scale: 1, rotate: to.r }}
                transition={{ duration: 1.1, ease: "easeOut", delay: i * 0.04 }}
              >
                <Critter kind={i % 2 ? "letter" : "plane"} className="size-7" />
              </motion.span>
            ))}
        </AnimatePresence>
      </div>
      {status !== "draft" && (
        <motion.p
          key={`${flying}-${status}`}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "flex items-center gap-2 rounded-xl px-3 py-2 font-mono text-xs",
            status === "scheduled" ? "bg-[#e1ebfb] text-[#1b4f9c]" : "bg-[#dff5e3] text-grass-3",
          )}
        >
          <Eye weight="bold" aria-hidden="true" className="size-3.5 shrink-0" />
          {post.published ? (
            <a
              href={postPath(post.author.username, post.published.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 items-center gap-1 underline-offset-4 hover:underline"
            >
              <span className="truncate">
                {status} at {postPath(post.author.username, post.published.slug)}
              </span>
              <ArrowUpRight weight="bold" aria-hidden="true" className="size-3 shrink-0" />
            </a>
          ) : (
            <span className="truncate">goes live {when(post.scheduledAt!)}</span>
          )}
        </motion.p>
      )}
      {post.published && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          disabled={disabled || uploads > 0}
          onClick={unpublishPost}
        >
          unpublish
        </Button>
      )}
    </section>
  );
}
