import { mock, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const { Header } = await import("../src/components/shell");

test("header github link stays hidden on phones and lays out as flex from md", () => {
  const html = renderToStaticMarkup(<Header />);
  const anchor = html.match(/<a[^>]*href="https:\/\/github.com\/toovinod\/jot"[^>]*>/)![0];
  const classes = anchor.match(/class="([^"]*)"/)![1].split(" ");
  expect(classes).toContain("hidden");
  expect(classes).toContain("md:flex");
  expect(classes).not.toContain("flex");
});
