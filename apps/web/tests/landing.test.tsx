import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Hero } from "../src/components/landing/hero";
import { Features } from "../src/components/landing/features";
import { HowItWorks } from "../src/components/landing/how-it-works";
import { Readers } from "../src/components/landing/readers";
import { SelfHost } from "../src/components/landing/self-host";
import { Closing } from "../src/components/landing/closing";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replace(/\s+/g, " ");

test("hero says what jot does", () => {
  const html = text(renderToStaticMarkup(<Hero />));
  expect(html).toContain("paste the mess.");
  expect(html).toContain("publish the page.");
  expect(html).toContain(
    "bring notes from Google Docs, Notion, Word, Apple Notes or plain Markdown. jot keeps your headings, lists, tables and code, and gives the page its own link.",
  );
});

test("features name the six real capabilities", () => {
  const html = text(renderToStaticMarkup(<Features />));
  for (const heading of [
    "paste from anywhere.",
    "code that looks like code.",
    "make it yours.",
    "drafts stay drafts.",
    "every edition kept.",
    "an editor that won't rewrite you.",
  ])
    expect(html).toContain(heading);
});

test("how it works is anchored and has four stops", () => {
  const html = renderToStaticMarkup(<HowItWorks />);
  expect(html).toContain('id="how"');
  for (const stop of ["paste.", "shape.", "publish.", "land."]) expect(text(html)).toContain(stop);
});

test("self-host links to the repo and the operations guide", () => {
  const html = renderToStaticMarkup(<SelfHost />);
  expect(html).toContain('id="self-host"');
  expect(html).toContain("https://github.com/toovinod/jot");
  expect(html).toContain("/blob/main/docs/OPERATIONS.md");
});

test("landing copy makes no claims jot cannot keep", () => {
  const all = text(
    [
      <Hero key="h" />,
      <Features key="f" />,
      <HowItWorks key="w" />,
      <Readers key="r" />,
      <SelfHost key="s" />,
      <Closing key="c" />,
    ]
      .map((node) => renderToStaticMarkup(node))
      .join(" "),
  );
  expect(all).not.toMatch(/\bfree\b/i);
  expect(all).not.toMatch(/analytics/i);
  expect(all).not.toMatch(/custom domain/i);
  expect(all).toContain("your notes are already a post.");
});

test("discover preview points to the full feed and handles an empty room", async () => {
  const { DiscoverPreview } = await import("../src/components/landing/discover-preview");
  const html = text(renderToStaticMarkup(<DiscoverPreview />));
  expect(html).toContain("read what people are publishing.");
  expect(renderToStaticMarkup(<DiscoverPreview />)).toContain('href="/discover"');
});
