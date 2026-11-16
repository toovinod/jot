import { describe, expect, test } from "bun:test";
import { safeReturnPath } from "../src/lib/navigation";
import { PageLoader } from "../src/lib/page-loader";
import { documentText } from "@jot/contracts";
describe("login return paths", () => {
  test("keeps same-origin paths and rejects browser-normalized external destinations", () => {
    expect(safeReturnPath("/dashboard?tab=bookmarks#saved", "https://jot.example")).toBe(
      "/dashboard?tab=bookmarks#saved",
    );
    for (const value of [
      "/\t/evil.test",
      "/\n/evil.test",
      "//evil.test",
      "/\\evil.test",
      "https://evil.test",
      "javascript:alert(1)",
      null,
    ])
      expect(safeReturnPath(value, "https://jot.example")).toBeNull();
  });
});
describe("post pagination", () => {
  test("retries a failed page at the same offset instead of skipping stories", async () => {
    const offsets: number[] = [];
    let fail = true;
    const loader = new PageLoader(
      2,
      async (_key, offset) => {
        offsets.push(offset);
        if (offset === 2 && fail) {
          fail = false;
          throw new Error("offline");
        }
        return offset === 0 ? [{ id: "a" }, { id: "b" }] : [{ id: "c" }];
      },
      () => {},
    );
    await loader.reset("mine");
    await loader.loadNext();
    expect(loader.state.nextOffset).toBe(2);
    expect(loader.state.items).toHaveLength(2);
    await loader.loadNext();
    expect(offsets).toEqual([0, 2, 2]);
    expect(loader.state.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(loader.state.hasMore).toBe(false);
  });
  test("ignores an old search response and deduplicates overlapping pages", async () => {
    let resolve!: (items: { id: string }[]) => void;
    const old = new Promise<{ id: string }[]>((yes) => (resolve = yes));
    const loader = new PageLoader(
      2,
      async (key, offset) =>
        key === "old"
          ? old
          : offset === 0
            ? [{ id: "a" }, { id: "b" }]
            : [{ id: "b" }, { id: "c" }],
      () => {},
    );
    const pending = loader.reset("old");
    await loader.reset("new");
    resolve([{ id: "wrong" }]);
    await pending;
    await loader.loadNext();
    expect(loader.state.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(loader.state.nextOffset).toBe(4);
  });
});
test("plaintext preserves hard breaks, task boundaries and table columns for AI input", () => {
  const text = (value: string) => ({ type: "text", text: value });
  const paragraph = (value: string) => ({ type: "paragraph", content: [text(value)] });
  expect(
    documentText({
      type: "doc",
      content: [
        { type: "paragraph", content: [text("one"), { type: "hardBreak" }, text("two")] },
        {
          type: "taskList",
          content: [
            { type: "taskItem", content: [paragraph("first")] },
            { type: "taskItem", content: [paragraph("second")] },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [paragraph("A")] },
                { type: "tableCell", content: [paragraph("B")] },
              ],
            },
          ],
        },
      ],
    }),
  ).toBe("one\ntwo\nfirst\nsecond\nA\tB");
});
