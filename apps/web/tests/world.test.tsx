import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Flyer, SkyScene } from "../src/components/world/sky";

const variants = ["hero", "panel", "banner", "strip"] as const;

test.each(variants)(
  "SkyScene %s hides decoration from assistive tech but keeps content",
  (variant) => {
    const html = renderToStaticMarkup(
      <SkyScene variant={variant}>
        <h2>hello sky</h2>
      </SkyScene>,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("<h2>hello sky</h2>");
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
  },
);

test("Flyer carries its link tag", () => {
  expect(renderToStaticMarkup(<Flyer tag="/@maya/slow-mornings" />)).toContain(
    "/@maya/slow-mornings",
  );
});
