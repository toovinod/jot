import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Footer, Header } from "../src/components/shell";

test("footer links to the open source repo and its docs", () => {
  const html = renderToStaticMarkup(<Footer />);
  expect(html).toContain('href="https://github.com/toovinod/jot"');
  expect(html).toContain("/blob/main/docs/OPERATIONS.md");
  expect(html).toContain("/blob/main/LICENSE");
  expect(html).toContain('href="/privacy"');
  expect(html).toContain('href="/terms"');
  expect(html).not.toContain("log in");
  expect(html).not.toContain("\u2014");
});

test("discover has its own route", async () => {
  const page = await import("../src/app/discover/page");
  expect(typeof page.default).toBe("function");
});

test("privacy and terms have their own pages", async () => {
  for (const path of ["../src/app/privacy/page", "../src/app/terms/page"]) {
    const page = await import(path);
    expect(typeof page.default).toBe("function");
  }
});

test("on a custom domain the header and footer link to the app origin", () => {
  const origin = "https://jot.example";
  const header = renderToStaticMarkup(<Header appOrigin={origin} />);
  for (const path of ["/", "/discover", "/#how"])
    expect(header).toContain(`href="${origin}${path}"`);
  const footer = renderToStaticMarkup(<Footer appOrigin={origin} />);
  for (const path of ["/discover", "/#how", "/signup", "/privacy", "/terms"])
    expect(footer).toContain(`href="${origin}${path}"`);
  // Without an origin the links stay relative, as on the app itself.
  expect(renderToStaticMarkup(<Header />)).toContain('href="/discover"');
  expect(renderToStaticMarkup(<Footer />)).toContain('href="/privacy"');
});
