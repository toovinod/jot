"use client";
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Archive,
  BatteryHigh,
  BookmarkSimple,
  CaretLeft,
  ChatCircle,
  Check,
  CellSignalHigh,
  EnvelopeSimple,
  GlobeSimple,
  Heart,
  Trash,
  WifiHigh,
} from "@phosphor-icons/react";
import { cn, slugify } from "@/lib/utils";
import { Critter } from "@/components/world/critters";
import { PixelArt, paintPixels, seeded } from "@/components/world/pixel";
import { demoTitle, parseDemoNote } from "./demo-parse";
import { SCHEMA_POST } from "./posts";
import { Reveal } from "./reveal";

// A pixel meadow: banded sky, two clouds, hazy hills, a tree line, and a field of flowers.
const COLS = 220;
const ROWS = 100;
const cloudShapes = [
  {
    row: 8,
    col: 22,
    rows: [
      "     ######       ",
      "   ##########     ",
      " ################ ",
      "##################",
      "  cccccccccccccc  ",
    ],
  },
  {
    row: 16,
    col: 172,
    rows: ["   ####   ", " ######## ", "##########", "  cccccc  "],
  },
];
const skyBands = ["#0fb0ff", "#22b9ff", "#3cc3ff", "#5ccdff"];
const hill = (col: number) => 52 + Math.round(2 * Math.sin(col / 11) + 1.5 * Math.sin(col / 4.7));
const treeTops = (() => {
  const random = seeded(11);
  const tops: number[] = [];
  while (tops.length < COLS) {
    const height = 57 + Math.floor(random() * 6);
    const width = 3 + Math.floor(random() * 5);
    for (let i = 0; i < width; i++) tops.push(height + (i === 0 || i === width - 1 ? 1 : 0));
  }
  return tops;
})();
const flowers = (() => {
  const random = seeded(23);
  const petals = ["#ffffff", "#ffc6dc", "#fff3a6"];
  const map = new Map<string, string>();
  for (let i = 0; i < 46; i++) {
    const row = 70 + Math.floor(random() * 27);
    const col = 2 + Math.floor(random() * (COLS - 4));
    const petal = petals[Math.floor(random() * petals.length)];
    map.set(`${row},${col}`, "#ffd23f");
    for (const [r, c] of [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ])
      map.set(`${r},${c}`, petal);
  }
  return map;
})();

const meadow = paintPixels(COLS, ROWS, (row, col, random) => {
  for (const cloud of cloudShapes) {
    const cell = cloud.rows[row - cloud.row]?.[col - cloud.col];
    if (cell === "#") return "#ffffff";
    if (cell === "c") return "#fff1b8";
  }
  const flower = flowers.get(`${row},${col}`);
  if (flower) return flower;
  const roll = random();
  if (row >= 64) return roll < 0.06 ? "#c3ea2a" : roll < 0.1 ? "#e4fb6a" : "#d4f53c";
  if (row >= treeTops[col]) return roll < 0.08 ? "#1fb85c" : "#2bcb6a";
  if (row >= hill(col)) return roll < 0.12 ? "#e2ebff" : "#c6d7ff";
  const band = Math.min(3, Math.floor(row / 13));
  const blend = row % 13 >= 11 && band < 3 && roll < 0.5 ? band + 1 : band;
  return skyBands[blend];
});

