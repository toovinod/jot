import { mock, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MotionConfig } from "motion/react";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const { Header, Footer } = await import("../src/components/shell");
const { HowItWorks } = await import("../src/components/landing/how-it-works");

test("header github link stays hidden on phones and lays out as flex from md", () => {
  const html = renderToStaticMarkup(<Header />);
  const anchor = html.match(/<a[^>]*href="https:\/\/github.com\/toovinod\/jot"[^>]*>/)![0];
  const classes = anchor.match(/class="([^"]*)"/)![1].split(" ");
  expect(classes).toContain("hidden");
  expect(classes).toContain("md:flex");
  expect(classes).not.toContain("flex");
});

test("how it works plane rests at its final stop when motion is reduced", () => {
  const html = renderToStaticMarkup(
    <MotionConfig reducedMotion="always">
      <HowItWorks />
    </MotionConfig>,
  );
  expect(html).toContain("left:86%");
});

test("sample disclaimer only shows when asked for", () => {
  expect(renderToStaticMarkup(<Footer />)).not.toContain("are samples");
  expect(renderToStaticMarkup(<Footer samples />)).toContain(
    "names and pages shown on this site are samples.",
  );
});
