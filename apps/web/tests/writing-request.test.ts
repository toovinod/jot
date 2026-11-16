import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { WritingRequestStore } from "../src/lib/writing-request";
test("resumes the latest authorized writing request after remount without creating another job", () => {
  const storage = new Window().sessionStorage;
  const record = {
    id: "12345678-1234-4123-8123-123456789abc",
    mode: "review" as const,
    source: "Original requested text",
    createdAt: Date.now(),
  };
  new WritingRequestStore(storage, "owner", "post").write(record);
  expect(new WritingRequestStore(storage, "owner", "post").read()).toEqual(record);
  expect(new WritingRequestStore(storage, "other-owner", "post").read()).toBeNull();
  expect(new WritingRequestStore(storage, "owner", "other-post").read()).toBeNull();
});
test("expires tab references and bounds retained source records without evicting active requests silently", () => {
  const storage = new Window().sessionStorage;
  const now = Date.now();
  for (let i = 0; i < 16; i++)
    expect(
      new WritingRequestStore(storage, "owner", String(i)).write({
        id: `12345678-1234-4123-8123-${String(i).padStart(12, "0")}`,
        mode: "grammar",
        source: "Text",
        createdAt: now,
      }),
    ).toBe(true);
  expect(
    new WritingRequestStore(storage, "owner", "overflow").write({
      id: "12345678-1234-4123-8123-123456789abc",
      mode: "grammar",
      source: "Text",
      createdAt: now,
    }),
  ).toBe(false);
  expect(new WritingRequestStore(storage, "owner", "0").read(now + 24 * 60 * 60 * 1000 + 1)).toBe(
    "expired",
  );
  expect(new WritingRequestStore(storage, "owner", "0").read()).toBeNull();
});
