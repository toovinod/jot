import { describe, expect, test } from "bun:test";
import { defaultAppearance, type Snapshot } from "@jot/contracts";
import { DraftRecovery } from "../src/lib/draft-recovery";
import { PendingWork } from "../src/lib/pending-work";
const draft = (title: string): Snapshot => ({
  title,
  subtitle: "",
  slug: "draft",
  cover: "",
  visibility: "public",
  appearance: defaultAppearance,
  content: { type: "doc", content: [{ type: "paragraph" }] },
});
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
describe("tab draft recovery", () => {
  test("survives failed saves and navigation without exposing another account's copy", () => {
    const session = storage();
    new DraftRecovery(session, "owner", "post").write(draft("Unsaved local text"), 4);
    expect(new DraftRecovery(session, "owner", "post").read()?.snapshot.title).toBe(
      "Unsaved local text",
    );
    expect(new DraftRecovery(session, "other-owner", "post").read()).toBeNull();
    expect(new DraftRecovery(session, "owner", "other-post").read()).toBeNull();
  });
  test("acknowledging an older save preserves newer typing and advances only its known base revision", () => {
    const recovery = new DraftRecovery(storage(), "owner", "post");
    recovery.write(draft("new typing"), 4);
    recovery.acknowledge(draft("older acknowledged text"), 5);
    expect(recovery.read()?.snapshot.title).toBe("new typing");
    expect(recovery.read()?.baseRevision).toBe(5);
    recovery.acknowledge(draft("new typing"), 6);
    expect(recovery.read()).toBeNull();
  });
  test("server object-key ordering does not leave an already saved draft in recovery", () => {
    const recovery = new DraftRecovery(storage(), "owner", "post");
    const local = draft("Saved");
    local.content = {
      type: "doc",
      content: [{ type: "image", attrs: { src: "/media/a.png", alt: "a", title: null } }],
    };
    recovery.write(local, 1);
    const saved = {
      ...local,
      content: {
        content: [{ attrs: { title: null, alt: "a", src: "/media/a.png" }, type: "image" }],
        type: "doc",
      },
    };
    recovery.acknowledge(saved, 2);
    expect(recovery.read()).toBeNull();
  });
  test("handles unavailable storage and malformed records without crashing editing", () => {
    const broken = {
      getItem: () => "not JSON",
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const recovery = new DraftRecovery(broken, "owner", "post");
    expect(recovery.read()).toBeNull();
    expect(recovery.write(draft("Local"), 0)).toBe(false);
    expect(recovery.clear()).toBe(false);
  });
});
test("pending import blocks operations synchronously and finishes exactly once", () => {
  const counts: number[] = [];
  const pending = new PendingWork((count) => counts.push(count));
  const finishImage = pending.begin();
  const finishRead = pending.begin();
  expect(pending.pending).toBe(2);
  finishRead();
  finishRead();
  expect(pending.pending).toBe(1);
  finishImage();
  expect(pending.pending).toBe(0);
  expect(counts).toEqual([1, 2, 1, 0]);
});
