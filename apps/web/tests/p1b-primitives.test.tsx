import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Eye } from "@phosphor-icons/react/dist/ssr";
import {
  EmptyState,
  FormSection,
  IconButton,
  NotchedCard,
  SceneHeader,
  SectionHeader,
  StatTile,
  StatusBadge,
  Toolbar,
  ToolbarButton,
} from "../src/components/app";

const text = (html: string) => html.replace(/<[^>]+>/g, "");
const clean = (html: string) => {
  expect(html).not.toContain(String.fromCharCode(0x2014));
  expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
};

test("status badges use lowercase labels and keep a failure's reason as hover text", () => {
  for (const status of ["draft", "live", "unlisted", "scheduled"] as const)
    expect(text(renderToStaticMarkup(<StatusBadge status={status} />))).toBe(status);
  const failed = renderToStaticMarkup(<StatusBadge status="failed" title="the slug is taken" />);
  expect(text(failed)).toBe("schedule failed");
  expect(failed).toContain('title="the slug is taken"');
  expect(text(renderToStaticMarkup(<StatusBadge status="scheduled">nov 20</StatusBadge>))).toBe(
    "nov 20",
  );
});

test("the live badge pulses only when motion is allowed", () => {
  const live = renderToStaticMarkup(<StatusBadge status="live" />);
  expect(live).toContain("animate-ping");
  expect(live).toContain("motion-reduce:animate-none");
  expect(renderToStaticMarkup(<StatusBadge status="draft" />)).not.toContain("animate-ping");
});

test("a stat tile shows a skeleton while loading, a dash on failure, then the number", () => {
  const loading = renderToStaticMarkup(
    <StatTile icon={Eye} tone="sky" label="reads" value={undefined} />,
  );
  expect(loading).toContain('data-slot="skeleton"');
  const failed = renderToStaticMarkup(
    <StatTile icon={Eye} tone="sky" label="reads" value={undefined} failed />,
  );
  expect(text(failed)).toContain("-unavailable");
  const loaded = renderToStaticMarkup(
    <StatTile icon={Eye} tone="sky" label="reads" value={1234} />,
  );
  expect(text(loaded)).toContain("reads");
  expect(text(loaded)).toContain("1,234");
  expect(loaded).not.toContain('data-slot="skeleton"');
});

test("notched cards step their corners and can carry a stripe", () => {
  const plain = renderToStaticMarkup(<NotchedCard>hi</NotchedCard>);
  expect(plain).toContain("notched");
  expect(plain).toContain("before:notched");
  expect(plain).not.toContain("bg-[#ffe98a]");
  const striped = renderToStaticMarkup(
    <NotchedCard tone="tint" stripe="sun">
      hi
    </NotchedCard>,
  );
  expect(striped).toContain("bg-[#ffe98a]");
  expect(striped).not.toContain("before:notched");
});

test("an empty state has a hidden critter, a heading and one action", () => {
  const html = renderToStaticMarkup(
    <EmptyState
      critter="bookmark"
      title="nothing saved yet."
      body="use the bookmark on any page."
      action={<a href="/discover">browse discover</a>}
    />,
  );
  expect(html).toMatch(/<h2[^>]*>nothing saved yet\.<\/h2>/);
  expect(html).toContain('href="/discover"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain("motion-reduce:animate-none");
  clean(html);
});

test("the scene header paints a pixel sky behind its title", () => {
  const html = renderToStaticMarkup(
    <SceneHeader
      title="morning, harper."
      subtitle="2 drafts waiting."
      critter="page"
      actions={<button type="button">new page</button>}
    />,
  );
  expect(html).toMatch(/<h1[^>]*>morning, harper\.<\/h1>/);
  expect(html).toContain("2 drafts waiting.");
  expect(html).toContain('shape-rendering="crispEdges"');
  expect(html).toContain("animate-[hop");
  expect(html).toContain("motion-reduce:animate-none");
  expect(html).not.toContain("font-serif");
  clean(html);
});

test("toolbar buttons report the current choice", () => {
  const html = renderToStaticMarkup(
    <Toolbar aria-label="Filter pages">
      <ToolbarButton active>all</ToolbarButton>
      <ToolbarButton>live</ToolbarButton>
      <ToolbarButton asChild active>
        <a href="/dashboard">writing</a>
      </ToolbarButton>
    </Toolbar>,
  );
  expect(html).toContain('role="toolbar"');
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('aria-pressed="false"');
  expect(html).toMatch(/<a href="\/dashboard" aria-current="page"/);
});

test("icon buttons are named by their label", () => {
  const html = renderToStaticMarkup(
    <IconButton label="Open menu">
      <svg />
    </IconButton>,
  );
  expect(html).toContain('aria-label="Open menu"');
  expect(html).toContain('type="button"');
  const link = renderToStaticMarkup(
    <IconButton label="New page" asChild>
      <a href="/dashboard?new=1">+</a>
    </IconButton>,
  );
  expect(link).toStartWith("<a");
  expect(link).not.toContain("type=");
});

test("section headers and form sections render their headings and slots", () => {
  const section = renderToStaticMarkup(
    <SectionHeader title="your pages" description="drafts stay private." action={<b>x</b>} />,
  );
  expect(section).toMatch(/<h2[^>]*>your pages<\/h2>/);
  expect(section).toContain("<b>x</b>");
  const form = renderToStaticMarkup(
    <FormSection title="profile" description="shown on your pages." footer={<b>save</b>}>
      <input />
    </FormSection>,
  );
  expect(form).toMatch(/<h2[^>]*>profile<\/h2>/);
  expect(form).toContain("<b>save</b>");
  expect(form).toContain("<input/>");
});