function Reactions() {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <div className="flex items-center gap-0.5 text-[11px]">
      <button
        type="button"
        aria-pressed={liked}
        aria-label="Like"
        onClick={() => setLiked((on) => !on)}
        className="relative flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 transition-colors hover:bg-[#fff0f5]"
      >
        <motion.span
          key={String(liked)}
          initial={{ scale: liked ? 0.3 : 1 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 12 }}
        >
          <Heart
            weight={liked ? "fill" : "regular"}
            className={cn("size-3.5", liked && "text-[#ff4f8b]")}
          />
        </motion.span>
        <span className="tabular-nums">{128 + Number(liked)}</span>
        <AnimatePresence>
          {liked && (
            <motion.span
              aria-hidden="true"
              initial={{ opacity: 1, y: 0, scale: 0.6 }}
              animate={{ opacity: 0, y: -26, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="pointer-events-none absolute -top-1 left-1"
            >
              <Critter kind="heart" className="size-5" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <button
        type="button"
        aria-pressed={saved}
        aria-label="Bookmark"
        onClick={() => setSaved((on) => !on)}
        className="cursor-pointer rounded-full p-1.5 transition-colors hover:bg-[#f2eeff]"
      >
        <BookmarkSimple
          weight={saved ? "fill" : "regular"}
          className={cn("size-3.5 transition-colors", saved && "text-[#7c5cff]")}
        />
      </button>
      <span className="flex items-center gap-1 px-2 py-1">
        <ChatCircle className="size-3.5" /> 12
      </span>
    </div>
  );
}

// The fourth sample post, shown twice: as Harper's page on the web and as the email
// subscribers get. Both render the same parsed blocks, parsed once.
const post = parseDemoNote(SCHEMA_POST);
const postTitle = demoTitle(SCHEMA_POST);
const postBody = post.filter((block) => block.kind !== "h1");
const postSubtitle = "a 40ms migration, a four minute outage, and the lock queue in between.";
const postPath = `@harper/${slugify(postTitle)}`;

const reading = {
  web: {
    p: "text-[11.5px] leading-relaxed",
    h2: "pt-2 text-[13.5px] font-medium tracking-[-0.01em]",
    code: "text-[9.5px] p-2.5",
  },
  mail: {
    p: "text-[10px] leading-relaxed",
    h2: "pt-1.5 text-[11.5px] font-medium tracking-[-0.01em]",
    code: "text-[8px] p-2",
  },
} as const;

function PostText({ size }: { size: keyof typeof reading }) {
  const type = reading[size];
  return (
    <div className="space-y-2">
      {postBody.map((block, i) => {
        if (block.kind === "h2")
          return (
            <p key={i} className={type.h2}>
              {block.text}
            </p>
          );
        if (block.kind === "code")
          return (
            <pre
              key={i}
              className={cn(
                "overflow-x-auto rounded-md bg-[#f6f3ea] font-mono leading-relaxed text-[#3d3a30]",
                type.code,
              )}
            >
              {block.text}
            </pre>
          );
        if (block.kind === "li")
          return (
            <p key={i} className={cn("flex gap-1.5 pl-0.5", type.p)}>
              <span className="mt-[0.6em] size-1 shrink-0 rounded-full bg-[#1677c9]" />
              {block.text}
            </p>
          );
        return (
          <p key={i} className={type.p}>
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

const Avatar = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "grid shrink-0 place-items-center rounded-full bg-sky font-bold text-white",
      className,
    )}
  >
    H
  </span>
);

// Laptop shell colors: a cream lid and deck, a dark screen bezel, pastel keys.
const shell = { lid: "#f4e9cb", edge: "#e6d6a8", deck: "#f0e3be", front: "#e2d1a1" };
const keyColors = ["#ffd6e4", "#e0d8ff", "#d3eaff", "#fff3d1", "#fff0a3"];

// The deck is drawn in perspective: its back edge meets the hinge, its front edge is wider.
// Every key row follows the same slant, so the keyboard sits flat on the deck.
const DECK = { back: 5, front: 58, backInset: 36, frontInset: 4 };
const deckLeft = (y: number) =>
  DECK.backInset +
  ((DECK.frontInset - DECK.backInset) * (y - DECK.back)) / (DECK.front - DECK.back);
const deckPoint = (u: number, y: number) => {
  const left = deckLeft(y);
  return `${(left + u * (500 - 2 * left)).toFixed(1)},${y}`;
};
const deckQuad = (u0: number, u1: number, top: number, bottom: number) =>
  [deckPoint(u0, top), deckPoint(u1, top), deckPoint(u1, bottom), deckPoint(u0, bottom)].join(" ");

// Relative key widths per row, back to front. The front row has the space bar.
const keyRows = [
  Array.from({ length: 14 }, () => 1),
  [1.5, ...Array.from({ length: 12 }, () => 1), 1.5],
  [1.8, ...Array.from({ length: 11 }, () => 1), 2.2],
  [1.2, 1, 1, 1.2, 6, 1.2, 1, 1, 1],
];
const KEYS = { from: 0.14, to: 0.86, top: 9, row: 6.2, gap: 1.4, keyGap: 0.006 };
const keys = keyRows.flatMap((row, r) => {
  const total = row.reduce((sum, grow) => sum + grow, 0);
  const span = KEYS.to - KEYS.from - KEYS.keyGap * (row.length - 1);
  const top = KEYS.top + r * (KEYS.row + KEYS.gap);
  let u = KEYS.from;
  return row.map((grow, i) => {
    const width = (grow / total) * span;
    const key = {
      points: deckQuad(u, u + width, top, top + KEYS.row),
      fill: keyColors[(i + r * 2) % keyColors.length],
    };
    u += width + KEYS.keyGap;
    return key;
  });
});

// The lower half of the laptop: hinge, the deck's top face with keys and a trackpad,
// and the front edge with a thumb notch.
function Deck() {
  return (
    <svg aria-hidden="true" viewBox="0 0 500 72" className="block h-auto w-full">
      <path d="M34 0h432v3.5a2.5 2.5 0 0 1-2.5 2.5h-427A2.5 2.5 0 0 1 34 3.5Z" fill="#cdbb86" />
      <polygon
        points={`${DECK.backInset},${DECK.back} ${500 - DECK.backInset},${DECK.back} ${500 - DECK.frontInset},${DECK.front} ${DECK.frontInset},${DECK.front}`}
        fill={shell.deck}
        stroke={shell.deck}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <polygon
        points={deckQuad(0.125, 0.875, 7.5, KEYS.top + 4 * (KEYS.row + KEYS.gap))}
        fill={shell.edge}
        stroke={shell.edge}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {keys.map((key, i) => (
        <polygon
          key={i}
          points={key.points}
          fill={key.fill}
          stroke={key.fill}
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
      ))}
      <polygon
        points={deckQuad(0.37, 0.63, 43, 54)}
        fill="#e9dbb1"
        stroke="#e9dbb1"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M4 58h492c2 0 3 1 2.4 3l-1.6 5.5c-.8 2.6-2.8 4-5.6 4H8.8c-2.8 0-4.8-1.4-5.6-4L1.6 61C1 59 2 58 4 58Z"
        fill={shell.front}
      />
      <path d="M218 58h64c-1.2 4-3.8 5.6-8 5.6h-48c-4.2 0-6.8-1.6-8-5.6Z" fill="#d3bf88" />
    </svg>
  );
}

function Laptop() {
  return (
    <div className="relative w-full max-w-[480px]">
      {/* lid: a cream shell around a dark bezel, the camera centered in the top bezel */}
      <div
        className="relative mx-[6.8%] rounded-t-[18px] p-[5px] pb-0"
        style={{ background: shell.lid, boxShadow: `inset 0 0 0 1.5px ${shell.edge}` }}
      >
        <div className="relative rounded-t-[13px] bg-[#26241f] px-[7px] pb-[9px] pt-[15px]">
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-[5px] grid size-[6px] -translate-x-1/2 place-items-center rounded-full bg-[#3a4454]"
          >
            <span className="size-[2px] rounded-full bg-[#8ea3bf]" />
          </span>
          {/* The reading page: title, subtitle, byline, the post, then likes, save and comments. */}
          <div className="flex h-[236px] flex-col overflow-hidden rounded-[3px] bg-white md:h-[256px]">
            <div className="flex h-5 shrink-0 items-center gap-1 border-b border-[#f0ece2] bg-[#faf8f3] px-2">
              <span className="size-1 rounded-full bg-[#ff5f57]" />
              <span className="size-1 rounded-full bg-[#febc2e]" />
              <span className="size-1 rounded-full bg-[#28c840]" />
              <span className="mx-auto max-w-[70%] truncate rounded-full bg-white px-2 text-[8px] leading-[13px] text-muted-foreground shadow-[0_0_0_1px_#f0ece2]">
                {postPath}
              </span>
            </div>
            <div
              tabIndex={0}
              aria-label="Harper's post on the web"
              className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3 outline-none [scrollbar-width:thin] sm:px-6"
            >
              <p className="text-xl leading-tight tracking-[-0.02em]">{postTitle}</p>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{postSubtitle}</p>
              <p className="mb-2.5 mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Avatar className="size-4 text-[8px]" /> Harper · nov 12, 2026
              </p>
              <PostText size="web" />
            </div>
            <div className="border-t border-[#f0ece2] px-2 pb-1.5 pt-1">
              <div className="flex items-center justify-between">
                <Reactions />
                <span className="flex items-center gap-1 rounded-full bg-[#eaf6ff] px-2 py-0.5 text-[10px] text-[#1677c9]">
                  <EnvelopeSimple weight="bold" className="size-3" /> subscribe
                </span>
              </div>
              <div className="mx-1 mt-1 flex items-start gap-1.5 rounded-lg bg-[#f6f4ee] px-2 py-1.5 text-[10px]">
                <Critter kind="book" className="size-3.5 shrink-0" />
                <span>
                  <span className="text-muted-foreground">a reader</span> we hit the same lock queue
                  last year. lock_timeout and a retry loop were all it took.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Deck />
    </div>
  );
}

// Side buttons sit flush on the frame: action and volume on the left, power on the right,
// centered on the volume pair.
const sideButtons = [
  "-left-[3px] top-[66px] h-[16px] rounded-l-[2px]",
  "-left-[3px] top-[96px] h-[30px] rounded-l-[2px]",
  "-left-[3px] top-[132px] h-[30px] rounded-l-[2px]",
  "-right-[3px] top-[103px] h-[52px] rounded-r-[2px]",
];

function Phone() {
  const [left, setLeft] = useState(false);
  return (
    <div className="relative w-[176px] shrink-0">
      {sideButtons.map((place) => (
        <span
          key={place}
          aria-hidden="true"
          className={cn("absolute w-[3px]", place)}
          style={{ background: shell.front }}
        />
      ))}
      <div
        className="rounded-[32px] p-[3px]"
        style={{ background: shell.lid, boxShadow: `inset 0 0 0 1.5px ${shell.edge}` }}
      >
        <div className="rounded-[29px] bg-[#26241f] p-[5px]">
          <div className="relative flex h-[340px] flex-col overflow-hidden rounded-[24px] bg-white">
            <div className="relative flex h-7 shrink-0 items-center justify-between px-5 text-[9px] font-semibold">
              <span>9:41</span>
              <span className="absolute left-1/2 top-1/2 h-[15px] w-[50px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" />
              <span className="flex items-center gap-0.5">
                <CellSignalHigh weight="fill" className="size-2.5" />
                <WifiHigh weight="bold" className="size-2.5" />
                <BatteryHigh weight="fill" className="size-3" />
              </span>
            </div>
            {/* The mail app: back to the inbox, then sender and subject. */}
            <div className="flex shrink-0 items-center justify-between px-2.5 pb-1 text-[10px] text-[#1677c9]">
              <span className="flex items-center">
                <CaretLeft weight="bold" className="size-3" /> inbox
              </span>
              <span className="flex items-center gap-2 text-muted-foreground">
                <Archive className="size-3" />
                <Trash className="size-3" />
              </span>
            </div>
            <div className="shrink-0 border-b border-[#f0ece2] px-3 pb-2">
              <p className="flex items-center gap-1.5 text-[10px]">
                <Avatar className="size-5 text-[9px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">Harper · via jot</span>
                  <span className="block text-[8.5px] text-muted-foreground">to me</span>
                </span>
                <span className="self-start text-[8.5px] text-muted-foreground">9:40</span>
              </p>
              {/* The subject is the post title; the email carries the whole post. */}
              <p className="mt-1.5 text-[13px] font-medium leading-tight">{postTitle}</p>
            </div>
            <div
              tabIndex={0}
              aria-label="Harper's post in the email"
              className="min-h-0 flex-1 overflow-y-auto px-3 py-2 outline-none [scrollbar-width:none]"
            >
              <p className="mb-2 text-[10px] leading-relaxed text-muted-foreground">
                {postSubtitle}
              </p>
              <PostText size="mail" />
            </div>
            <div className="shrink-0 border-t border-[#f0ece2] px-3 pt-2 text-center">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#1677c9] px-2.5 py-1 text-[9px] text-white">
                <GlobeSimple weight="bold" className="size-2.5" /> read on the web
              </span>
              <p className="py-1.5 text-[8.5px] leading-snug text-muted-foreground">
                {left ? (
                  <span className="inline-flex items-center gap-1 text-grass-3">
                    <Check weight="bold" className="size-2.5" />
                    <span>unsubscribed. no more emails from Harper.</span>
                  </span>
                ) : (
                  <>
                    you&apos;re getting this because you subscribed to Harper.{" "}
                    <button
                      type="button"
                      onClick={() => setLeft(true)}
                      className="cursor-pointer underline underline-offset-2 hover:text-foreground"
                    >
                      unsubscribe
                    </button>
                  </>
                )}
              </p>
              <span className="mx-auto mb-1.5 block h-1 w-14 rounded-full bg-ink/80" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const Label = ({ children }: { children: ReactNode }) => (
  <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm text-ink shadow-[0_1px_0_rgba(0,0,0,.06),0_4px_12px_-4px_rgba(0,0,0,.18)]">
    {children}
  </span>
);

export function Readers() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 md:px-8">
      <Reveal className="grid items-end gap-6 md:grid-cols-2">
        <h2 className="max-w-[10em] font-display text-4xl font-medium leading-[1.03] tracking-[-0.045em] md:text-[56px]">
          pages people come back to.
        </h2>
        <p className="max-w-md text-lg leading-relaxed text-muted-foreground md:justify-self-end">
          signed-in readers can like, save and reply, and find more in discover. when email is set
          up, anyone can subscribe and confirm their address, and you choose which public pages to
          send. every email has an unsubscribe link.
        </p>
      </Reveal>
      <Reveal delay={0.1}>
        <div className="relative isolate mt-12 overflow-hidden rounded-[22px] px-4 pb-6 pt-24 md:pt-28">
          <PixelArt cols={COLS} rows={ROWS} cells={meadow} fit="cover" className="-z-10" />
          <div className="mx-auto flex max-w-[760px] items-end justify-center gap-6 md:gap-12">
            <div className="hidden min-w-0 max-w-[460px] flex-1 flex-col items-center gap-5 sm:flex">
              <Laptop />
              <Label>
                <GlobeSimple weight="bold" className="size-4 text-[#1677c9]" /> on the web
              </Label>
            </div>
            <div className="flex flex-col items-center gap-5">
              <Phone />
              <Label>
                <EnvelopeSimple weight="bold" className="size-4 text-[#ff4f8b]" /> in their inbox
              </Label>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
