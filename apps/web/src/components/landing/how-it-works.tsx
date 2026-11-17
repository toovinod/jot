"use client";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import {
  Check,
  ClipboardText,
  Eye,
  FileMd,
  ImageSquare,
  Layout,
  MagnifyingGlass,
  PaperPlaneTilt,
  RssSimple,
  UserPlus,
  type Icon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Critter, type CritterKind } from "@/components/world/critters";
import { PixelArt, paintPixels } from "@/components/world/pixel";

// The landscape is pixel art on a fixed grid. Rows run top to bottom.
const COLS = 240;
const ROWS = 60;
const GROUND = 53;
const tops = [42, 31, 20, 9];
const bandColors = ["#3ccf45", "#b6ea3c", "#6ee23a", "#3ccf45"];
const bandShades = ["#34bf3e", "#a6dc30", "#62d433", "#34bf3e"];
const SKY = "#a6dcfb";
const SKY_SPECK = "#c2e8fd";
const CREAM = "#fbf3d5";
const edge = (row: number) => 6 + Math.floor((GROUND - row) / 2) * 7;

// Each band's left end is a cream staircase that meets the cream ledge on its top, like terraced steps.
const scene = paintPixels(COLS, GROUND + 7, (row, col, random) => {
  const roll = random();
  if (row >= GROUND) {
    if (roll >= 1 - (row - GROUND + 1) / 8) return "";
    return random() < 0.25 ? "#86e04a" : bandColors[0];
  }
  if (row < 8 && roll > ((row + 1) / 9) ** 1.4) return "";
  if (col < edge(row)) return random() < 0.05 ? SKY_SPECK : SKY;
  const band = tops.findIndex((top) => top <= row);
  if (band >= 0 && (row - tops[band] < 2 || col < edge(row) + 2)) return CREAM;
  const shade = band < 0 ? 3 : band;
  return random() < 0.07 ? bandShades[shade] : bandColors[shade];
});

// The cast at work on real jot jobs, one stretch of the trip per terrace.
// The editor demo covers the panels, so these stick to what it doesn't show.
const terraces: { kind: CritterKind; jobs: { icon: Icon; text: string }[] }[] = [
  {
    kind: "page",
    jobs: [
      { icon: ClipboardText, text: "keeping headings from a Google Doc" },
      { icon: FileMd, text: "importing README.md" },
    ],
  },
  {
    kind: "book",
    jobs: [
      { icon: ImageSquare, text: "dropping in a screenshot" },
      { icon: Layout, text: "putting the cover first" },
    ],
  },
  {
    kind: "plane",
    jobs: [
      { icon: RssSimple, text: "landing in the RSS feed" },
      { icon: MagnifyingGlass, text: "showing up in discover" },
    ],
  },
  {
    kind: "letter",
    jobs: [
      { icon: UserPlus, text: "confirming a subscriber" },
      { icon: Eye, text: "counting reads" },
    ],
  },
];

