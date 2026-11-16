import { mock, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {} }),
  usePathname: () => "/missing",
  useSearchParams: () => new URLSearchParams(),
}));

const { default: NotFound } = await import("../src/app/not-found");

test("not found says the page flew off and links home and to discover", () => {
  const html = renderToStaticMarkup(<NotFound />);
  expect(html.replace(/<[^>]+>/g, "")).toContain("this page flew off.");
  expect(html).toContain('href="/"');
  expect(html).toContain('href="/discover"');
});
