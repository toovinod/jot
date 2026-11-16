import { expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace() {}, push() {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));
const { AuthForm } = await import("../src/components/auth-form");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("signup invites the writer to claim their address", () => {
  const html = text(renderToStaticMarkup(<AuthForm signup />));
  expect(html).toContain("claim your /@name.");
  expect(html).toContain("/@username");
});

test("login welcomes the writer back", () => {
  const html = text(renderToStaticMarkup(<AuthForm />));
  expect(html).toContain("welcome back.");
  expect(html).toContain("your drafts are right where you left them.");
});

test("auth still talks to the same endpoints", () => {
  const source = readFileSync(new URL("../src/components/auth-form.tsx", import.meta.url), "utf8");
  expect(source).toContain('/auth/${signup ? "signup" : "login"}');
});
