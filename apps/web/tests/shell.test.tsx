import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Footer } from "../src/components/shell";

test("footer links to the open source repo and its docs", () => {
  const html = renderToStaticMarkup(<Footer samples />);
  expect(html).toContain('href="https://github.com/toovinod/jot"');
  expect(html).toContain("/blob/main/docs/OPERATIONS.md");
  expect(html).toContain("/blob/main/LICENSE");
  expect(html).toContain("names and pages shown on this site are samples.");
  expect(html).not.toContain("\u2014");
});

test("discover has its own route", async () => {
  const page = await import("../src/app/discover/page");
  expect(typeof page.default).toBe("function");
});
