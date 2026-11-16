import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultAppearance, type Appearance, type Snapshot } from "@jot/contracts";
import { Article, themeClass } from "../src/components/document";

const author = { id: "a", username: "maya", name: "Maya", bio: "", avatar: "" };
function article(appearance: Partial<Appearance>) {
  const snapshot: Snapshot = {
    title: "Slow mornings",
    subtitle: "",
    slug: "slow-mornings",
    cover: "",
    content: { type: "doc", content: [] },
    appearance: { ...defaultAppearance, ...appearance },
    visibility: "public",
  };
  return renderToStaticMarkup(<Article snapshot={snapshot} author={author} />);
}

test("published page theme maps to a wrapper class", () => {
  expect(themeClass("dark")).toBe("dark");
  expect(themeClass("light")).toBe("light");
  expect(themeClass("system")).toBe("theme-system");
});

test("a system-theme article follows the reader's OS through theme-system", () => {
  expect(article({ theme: "system" })).toContain("theme-system");
});

test("app chrome no longer depends on next-themes and honors reduced motion", () => {
  const source = readFileSync(new URL("../src/components/providers.tsx", import.meta.url), "utf8");
  expect(source).not.toContain("next-themes");
  expect(source).toContain('reducedMotion="user"');
});
