import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../src/components/ui/button";
import { ErrorMessage, Field, Input } from "../src/components/ui/fields";

test("buttons are pressable pills with distinct sky and ink variants", () => {
  const ink = renderToStaticMarkup(<Button>go</Button>);
  const sky = renderToStaticMarkup(<Button variant="sky">go</Button>);
  expect(ink).toContain("rounded-full");
  expect(sky).toContain("bg-sky");
  expect(ink).not.toBe(sky);
});

test("asChild renders the child element", () => {
  expect(
    renderToStaticMarkup(
      <Button asChild>
        <a href="/x">x</a>
      </Button>,
    ),
  ).toStartWith("<a");
});

test("Field ties its label to the control", () => {
  const html = renderToStaticMarkup(
    <Field label="Email" htmlFor="email">
      <Input id="email" />
    </Field>,
  );
  expect(html).toContain('for="email"');
  expect(html).toContain('id="email"');
});

test("ErrorMessage renders nothing without a message", () => {
  expect(renderToStaticMarkup(<ErrorMessage message="" />)).toBe("");
});
