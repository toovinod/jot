import { afterEach, beforeAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { defaultAppearance } from "@jot/contracts";
import { clearAllDraftRecovery, DraftRecovery } from "../src/lib/draft-recovery";
beforeAll(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: new Window().localStorage,
    configurable: true,
  });
});
afterEach(() => localStorage.clear());
test("logout clears every local draft copy and leaves other keys alone", () => {
  const snapshot = {
    title: "Kept until logout",
    subtitle: "",
    slug: "kept",
    cover: "",
    visibility: "public" as const,
    tags: [],
    appearance: defaultAppearance,
    content: { type: "doc", content: [{ type: "paragraph" }] },
  };
  new DraftRecovery(localStorage, "owner", "one").write(snapshot, 1);
  new DraftRecovery(localStorage, "owner", "two").write(snapshot, 1);
  localStorage.setItem("jot:session-changed", "1");
  expect(new DraftRecovery(localStorage, "owner", "one").read()?.snapshot.title).toBe(
    "Kept until logout",
  );
  clearAllDraftRecovery();
  expect(new DraftRecovery(localStorage, "owner", "one").read()).toBeNull();
  expect(new DraftRecovery(localStorage, "owner", "two").read()).toBeNull();
  expect(localStorage.getItem("jot:session-changed")).toBe("1");
});
test("clearing tolerates blocked storage", () => {
  const blocked = Object.getOwnPropertyDescriptor(globalThis, "localStorage")!;
  Object.defineProperty(globalThis, "localStorage", {
    get() {
      throw new Error("blocked");
    },
    configurable: true,
  });
  try {
    expect(() => clearAllDraftRecovery()).not.toThrow();
  } finally {
    Object.defineProperty(globalThis, "localStorage", blocked);
  }
});
