import { expect, test } from "bun:test";
import { DEMO_LIMIT, parseDemoNote } from "../src/components/landing/demo-parse";

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