function Job({ jobs, offset }: { jobs: { icon: Icon; text: string }[]; offset: number }) {
  const still = !!useReducedMotionConfig();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (still) return;
    let timer: ReturnType<typeof setInterval>;
    const start = setTimeout(
      () => {
        setI((n) => (n + 1) % jobs.length);
        timer = setInterval(() => setI((n) => (n + 1) % jobs.length), 3600);
      },
      3600 + offset * 800,
    );
    return () => {
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [still, jobs.length, offset]);
  const { icon: JobIcon, text } = jobs[i];
  return (
    <span className="relative flex h-7 items-center overflow-hidden whitespace-nowrap rounded-full bg-white px-2.5 text-[11px] text-ink shadow-[0_1px_0_rgba(0,0,0,.06),0_2px_8px_-2px_rgba(0,0,0,.12)] md:text-xs">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -14, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-1.5"
        >
          <JobIcon weight="bold" className="size-3.5 text-sky" />
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Landscape() {
  return (
    <div aria-hidden="true" className="flex justify-center overflow-hidden">
      <div className="relative aspect-[240/60] w-full min-w-[880px] shrink-0">
        <PixelArt cols={COLS} rows={ROWS} cells={scene} />
        {terraces.map((terrace, i) => (
          <div
            key={terrace.kind}
            className="absolute flex -translate-y-full items-end gap-2"
            style={{
              left: `${((edge(tops[i]) + 3) / COLS) * 100}%`,
              top: `${(tops[i] / ROWS) * 100}%`,
            }}
          >
            <Critter
              kind={terrace.kind}
              blinkDelay={-i}
              className="size-9 animate-[hop_2.4s_ease-in-out_infinite] motion-reduce:animate-none md:size-10"
              style={{ animationDelay: `${-i * 0.6}s` }}
            />
            <span className="mb-1.5">
              <Job jobs={terrace.jobs} offset={i} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Corners step in by one pixel, like the landscape above.
const notched =
  "[clip-path:polygon(0_6px,3px_6px,3px_3px,6px_3px,6px_0,calc(100%_-_6px)_0,calc(100%_-_6px)_3px,calc(100%_-_3px)_3px,calc(100%_-_3px)_6px,100%_6px,100%_calc(100%_-_6px),calc(100%_-_3px)_calc(100%_-_6px),calc(100%_-_3px)_calc(100%_-_3px),calc(100%_-_6px)_calc(100%_-_3px),calc(100%_-_6px)_100%,6px_100%,6px_calc(100%_-_3px),3px_calc(100%_-_3px),3px_calc(100%_-_6px),0_calc(100%_-_6px))]";

function PasteKey() {
  const [pasted, setPasted] = useState(false);
  return (
    <motion.button
      type="button"
      onClick={() => setPasted((on) => !on)}
      whileTap={{ y: 3, boxShadow: "0 0 0 #000" }}
      className="flex cursor-pointer items-center gap-2 bg-ink px-3.5 py-2 text-sm text-white shadow-[0_4px_0_#000]"
    >
      <span className="font-mono">⌘V</span>
      {pasted ? <span>headings kept.</span> : "paste"}
    </motion.button>
  );
}

const fonts = [
  { name: "serif", className: "font-serif", line: "bg-[#ffd34d]" },
  { name: "sans", className: "font-sans", line: "bg-[#9fdcff]" },
  { name: "mono", className: "font-mono", line: "bg-[#c6b3ff]" },
] as const;

function Fonts() {
  const [font, setFont] = useState<string>("sans");
  return (
    <div className="flex gap-2">
      {fonts.map((item) => (
        <button
          key={item.name}
          type="button"
          aria-pressed={font === item.name}
          onClick={() => setFont(item.name)}
          className={cn(
            "relative cursor-pointer bg-white px-3 pb-2 pt-1.5 text-xs transition-opacity",
            item.className,
            font === item.name ? "opacity-100" : "opacity-60 hover:opacity-100",
          )}
        >
          {font === item.name && <Check weight="bold" className="mr-1 inline size-3" />}
          {item.name}
          <span className={cn("absolute inset-x-0 bottom-0 h-1", item.line)} />
        </button>
      ))}
    </div>
  );
}

function PublishButton() {
  const [live, setLive] = useState(false);
  return (
    <motion.button
      type="button"
      onClick={() => setLive((on) => !on)}
      whileTap={{ scale: 0.97 }}
      className="flex w-full cursor-pointer items-center gap-2 bg-white px-3 py-2.5 text-left text-xs"
    >
      {live ? (
        <Check weight="bold" className="size-3.5 text-grass-3" />
      ) : (
        <PaperPlaneTilt weight="fill" className="size-3.5 text-sky" />
      )}
      {live ? <span>live as edition 1.</span> : "publish this page"}
    </motion.button>
  );
}

const stops: { title: string; body: string; stripe: string; extra: ReactNode }[] = [
  {
    title: "paste it in",
    body: "paste from Google Docs, Word or the web. headings, lists and links come along.",
    stripe: "bg-[#bfe6ff]",
    extra: <PasteKey />,
  },
  {
    title: "give it a look",
    body: "pick a font, an accent and a reading width. drag the cover, title and bio into place.",
    stripe: "bg-[#ffe98a]",
    extra: <Fonts />,
  },
  {
    title: "publish it",
    body: "share it openly or keep it unlisted. keep editing; readers see the live page until you publish again.",
    stripe: "bg-[#ffc2d6]",
    extra: <PublishButton />,
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 py-24 md:py-32">
      <Landscape />
      <div className="mx-auto max-w-5xl px-4 pt-16 md:px-8 md:pt-24">
        <h2 className="max-w-3xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.045em] md:text-[56px]">
          from messy notes to a page people actually read.
        </h2>
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {stops.map((stop, i) => (
            <motion.li
              key={stop.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
              className={cn(
                "relative flex min-h-[290px] flex-col bg-foreground/[0.045] p-5 pb-8",
                notched,
              )}
            >
              <span className="font-display text-4xl font-normal tracking-[-0.04em]">{i + 1}</span>
              <h3 className="mt-3 text-lg font-semibold tracking-[-0.02em]">{stop.title}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
                {stop.body}
              </p>
              <div className="mt-6">{stop.extra}</div>
              <span className={cn("absolute inset-x-1.5 bottom-1.5 h-1.5", stop.stripe)} />
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
