import { greeting } from "@/lib/dashboard-stats";
import type { CritterKind } from "@/components/world/critters";

/** Picks one entry for a roll in [0, 1), the way Math.random() returns it. */
export const pick = <T>(pool: readonly T[], roll: number) =>
  pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))];

/** How often the hello and the tab title change while the dashboard is open. */
export const rotationMs = 5000;

/** Picks the next entry for a roll, never repeating the current one when the pool has others. */
export function rotate<T>(pool: readonly T[], current: T, roll: number): T {
  const others = pool.filter((entry) => entry !== current);
  return others.length ? pick(others, roll) : current;
}

/** The dashboard's big hello. A new one is rolled each visit; none of them claim a number. */
export function greetings(name: string, now: Date): string[] {
  const hour = now.getHours();
  const late = hour >= 22 || hour < 5;
  if (!name)
    return [
      `${greeting(now)}.`,
      "welcome back.",
      "the blank page says hi.",
      "the words are waiting.",
      "one more sentence?",
      "pull up a chair.",
      "coffee, then a paragraph.",
      ...(late ? ["still writing at this hour?"] : []),
    ];
  return [
    `${greeting(now)}, ${name}.`,
    `welcome back, ${name}.`,
    `hello again, ${name}.`,
    `good to see you, ${name}.`,
    `hey ${name}, pen's warm.`,
    `the desk is yours, ${name}.`,
    `back at it, ${name}?`,
    `ink's fresh, ${name}.`,
    `pull up a chair, ${name}.`,
    `${name}, the page missed you.`,
    `write something, ${name}.`,
    "the blank page says hi.",
    "the words are waiting.",
    "one more sentence?",
    "coffee, then a paragraph.",
    "the critters saved your seat.",
    "today's page is wide open.",
    ...(late ? [`burning the midnight ink, ${name}?`, "still writing at this hour?"] : []),
  ];
}

/** The line under the hello, built only from the writer's real totals. */
export function standing(stats: { drafts: number; live: number }): string[] {
  const n = stats.drafts;
  if (n === 1)
    return [
      "1 draft waiting.",
      "1 draft on the desk.",
      "1 draft, warming up.",
      "1 draft wants a second look.",
    ];
  if (n > 1)
    return [
      `${n} drafts waiting.`,
      `${n} drafts on the desk.`,
      `${n} drafts, warming up.`,
      `${n} drafts want a second look.`,
    ];
  if (stats.live)
    return [
      "everything you wrote is live.",
      "no drafts. every page is out.",
      "all caught up.",
      "every page is out in the world.",
    ];
  return [
    "a blank page is a good beginning.",
    "the first page is the bravest.",
    "start anywhere. fix it later.",
  ];
}

/** Browser tab titles for the dashboard, in the spirit of a tab that keeps chattering. */
export const tabTitles = [
  "jot - your drafts are stretching",
  "jot - the pages are whispering",
  "jot - the critters are proofreading",
  "jot - a sentence is brewing",
  "jot - ink still drying",
  "jot - the blank page blinked",
  "jot - pencils sharpened",
  "jot - the paper plane is circling",
  "jot - the bookmark is napping",
  "jot - words doing warmups",
  "jot - the desk is tidy-ish",
  "jot - coffee and commas",
];

// Every row gets its own cast member and tile tint, so a list reads like a lively shelf.
const rowCast: CritterKind[] = [
  "page",
  "plane",
  "letter",
  "book",
  "heart",
  "star",
  "bookmark",
  "pencil",
  "cup",
  "cloud",
];
const rowTints = ["#fff6d6", "#e6f8e1", "#e3f2ff", "#ffe4ec", "#efe9ff", "#e0f7f1", "#ffeadb"];

/** FNV-1a: a small, stable string hash. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** The same post always gets the same critter and tint. */
export function rowLook(id: string): { kind: CritterKind; tint: string } {
  const h = hash(id);
  return { kind: rowCast[h % rowCast.length], tint: rowTints[(h >>> 8) % rowTints.length] };
}
