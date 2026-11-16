import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Demo } from "../src/components/landing/demo";

test("demo explains itself and renders the sample note", () => {
  const html = renderToStaticMarkup(<Demo />).replace(/<[^>]+>/g, "");
  expect(html).toContain("try it. right here.");
  expect(html).toContain("this runs in your browser and saves nothing.");
  expect(html).toContain("slow mornings");
});

test("demo never injects raw HTML", () => {
  const source = readFileSync(
    new URL("../src/components/landing/demo.tsx", import.meta.url),
    "utf8",
  );
  expect(source).not.toContain("dangerouslySetInnerHTML");
});
