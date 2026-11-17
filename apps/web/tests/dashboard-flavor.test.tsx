import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  greetings,
  pick,
  rotate,
  rotationMs,
  rowLook,
  standing,
  tabTitles,
} from "../src/app/dashboard/flavor";
import { SceneHeader, StatusBadge } from "../src/components/app";
import { critterKinds } from "../src/components/world/critters";

const tidy = (line: string) => {
  expect(line).toBe(line.toLowerCase());
  expect(line).not.toContain(String.fromCharCode(0x2014));
  expect(line).not.toMatch(/\p{Extended_Pictographic}/u);
  expect(line).not.toMatch(/fictional|sample|example|fake|simulated/);
};

test("pick maps a roll in [0, 1) onto every entry of a pool", () => {
  const pool = ["a", "b", "c"];
  expect(pick(pool, 0)).toBe("a");
  expect(pick(pool, 0.5)).toBe("b");
  expect(pick(pool, 0.9999)).toBe("c");
  expect(pick(pool, 1)).toBe("c");
});

test("the greeting pool is varied, warm, and uses the writer's first name", () => {
  const noon = new Date(2026, 0, 1, 12);
  const pool = greetings("vinod", noon);
  expect(pool.length).toBeGreaterThanOrEqual(15);
  expect(pool.length).toBeLessThanOrEqual(25);
  expect(new Set(pool).size).toBe(pool.length);
  expect(pool).toContain("afternoon, vinod.");
  expect(pool.filter((line) => line.includes("vinod")).length).toBeGreaterThanOrEqual(8);
  expect(pool.some((line) => !line.includes("vinod"))).toBe(true);
  pool.forEach(tidy);
  // Rolling across the pool gives different hellos, not one fixed line.
  const rolled = new Set(Array.from({ length: 20 }, (_, i) => pick(pool, i / 20)));
  expect(rolled.size).toBeGreaterThan(10);
});

test("late nights add a couple of night owl lines, and no name drops the named ones", () => {
  expect(greetings("vinod", new Date(2026, 0, 1, 23))).toContain(
    "burning the midnight ink, vinod?",
  );
  expect(greetings("vinod", new Date(2026, 0, 1, 9))).not.toContain(
    "burning the midnight ink, vinod?",
  );
  const anonymous = greetings("", new Date(2026, 0, 1, 9));
  expect(anonymous).toContain("morning.");
  expect(anonymous.some((line) => line.includes(" ,") || line.includes(", ."))).toBe(false);
});

test("the line under the hello only states real totals", () => {
  for (const line of standing({ drafts: 7, live: 2 })) {
    expect(line.startsWith("7 drafts")).toBe(true);
    tidy(line);
  }
  for (const line of standing({ drafts: 1, live: 0 }))
    expect(line.startsWith("1 draft")).toBe(true);
  for (const line of [...standing({ drafts: 0, live: 3 }), ...standing({ drafts: 0, live: 0 })]) {
    expect(line).not.toMatch(/\d/);
    tidy(line);
  }
});

test("tab titles all name jot and keep to plain hyphens", () => {
  expect(tabTitles.length).toBeGreaterThanOrEqual(8);
  for (const title of tabTitles) {
    expect(title.startsWith("jot - ")).toBe(true);
    tidy(title);
  }
});

test("each row's critter and tint follow its post id, and a list mixes the cast", () => {
  expect(rowLook("post-42")).toEqual(rowLook("post-42"));
  const looks = Array.from({ length: 60 }, (_, i) => rowLook(`post-${i}`));
  const kinds = new Set(looks.map((look) => look.kind));
  expect(kinds.size).toBeGreaterThanOrEqual(8);
  for (const kind of kinds) expect(critterKinds).toContain(kind);
  expect(new Set(looks.map((look) => look.tint)).size).toBeGreaterThanOrEqual(5);
});

test("a scene header can carry a cast, each bobbing unless motion is reduced", () => {
  const html = renderToStaticMarkup(
    <SceneHeader title="discover." cast={["plane", "cloud", "letter", "star"]} />,
  );
  expect(html.match(/<svg viewBox="0 0 48 48"/g)?.length).toBe(4);
  expect(html.match(/animate-\[hop/g)?.length).toBe(4);
  expect(html.match(/motion-reduce:animate-none/g)!.length).toBeGreaterThanOrEqual(4);
  const single = renderToStaticMarkup(<SceneHeader title="settings." critter="star" />);
  expect(single.match(/<svg viewBox="0 0 48 48"/g)?.length).toBe(1);
});

test("status pills are white with ink text, except a failure, which reads red", () => {
  for (const status of ["draft", "live", "unlisted", "scheduled"] as const) {
    const html = renderToStaticMarkup(<StatusBadge status={status} />);
    expect(html).toContain("bg-white");
    expect(html).toContain("text-ink");
  }
  expect(renderToStaticMarkup(<StatusBadge status="failed" />)).toContain("text-destructive");
});

test("the hello and tab title move on every five seconds, never repeating the line on screen", () => {
  expect(rotationMs).toBe(5000);
  const pool = greetings("vinod", new Date(2026, 0, 1, 12));
  for (const current of pool)
    for (const roll of [0, 0.5, 0.999]) expect(rotate(pool, current, roll)).not.toBe(current);
  expect(rotate(["only"], "only", 0.3)).toBe("only");
});
