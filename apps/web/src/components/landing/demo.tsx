"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp,
  Check,
  CircleNotch,
  ClockCounterClockwise,
  Eye,
  MagnifyingGlass,
  PaintBrush,
  PaperPlaneTilt,
  Plus,
  Sparkle,
  Square,
  X,
} from "@phosphor-icons/react";
import { cn, slugify } from "@/lib/utils";
import { Critter, type CritterKind } from "@/components/world/critters";
import { DEMO_LIMIT, demoTitle, parseDemoNote, type DemoBlock } from "./demo-parse";
import { BUDGET_POST, EVALS_POST, POSTGRES_POST } from "./posts";
import { Reveal } from "./reveal";
import { SkyFrame, Window } from "./window";

const accents = {
  blue: "#2f6fc0",
  green: "#3c7055",
  violet: "#79519d",
  rose: "#b44f70",
  orange: "#a7482d",
} as const;
type Accent = keyof typeof accents;
const fonts = { serif: "font-serif", sans: "font-sans", mono: "font-mono" } as const;
const widths = { narrow: "max-w-[340px]", standard: "max-w-[440px]", wide: "max-w-full" } as const;
// The same classes published pages use: .dark always, .theme-system follows the reader's device.
const themes = { light: "", dark: "dark", system: "theme-system" } as const;

type Status = "live" | "unlisted" | "scheduled" | "draft";
const statusDot: Record<Status, string> = {
  live: "bg-grass-2",
  unlisted: "bg-sky",
  scheduled: "bg-sky-deep",
  draft: "bg-[#f5b400]",
};

const assistModes = {
  grammar: "grammar and clarity",
  flow: "flow and structure",
  questions: "questions and knowledge gaps",
} as const;
type AssistMode = keyof typeof assistModes;

type Page = {
  id: string;
  note: string;
  status: Status;
  meta: string;
  kind: CritterKind;
  tint: string;
  tags: string[];
  assist?: Record<AssistMode, string>;
};

const seedPages: Page[] = [
  {
    id: "postgres",
    note: POSTGRES_POST,
    status: "live",
    meta: "live · 2,400 reads",
    kind: "page",
    tint: "bg-[#fff6d6]",
    tags: ["postgres", "scaling"],
    assist: {
      grammar: '"p99 stayed under 40ms" is clearer as "p99 latency stayed under 40ms".',
      flow: "the intro says the work happened in front of the database, but the second primary is a change to the database. one line on why it still counts would close that gap.",
      questions: "how do you size max_db_connections when a second app starts sharing the primary?",
    },
  },
  {
    id: "evals",
    note: EVALS_POST,
    status: "unlisted",
    meta: "unlisted · link only",
    kind: "book",
    tint: "bg-[#e6f8e1]",
    tags: ["agents", "evals"],
    assist: {
      grammar: '"the run to run spread" needs hyphens: "the run-to-run spread".',
      flow: "cost shows up late, as one list item. if cost decides what ships, say so in the grading section too.",
      questions:
        "how do you grade a task where two different fixes are both correct but only one passes the hidden tests?",
    },
  },
  {
    id: "budget",
    note: BUDGET_POST,
    status: "draft",
    meta: "draft · share link on",
    kind: "star",
    tint: "bg-[#fff0d1]",
    tags: ["performance", "web-vitals"],
    assist: {
      grammar:
        '"a so-so 4G connection" is vague. name the speed you test with, like "4G at about 9 Mbps".',
      flow: "the budget list mixes what visitors feel with what the build checks. splitting it in two would match the next section.",
      questions:
        "what happens to the budget when someone adds a third-party script outside the repository?",
    },
  },
];
const newKinds: CritterKind[] = ["plane", "letter", "heart", "bookmark"];

const tabs = [
  { id: "look", label: "look", icon: PaintBrush },
  { id: "publish", label: "publish", icon: PaperPlaneTilt },
  { id: "assist", label: "assist", icon: Sparkle },
  { id: "history", label: "history", icon: ClockCounterClockwise },
] as const;
type Tab = (typeof tabs)[number]["id"];

const titleOf = (note: string) => demoTitle(note) || "untitled";
const addressOf = (note: string) => {
  const title = titleOf(note);
  return `/@harper/${slugify(title === "untitled" ? "" : title) || "your-title"}`;
};
// A published page keeps every edition. The samples show the first publish (the intro)
// and the one before the last section was added.
const editionsOf = (note: string) => [
  { label: "edition 3 · today", when: "what readers see now", note },
  {
    label: "edition 2 · 3 days ago",
    when: "before the last section",
    note: note.slice(0, note.lastIndexOf("\n## ")).trimEnd(),
  },
  {
    label: "edition 1 · last week",
    when: "the first publish",
    note: note.slice(0, note.indexOf("\n## ")).trimEnd(),
  },
];
// A fixed day keeps server and browser renders identical.
const day = "tue";
const modes = [
  { id: "page", label: "page" },
  { id: "export", label: ".md export" },
] as const;

