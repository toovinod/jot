import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Hero } from "../src/components/landing/hero";
import { Features } from "../src/components/landing/features";
import { HowItWorks } from "../src/components/landing/how-it-works";
import { Readers } from "../src/components/landing/readers";
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
    "jot turns the notes you already have into a clean, readable page with its own link.",
  );
  expect(html).toContain("browse pages");
});

test("features name the eight real capabilities", () => {
  const html = renderToStaticMarkup(<Features />);
  expect(html.match(/<li/g)).toHaveLength(8);
  for (const heading of [
    "code that looks like code.",
    "speaks markdown.",
    "editions you can bring back.",
    "autosave, with a recovery copy.",
    "an editor that won't rewrite you.",
    "ready for feeds and sharing.",
    "publish on your schedule.",
    "your own domain.",
  ])
    expect(text(html)).toContain(heading);
  expect(text(html)).toContain("helps recover unsaved changes");
  expect(text(html)).toContain("bring any of the latest 100 back into your draft");
  expect(text(html)).toContain("checking every minute, with an optional email to subscribers.");
  expect(text(html)).toContain("add a subtitle and cover for richer link previews.");
  expect(text(html)).not.toMatch(/nothing gets lost|every edition kept|survives a closed tab/);
  expect(text(html)).toContain("when your instance turns it on, AI suggests grammar fixes");
  expect(text(html)).toContain("PNG, JPEG, GIF or WebP");
  expect(text(html)).toContain("on instances that offer it");
});

test("how it works is anchored and has three stops", () => {
  const html = renderToStaticMarkup(<HowItWorks />);
  expect(html).toContain('id="how"');
  for (const stop of ["paste it in", "give it a look", "publish it"])
    expect(text(html)).toContain(stop);
  expect(text(html)).toContain("paste from Google Docs, Word or the web.");
  expect(text(html)).not.toContain("Notion");
  expect(html).toMatch(/aria-pressed="true"[^>]*font-sans|font-sans[^>]*aria-pressed="true"/);
});

test("landing sections leave handles to the product", () => {
  for (const section of [<Hero key="h" />, <HowItWorks key="w" />, <Features key="f" />])
    expect(renderToStaticMarkup(section)).not.toContain("/@");
});

test("landing copy makes no claims jot cannot keep", () => {
  const all = text(
    [
      <Hero key="h" />,
      <Features key="f" />,
      <HowItWorks key="w" />,
      <Readers key="r" />,
      <Closing key="c" />,
    ]
      .map((node) => renderToStaticMarkup(node))
      .join(" "),
  );
  expect(all).not.toMatch(/\bfree\b/i);
  expect(all).not.toMatch(/analytics/i);
  expect(all).not.toMatch(/table from Notion/i);
  expect(all).not.toContain("leaving takes one click");
  expect(all).not.toContain("Notion");
  expect(all).not.toContain("min read");
  expect(all).toContain("signed-in readers can like, save and reply");
  expect(all).toContain("when email is set up, anyone can subscribe and confirm their address");
  expect(all).not.toMatch(/fictional|simulated|example:/i);
  expect(all).toContain("every email has an unsubscribe link.");
  expect(all).toContain("you're getting this because you subscribed to Harper.");
  expect(all).toContain("your notes are already a post.");
});
