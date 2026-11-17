import { expect, test } from "bun:test";
import { DEMO_LIMIT, demoTitle, parseDemoNote } from "../src/components/landing/demo-parse";

test("empty input gives no blocks", () => {
  expect(parseDemoNote("")).toEqual([]);
});

test("headings and paragraphs", () => {
  expect(parseDemoNote("# Hi\nplain")).toEqual([
    { kind: "h1", text: "Hi" },
    { kind: "p", text: "plain" },
  ]);
  expect(parseDemoNote("## Sub")).toEqual([{ kind: "h2", text: "Sub" }]);
});

test("numbered lines stay ordered", () => {
  expect(parseDemoNote("1. first\n2) second\n10. tenth")).toEqual([
    { kind: "ol", text: "first", n: 1 },
    { kind: "ol", text: "second", n: 2 },
    { kind: "ol", text: "tenth", n: 10 },
  ]);
  expect(parseDemoNote("3.14 is pi")).toEqual([{ kind: "p", text: "3.14 is pi" }]);
});

test("bullets and todos", () => {
  expect(parseDemoNote("- one\n* two")).toEqual([
    { kind: "li", text: "one" },
    { kind: "li", text: "two" },
  ]);
  expect(parseDemoNote("- [x] done\n- [ ] not")).toEqual([
    { kind: "todo", text: "done", done: true },
    { kind: "todo", text: "not", done: false },
  ]);
});

test("fenced code keeps its lines, unclosed fences run to the end", () => {
  expect(parseDemoNote("```js\nconst a = 1\n```")).toEqual([{ kind: "code", text: "const a = 1" }]);
  expect(parseDemoNote("```\na\nb")).toEqual([{ kind: "code", text: "a\nb" }]);
});

test("huge pastes are capped", () => {
  const total = parseDemoNote("x".repeat(50000)).reduce((n, b) => n + b.text.length, 0);
  expect(total).toBeLessThanOrEqual(DEMO_LIMIT);
});

test("markup stays text", () => {
  expect(parseDemoNote("<script>alert(1)</script>")).toEqual([
    { kind: "p", text: "<script>alert(1)</script>" },
  ]);
});

test("the title is the first heading outside code", () => {
  expect(demoTitle("intro\n```\n# not this\n```\n## sub\n# this one\n# later")).toBe("this one");
  expect(demoTitle("no heading")).toBe("");
});