// Keywords pick up the page accent, so code looks highlighted without a dark theme.
// Covers SQL and TypeScript words, ini section headers and keys, and JSON keys.
const keywords =
  /(\b(?:select|from|where|and|or|as|by|order|set|update|alter|role|table|add|column|create|index|concurrently|on|limit|const|let|await|async|return|function|export|if|else)\b|^\[\w+\]|^\w+(?= =)|"[\w:-]+"(?=:))/im;

const pill =
  "absolute inset-0 rounded-full bg-white shadow-[0_0_0_1px_var(--border),0_2px_0_var(--border)]";

function Segmented<T extends string>({
  id,
  label,
  value,
  options,
  labels,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  /** Long labels stack one per row instead of sharing a single pill row. */
  labels?: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
      <div
        className={cn(
          "grid bg-background p-1",
          labels ? "gap-0.5 rounded-2xl" : "auto-cols-fr grid-flow-col rounded-full",
        )}
      >
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => onChange(option)}
            className={cn(
              "relative cursor-pointer rounded-full py-1 text-[13px] transition-colors",
              value === option ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value === option && <motion.span layoutId={id} className={pill} />}
            <span className="relative">{labels?.[option] ?? option}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Switch({
  label,
  hint,
  on,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <span
        className={cn(
          "relative flex h-6 w-10 shrink-0 rounded-full p-0.5 transition-colors",
          on ? "justify-end bg-sky-deep" : "justify-start bg-border",
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 600, damping: 30 }}
          className="size-5 rounded-full bg-white shadow"
        />
      </span>
    </button>
  );
}

const blockKey = (block: DemoBlock, i: number) => `${i}-${block.kind}-${block.text}`;

// Memoized so panel clicks do not re-render a full post. Blocks already on the page when it
// opens appear at once; only lines added or changed afterwards animate in.
export const Preview = memo(function Preview({
  blocks,
  accent,
}: {
  blocks: DemoBlock[];
  accent: string;
}) {
  const [opened] = useState(() => new Set(blocks.map(blockKey)));
  if (!blocks.length)
    return <p className="text-muted-foreground">your page shows up here. type a line below.</p>;
  return (
    <>
      {blocks.map((block, i) => {
        const key = blockKey(block, i);
        const enter = {
          initial: opened.has(key) ? false : { opacity: 0, y: 8, filter: "blur(4px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 0.35 },
        };
        if (block.kind === "h1")
          return (
            <motion.h3 key={key} {...enter} className="text-3xl leading-tight tracking-tight">
              {block.text}
            </motion.h3>
          );
        if (block.kind === "h2")
          return (
            <motion.h4
              key={key}
              {...enter}
              className="mt-2 text-xl transition-colors"
              style={{ color: accent }}
            >
              {block.text}
            </motion.h4>
          );
        if (block.kind === "li")
          return (
            <motion.p key={key} {...enter} className="flex gap-2.5 pl-1">
              <span
                className="mt-2.5 size-1.5 shrink-0 rounded-full transition-colors"
                style={{ background: accent }}
              />
              {block.text}
            </motion.p>
          );
        if (block.kind === "ol")
          return (
            <motion.p key={key} {...enter} className="flex gap-2.5 pl-1">
              <span className="shrink-0 tabular-nums transition-colors" style={{ color: accent }}>
                {block.n}.
              </span>
              {block.text}
            </motion.p>
          );
        if (block.kind === "todo")
          return (
            <motion.p key={key} {...enter} className="flex items-center gap-2.5">
              {block.done ? (
                <Check weight="bold" className="size-4 shrink-0" style={{ color: accent }} />
              ) : (
                <Square weight="bold" className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className={cn(block.done && "text-muted-foreground line-through")}>
                {block.text}
              </span>
            </motion.p>
          );
        if (block.kind === "code")
          return (
            <motion.pre
              key={key}
              {...enter}
              className="overflow-x-auto rounded-xl bg-[#f6f3ea] p-3.5 font-mono text-xs leading-relaxed text-[#3d3a30] shadow-[inset_0_0_0_1px_#ebe5d3] dark:bg-white/[0.06] dark:text-[#e8e3d6] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]"
            >
              {block.text.split(keywords).map((part, n) =>
                n % 2 ? (
                  <span key={n} className="transition-colors" style={{ color: accent }}>
                    {part}
                  </span>
                ) : (
                  part
                ),
              )}
            </motion.pre>
          );
        return (
          <motion.p key={key} {...enter} className="leading-relaxed">
            {block.text}
          </motion.p>
        );
      })}
    </>
  );
});

const burst = [
  { x: -120, y: -160, r: -30 },
  { x: -40, y: -220, r: -10 },
  { x: 60, y: -200, r: 15 },
  { x: 140, y: -140, r: 35 },
  { x: 0, y: -260, r: 0 },
];

export function Demo() {
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(seedPages.map((page) => [page.id, page.note])),
  );
  const [extra, setExtra] = useState(0);
  const [active, setActive] = useState("postgres");
  const [mode, setMode] = useState<"page" | "export">("page");
  const [tab, setTab] = useState<Tab>("look");
  const [font, setFont] = useState<keyof typeof fonts>("sans");
  const [width, setWidth] = useState<keyof typeof widths>("standard");
  const [accent, setAccent] = useState<Accent>("blue");
  const [theme, setTheme] = useState<keyof typeof themes>("light");
  const [status, setStatus] = useState<Record<string, Status>>(() =>
    Object.fromEntries(seedPages.map((page) => [page.id, page.status])),
  );
  const [visibility, setVisibility] = useState<Record<string, "public" | "unlisted">>(() =>
    Object.fromEntries(
      seedPages.map((page) => [page.id, page.status === "unlisted" ? "unlisted" : "public"]),
    ),
  );
  const [tags, setTags] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(seedPages.map((page) => [page.id, page.tags])),
  );
  const [tagDraft, setTagDraft] = useState("");
  // The real editor locks a page's address the first time it is published or scheduled.
  const [address, setAddress] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      seedPages
        .filter((page) => page.status !== "draft")
        .map((page) => [page.id, addressOf(page.note)]),
    ),
  );
  // Live pages that have their next edition scheduled; the current edition stays live.
  const [queued, setQueued] = useState<Record<string, boolean>>({});
  const [emailed, setEmailed] = useState<Record<string, boolean>>({});
  const [shared, setShared] = useState<Record<string, boolean>>({ budget: true });
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [time, setTime] = useState("09:00");
  const [assist, setAssist] = useState<AssistMode>("grammar");
  const [asked, setAsked] = useState("");
  const [flying, setFlying] = useState(0);
  const [draft, setDraft] = useState("");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const canvas = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      clearTimeout(copyTimer.current);
    },
    [],
  );

  const note = notes[active] ?? "";
  const blocks = useMemo(() => parseDemoNote(note), [note]);
  const title = titleOf(note);
  const words = useMemo(() => note.match(/[\p{L}\p{N}']+/gu)?.length ?? 0, [note]);
  // A full post is long, so another page or view starts from its top.
  useEffect(() => {
    if (canvas.current) canvas.current.scrollTop = 0;
  }, [active, mode]);
  const url = address[active] ?? addressOf(note);
  // Export names the file after the page address, like the real download.
  const file = `${address[active] || title !== "untitled" ? url.split("/").pop() : "untitled"}.md`;
  const pages: Page[] = [
    ...seedPages,
    ...Array.from({ length: extra }, (_, i) => ({
      id: `new-${i}`,
      note: "",
      status: "draft" as Status,
      meta: "draft · just now",
      kind: newKinds[i % newKinds.length]!,
      tint: "bg-sky-soft",
      tags: [],
    })),
  ];
  const page = pages.find((item) => item.id === active)!;
  const seed = seedPages.find((item) => item.id === active);
  // The seed draft was never published, so only the live and unlisted pages have editions.
  const editions = seed && seed.status !== "draft" ? editionsOf(seed.note) : [];
  const pageStatus = status[active] ?? page.status;
  const pageTags = tags[active] ?? [];
  const published = pageStatus === "live" || pageStatus === "unlisted";
  const canEmail = (visibility[active] ?? "public") === "public";
  const emailing = email && canEmail;
  const shareLink = `/share/${active}-q8vzx2kt`;
  const metaOf = (item: Page) => {
    const itemStatus = status[item.id] ?? item.status;
    if (queued[item.id]) return `${itemStatus} · next edition ${day} ${time}`;
    if (itemStatus === item.status) return item.meta;
    return itemStatus === "scheduled" ? `scheduled · ${day} ${time}` : `${itemStatus} · just now`;
  };
  const shown = pages.filter((item) =>
    titleOf(notes[item.id] ?? "")
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  const write = (value: string) => {
    setNotes((all) => ({ ...all, [active]: value.slice(0, DEMO_LIMIT) }));
    setSaving(true);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaving(false), 700);
  };
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    write(note ? `${note}\n\n${text}` : text);
    setDraft("");
    setMode("page");
    // Show the new line at the end of the post.
    window.requestAnimationFrame(() =>
      canvas.current?.scrollTo({
        top: canvas.current.scrollHeight,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      }),
    );
  };
  const publish = () => {
    setAddress((all) => ({ ...all, [active]: url }));
    setEmailed((all) => ({ ...all, [active]: emailing }));
    setQueued((all) => ({ ...all, [active]: schedule && published }));
    if (!(schedule && published)) {
      const next = schedule ? "scheduled" : visibility[active] === "unlisted" ? "unlisted" : "live";
      setStatus((all) => ({ ...all, [active]: next }));
    }
    setFlying((n) => n + 1);
  };
  const addTag = () => {
    const tag = tagDraft.trim().toLowerCase().replace(/\s+/g, "-");
    if (/^[a-z0-9-]{1,24}$/.test(tag) && !pageTags.includes(tag) && pageTags.length < 5)
      setTags((all) => ({ ...all, [active]: [...pageTags, tag] }));
    setTagDraft("");
  };
  // Only say "copied" once the browser confirms the write.
  const copyLink = () => {
    navigator.clipboard?.writeText(location.origin + shareLink).then(
      () => {
        setCopied(true);
        clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), 1400);
      },
      () => {},
    );
  };
  const addPage = () => {
    const id = `new-${extra}`;
    setNotes((all) => ({ ...all, [id]: "" }));
    setActive(id);
    setExtra((n) => n + 1);
    setMode("page");
    setQuery("");
  };

  return (
    <section aria-label="Try jot" className="mx-auto max-w-7xl px-4 pt-20 md:px-8 md:pt-28">
      <Reveal className="mb-12 grid items-end gap-6 md:grid-cols-2">
        <h2 className="max-w-[10em] font-display text-4xl font-medium leading-[1.03] tracking-[-0.045em] md:text-[56px]">
          try the editor.
        </h2>
        <p className="max-w-md text-lg leading-relaxed text-muted-foreground md:justify-self-end">
          write, change the look, publish. everything here resets when you reload.
        </p>
      </Reveal>
      <Reveal>
        <SkyFrame
          decor={
            <>
              <Critter
                kind="page"
                className="absolute left-[18%] top-[30px] size-10 animate-[hop_2.6s_ease-in-out_infinite] motion-reduce:animate-none md:top-[46px] md:size-12"
              />
              <Critter
                kind="heart"
                blinkDelay={-1.2}
                className="absolute right-[24%] top-[30px] size-9 animate-[hop_3s_ease-in-out_-0.8s_infinite] motion-reduce:animate-none md:top-[50px] md:size-11"
              />
              <Critter
                kind="letter"
                blinkDelay={-2.4}
                className="absolute right-[15%] top-[32px] hidden size-10 animate-[hop_2.8s_ease-in-out_-1.4s_infinite] motion-reduce:animate-none sm:block md:top-[48px] md:size-12"
              />
              <Critter
                kind="star"
                blinkDelay={-3}
                className="absolute right-[7%] top-[34px] hidden size-9 animate-[hop_3.2s_ease-in-out_-2s_infinite] motion-reduce:animate-none md:top-[52px] md:block"
              />
            </>
          }
        >
          <Window title="jot">
            <div className="grid md:grid-cols-[230px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)_290px]">
              {/* pages */}
              <aside className="flex gap-2 overflow-x-auto border-b border-border bg-background/50 p-3 md:flex-col md:overflow-visible md:border-b-0 md:border-r">
                <div className="hidden h-9 items-center justify-end gap-1.5 md:flex">
                  <AnimatePresence initial={false} mode="popLayout">
                    {searching ? (
                      <motion.label
                        key="search"
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 16 }}
                        className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-white pl-2.5 pr-1 shadow-[0_0_0_1px_var(--border)] focus-within:shadow-[0_0_0_2px_var(--sky)]"
                      >
                        <MagnifyingGlass
                          weight="bold"
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                        <span className="sr-only">search pages</span>
                        <input
                          autoFocus
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          onKeyDown={(event) => event.key === "Escape" && setSearching(false)}
                          placeholder="search pages"
                          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        />
                        <button
                          type="button"
                          aria-label="Close search"
                          onClick={() => {
                            setSearching(false);
                            setQuery("");
                          }}
                          className="grid size-6 cursor-pointer place-items-center rounded-full hover:bg-background"
                        >
                          <X weight="bold" className="size-3" />
                        </button>
                      </motion.label>
                    ) : (
                      <motion.button
                        key="open"
                        type="button"
                        aria-label="Search pages"
                        onClick={() => setSearching(true)}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="grid size-8 cursor-pointer place-items-center rounded-full bg-white text-muted-foreground shadow-[0_0_0_1px_var(--border)] transition-colors hover:bg-sky-soft hover:text-foreground"
                      >
                        <MagnifyingGlass weight="bold" className="size-4" />
                      </motion.button>
                    )}
                  </AnimatePresence>
                  <button
                    type="button"
                    aria-label="New page"
                    onClick={addPage}
                    className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-white shadow-[0_0_0_1px_var(--border)] transition-[background-color,transform] hover:rotate-90 hover:bg-sky-soft motion-reduce:transform-none"
                  >
                    <Plus weight="bold" className="size-4" />
                  </button>
                </div>
                <AnimatePresence initial={false}>
                  {shown.map((item) => {
                    const on = item.id === active;
                    const itemStatus = status[item.id] ?? item.status;
                    return (
                      <motion.button
                        layout
                        key={item.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        type="button"
                        aria-current={on ? "page" : undefined}
                        onClick={() => setActive(item.id)}
                        className="group relative flex min-w-52 cursor-pointer items-center gap-3 rounded-xl p-2 text-left md:min-w-0"
                      >
                        {on && (
                          <motion.span
                            layoutId="demo-page"
                            className="absolute inset-0 rounded-xl bg-white shadow-[0_0_0_1px_var(--border),0_2px_0_var(--border)]"
                          />
                        )}
                        <span
                          className={cn(
                            "relative grid size-10 shrink-0 place-items-center rounded-xl",
                            item.tint,
                          )}
                        >
                          <Critter
                            kind={item.kind}
                            className="size-7 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:-rotate-6 motion-reduce:transform-none"
                          />
                        </span>
                        <span className="relative min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {titleOf(notes[item.id] ?? "")}
                          </span>
                          <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            <span className="relative flex size-1.5 shrink-0">
                              {itemStatus === "live" && (
                                <span className="absolute inset-0 animate-ping rounded-full bg-grass-2 opacity-60 motion-reduce:animate-none" />
                              )}
                              <span
                                className={cn("size-1.5 rounded-full", statusDot[itemStatus])}
                              />
                            </span>
                            {metaOf(item)}
                          </span>
                        </span>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
                {!shown.length && (
                  <p className="px-2 py-3 text-sm text-muted-foreground">
                    no page called &quot;{query}&quot;.{" "}
                    <button
                      type="button"
                      onClick={addPage}
                      className="cursor-pointer text-sky-deep underline underline-offset-4"
                    >
                      start one
                    </button>
                  </p>
                )}
                <div className="mt-auto hidden items-center gap-2 rounded-full bg-white p-1.5 pr-3 text-sm shadow-[0_0_0_1px_var(--border)] md:flex">
                  <span className="grid size-7 place-items-center rounded-full bg-sky text-xs font-bold text-white">
                    H
                  </span>
                  <span className="text-xs font-medium">harper</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {pages.length} pages
                  </span>
                </div>
              </aside>

              {/* page */}
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
                  <div
                    role="tablist"
                    aria-label="View"
                    className="flex rounded-full bg-background p-1 text-[13px]"
                  >
                    {modes.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={mode === item.id}
                        onClick={() => setMode(item.id)}
                        className={cn(
                          "relative cursor-pointer rounded-full px-3 py-1 transition-colors",
                          mode === item.id
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {mode === item.id && <motion.span layoutId="demo-mode" className={pill} />}
                        <span className="relative">{item.label}</span>
                      </button>
                    ))}
                  </div>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={saving ? "saving" : "saved"}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      {saving ? (
                        <CircleNotch weight="bold" className="size-3.5 animate-spin" />
                      ) : (
                        <Check weight="bold" className="size-3.5 text-grass-3" />
                      )}
                      {saving ? "saving" : "saved"}
                    </motion.span>
                  </AnimatePresence>
                </div>
                <div
                  ref={canvas}
                  // A free canvas like the editor: the words sit on the dot grid, no page card.
                  // The theme colors the whole canvas, so dark reads as dark.
                  className={cn(
                    "h-[420px] overflow-y-auto bg-background bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[size:18px_18px] px-4 py-6 transition-colors md:h-[520px] md:px-8 md:py-10",
                    themes[theme],
                  )}
                >
                  {mode === "page" ? (
                    <motion.article
                      layout
                      key={active}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 220, damping: 26 }}
                      className={cn(
                        "mx-auto space-y-3 text-[15px] text-foreground",
                        fonts[font],
                        widths[width],
                      )}
                    >
                      <Preview blocks={blocks} accent={accents[accent]} />
                    </motion.article>
                  ) : (
                    // What "export markdown" downloads: the title as "# title", then the body.
                    <figure className={cn("mx-auto flex h-full flex-col", widths[width])}>
                      <figcaption className="pb-2 font-mono text-xs text-muted-foreground">
                        {file}
                      </figcaption>
                      <label className="flex flex-1">
                        <span className="sr-only">markdown</span>
                        <textarea
                          value={note}
                          maxLength={DEMO_LIMIT}
                          onChange={(event) => write(event.target.value)}
                          placeholder={"# a title\n\nthen anything at all."}
                          className="w-full resize-none rounded-lg bg-transparent py-2 font-mono text-[13px] leading-relaxed text-foreground outline-none focus-visible:shadow-[0_0_0_2px_var(--sky)]"
                        />
                      </label>
                    </figure>
                  )}
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    send();
                  }}
                  className="border-t border-border p-3"
                >
                  <div className="flex items-end gap-2 rounded-2xl bg-white p-1.5 pl-4 shadow-[0_0_0_1px_var(--border)] transition-shadow focus-within:shadow-[0_0_0_2px_var(--sky)]">
                    <label className="flex-1">
                      <span className="sr-only">add a line to the page</span>
                      <textarea
                        rows={1}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            send();
                          }
                        }}
                        placeholder="type a line and press enter to add it"
                        className="max-h-32 w-full resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
                      />
                    </label>
                    <motion.button
                      type="submit"
                      aria-label="Add to page"
                      whileTap={{ scale: 0.85 }}
                      animate={{ backgroundColor: draft.trim() ? "#2f6fc0" : "#16140f" }}
                      className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-white"
                    >
                      <ArrowUp weight="bold" className="size-4" />
                    </motion.button>
                  </div>
                </form>
              </div>

              {/* settings */}
              <div className="border-t border-border p-4 md:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0">
                <div className="flex flex-col items-center pb-4 pt-2 text-center">
                  <motion.span
                    key={active}
                    initial={{ scale: 0.6, rotate: -12 }}
                    animate={{ scale: 1, rotate: 0 }}
                    whileHover={{ rotate: [0, -8, 8, 0], transition: { duration: 0.5 } }}
                    transition={{ type: "spring", stiffness: 400, damping: 14 }}
                    className="grid size-16 place-items-center rounded-2xl transition-colors"
                    style={{ background: `${accents[accent]}1f` }}
                  >
                    <Critter kind={page.kind} className="size-11" />
                  </motion.span>
                  <p className="mt-3 max-w-full truncate text-lg font-medium">{title}</p>
                  <p className="max-w-full truncate text-xs text-muted-foreground">
                    {pageStatus} · {words} words
                  </p>
                </div>
                <div role="tablist" aria-label="Page settings" className="grid grid-cols-4 gap-1">
                  {tabs.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === item.id}
                      onClick={() => setTab(item.id)}
                      className={cn(
                        "relative flex cursor-pointer flex-col items-center gap-0.5 rounded-xl py-1.5 text-xs transition-colors",
                        tab === item.id
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tab === item.id && (
                        <motion.span
                          layoutId="demo-tab"
                          className="absolute inset-0 rounded-xl bg-background"
                        />
                      )}
                      <item.icon
                        weight={tab === item.id ? "fill" : "regular"}
                        className="relative size-4"
                      />
                      <span className="relative">{item.label}</span>
                    </button>
                  ))}
                </div>
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-4 min-h-64"
                >
                  {tab === "look" && (
                    <div className="space-y-4">
                      <Segmented
                        id="demo-font"
                        label="font"
                        value={font}
                        options={["serif", "sans", "mono"] as const}
                        onChange={setFont}
                      />
                      <div role="radiogroup" aria-label="accent">
                        <p className="mb-1.5 text-xs text-muted-foreground">accent</p>
                        <div className="flex gap-2">
                          {(Object.keys(accents) as Accent[]).map((name) => (
                            <motion.button
                              key={name}
                              type="button"
                              role="radio"
                              aria-checked={accent === name}
                              aria-label={name}
                              onClick={() => setAccent(name)}
                              whileHover={{ scale: 1.12 }}
                              whileTap={{ scale: 0.9 }}
                              className={cn(
                                "grid size-8 cursor-pointer place-items-center rounded-full border-[3px] border-white text-white",
                                accent === name ? "ring-2 ring-ink" : "ring-1 ring-border",
                              )}
                              style={{ background: accents[name] }}
                            >
                              {accent === name && (
                                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                                  <Check weight="bold" className="size-3.5" />
                                </motion.span>
                              )}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                      <Segmented
                        id="demo-width"
                        label="width"
                        value={width}
                        options={["narrow", "standard", "wide"] as const}
                        onChange={setWidth}
                      />
                      <Segmented
                        id="demo-theme"
                        label="theme"
                        value={theme}
                        options={["light", "dark", "system"] as const}
                        onChange={setTheme}
                      />
                    </div>
                  )}
                  {tab === "publish" && (
                    <div className="relative space-y-3">
                      <Segmented
                        id="demo-visibility"
                        label="who can find it"
                        value={visibility[active] ?? "public"}
                        options={["public", "unlisted"] as const}
                        onChange={(value) => setVisibility((all) => ({ ...all, [active]: value }))}
                      />
                      <div>
                        <p className="mb-1.5 text-xs text-muted-foreground">tags</p>
                        <div className="flex flex-wrap items-center gap-1.5 rounded-xl p-1.5 shadow-[0_0_0_1px_var(--border)]">
                          {pageTags.map((tag) => (
                            <motion.span
                              layout
                              key={tag}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="flex items-center gap-1 rounded-full bg-background py-0.5 pl-2.5 pr-1 text-xs"
                            >
                              {tag}
                              <button
                                type="button"
                                aria-label={`Remove ${tag}`}
                                onClick={() =>
                                  setTags((all) => ({
                                    ...all,
                                    [active]: pageTags.filter((item) => item !== tag),
                                  }))
                                }
                                className="grid size-4 cursor-pointer place-items-center rounded-full hover:bg-sky-soft"
                              >
                                <X weight="bold" className="size-2.5" />
                              </button>
                            </motion.span>
                          ))}
                          {pageTags.length < 5 && (
                            <input
                              aria-label="Add a tag"
                              value={tagDraft}
                              maxLength={24}
                              onChange={(event) => setTagDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  addTag();
                                }
                              }}
                              placeholder="add a tag"
                              className="min-w-16 flex-1 bg-transparent px-1 text-xs outline-none placeholder:text-muted-foreground"
                            />
                          )}
                        </div>
                      </div>
                      <div className="divide-y divide-border rounded-xl shadow-[0_0_0_1px_var(--border)]">
                        <Switch
                          label="email my subscribers"
                          hint={
                            !canEmail
                              ? "only public pages can be emailed"
                              : email
                                ? "sent when it goes live"
                                : "not this time"
                          }
                          on={emailing}
                          disabled={!canEmail}
                          onChange={setEmail}
                        />
                        <Switch
                          label="schedule it"
                          hint={
                            !schedule
                              ? "publish right away"
                              : published
                                ? "this edition stays live until then"
                                : "goes live at a set time"
                          }
                          on={schedule}
                          onChange={setSchedule}
                        />
                        {schedule && (
                          <label className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                            schedule for
                            <span className="flex items-center gap-1.5 text-xs">
                              {day}
                              <input
                                type="time"
                                aria-label="Time"
                                value={time}
                                onChange={(event) =>
                                  event.target.value && setTime(event.target.value)
                                }
                                className="rounded-full bg-background px-2.5 py-1 text-xs outline-none focus:shadow-[0_0_0_2px_var(--sky)]"
                              />
                            </span>
                          </label>
                        )}
                        <Switch
                          label="private draft link"
                          hint={
                            shared[active]
                              ? "anyone with it can read the draft"
                              : "only you can see the draft"
                          }
                          on={!!shared[active]}
                          onChange={(on) => setShared((all) => ({ ...all, [active]: on }))}
                        />
                        {shared[active] && (
                          <div className="px-3.5 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                example link <span className="font-mono">{shareLink}</span>
                              </span>
                              <button
                                type="button"
                                onClick={copyLink}
                                className="shrink-0 cursor-pointer rounded-full bg-background px-2.5 py-1 text-xs transition-colors hover:bg-sky-soft"
                              >
                                {copied ? "copied" : "copy"}
                              </button>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              create a working private link from your own drafts.
                            </p>
                          </div>
                        )}
                      </div>
                      <motion.button
                        type="button"
                        onClick={publish}
                        disabled={title === "untitled"}
                        whileTap={{ scale: 0.96, y: 2 }}
                        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-sky py-2.5 text-sm font-medium text-white shadow-[0_4px_0_var(--sky-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <PaperPlaneTilt weight="fill" className="size-4" />
                        {title === "untitled"
                          ? "add a # title to publish"
                          : schedule
                            ? `schedule for ${day} ${time}`
                            : published
                              ? "publish again"
                              : "publish"}
                      </motion.button>
                      <AnimatePresence>
                        {flying > 0 &&
                          burst.map((to, i) => (
                            <motion.span
                              key={`${flying}-${i}`}
                              aria-hidden="true"
                              className="pointer-events-none absolute bottom-10 left-1/2"
                              initial={{ x: 0, y: 0, opacity: 1, scale: 0.6, rotate: 0 }}
                              animate={{ x: to.x, y: to.y, opacity: 0, scale: 1, rotate: to.r }}
                              transition={{ duration: 1.1, ease: "easeOut", delay: i * 0.04 }}
                            >
                              <Critter kind={i % 2 ? "letter" : "plane"} className="size-7" />
                            </motion.span>
                          ))}
                      </AnimatePresence>
                      {pageStatus !== "draft" && (
                        <motion.p
                          key={flying}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex items-center gap-2 rounded-xl bg-[#dff5e3] px-3 py-2 font-mono text-xs text-grass-3"
                        >
                          <Eye weight="bold" className="size-3.5 shrink-0" />
                          <span className="truncate">
                            {queued[active]
                              ? `next edition goes live ${day} ${time}`
                              : pageStatus === "scheduled"
                                ? `goes live ${day} ${time}`
                                : `${pageStatus} at ${url}`}
                            {emailed[active] && pageStatus !== "unlisted"
                              ? queued[active] || pageStatus === "scheduled"
                                ? ", then emails"
                                : " · emailed"
                              : ""}
                          </span>
                        </motion.p>
                      )}
                    </div>
                  )}
                  {tab === "assist" && (
                    <div className="space-y-3">
                      <Segmented
                        id="demo-assist"
                        label="what would help?"
                        value={assist}
                        options={Object.keys(assistModes) as AssistMode[]}
                        labels={assistModes}
                        onChange={setAssist}
                      />
                      <motion.button
                        type="button"
                        onClick={() => setAsked(`${active}:${assist}`)}
                        whileTap={{ scale: 0.96, y: 2 }}
                        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-sky py-2.5 text-sm font-medium text-white shadow-[0_4px_0_var(--sky-deep)]"
                      >
                        <Sparkle weight="fill" className="size-4" />
                        ask for suggestions
                      </motion.button>
                      {asked === `${active}:${assist}` && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex gap-2.5 rounded-xl bg-background p-3 text-sm leading-relaxed"
                        >
                          <Critter kind="letter" className="size-6 shrink-0" />
                          <span>
                            {seed?.assist?.[assist] ??
                              "here only the sample pages have suggestions. in jot, it reads your own draft."}
                          </span>
                        </motion.div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        suggestions only. it never changes your text. in jot, AI works when your
                        instance turns it on, and your draft text is sent to OpenAI.
                      </p>
                    </div>
                  )}
                  {tab === "history" &&
                    (editions.length ? (
                      <ol className="relative space-y-2 before:absolute before:bottom-4 before:left-[19px] before:top-4 before:w-0.5 before:bg-border">
                        {editions.map((edition, i) => (
                          <li
                            key={edition.label}
                            className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-background"
                          >
                            <span
                              className={cn(
                                "size-3 shrink-0 rounded-full border-2 border-white ring-1",
                                i === 0 ? "bg-grass-2 ring-grass-2" : "bg-white ring-border",
                              )}
                            />
                            <span className="flex-1">
                              <span className="block text-sm">{edition.label}</span>
                              <span className="block text-xs text-muted-foreground">
                                {edition.when}
                              </span>
                            </span>
                            {i > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  write(edition.note);
                                  setMode("page");
                                }}
                                className="cursor-pointer rounded-full bg-background px-2.5 py-1 text-xs transition-colors hover:bg-sky-soft"
                              >
                                restore to draft
                              </button>
                            )}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        publish once and every edition is kept here.
                      </p>
                    ))}
                </motion.div>
              </div>
            </div>
          </Window>
        </SkyFrame>
      </Reveal>
    </section>
  );
}
