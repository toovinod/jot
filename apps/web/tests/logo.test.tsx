import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Brand, JotMark } from "../src/components/brand/logo";

test("JotMark draws three fanned pages in a 100 unit box", () => {
  const html = renderToStaticMarkup(<JotMark />);
  expect(html).toContain('viewBox="0 0 100 100"');
  expect(html.match(/<path/g)?.length).toBe(3);
});

test("JotMark is decorative unless titled", () => {
  expect(renderToStaticMarkup(<JotMark />)).toContain('aria-hidden="true"');
  const titled = renderToStaticMarkup(<JotMark title="Jot" />);
  expect(titled).toContain('role="img"');
  expect(titled).toContain("<title>Jot</title>");
});

test("filled variant uses currentColor for small sizes", () => {
  expect(renderToStaticMarkup(<JotMark variant="filled" />)).toContain('fill="currentColor"');
});

test("Brand links home with the wordmark", () => {
  const html = renderToStaticMarkup(<Brand />);
  expect(html).toContain('href="/"');
  expect(html).toContain(">jot<");
});
