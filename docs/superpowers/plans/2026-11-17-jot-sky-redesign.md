n# Jot Sky Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Jot's web UI with the approved "sky world" design: new landing page, new logo and type, shadcn/ui components, Motion animations, and every app screen restyled, light only.

**Architecture:** All work is in `apps/web`. A shared token layer (`globals.css`), a logo component, a set of reusable illustrated scene parts (`components/world`) and shadcn primitives come first; the landing page and each app screen are then rebuilt on top of them. Data loading, API calls, editor behavior and contracts do not change; only markup, styling and two small pure helpers (demo parser, dashboard stats) are new.

**Tech Stack:** Next.js 16 App Router, React 19.3, Tailwind 4, Bun 1.4.4, shadcn/ui (Tailwind v4 mode), `motion`, `next/font/google`, `@phosphor-icons/react`, bun:test with `renderToStaticMarkup`.

**Spec:** `docs/superpowers/specs/2026-11-16-jot-redesign-design.md` (read it first; all marketing and screen copy is quoted from it verbatim).

**Approved mockups (visual reference, throwaway HTML):**

- `/private/tmp/claude-501/-Users-vinodbiradar-Desktop-coding/96a7c201-1250-4ace-af02-523659667d65/scratchpad/jot-direction-a2.html` (hero, type)
- `/private/tmp/claude-501/-Users-vinodbiradar-Desktop-coding/96a7c201-1250-4ace-af02-523659667d65/scratchpad/jot-app-cool.html` (dashboard, editor)

## Global Constraints

- Every task that restyles a file also swaps that file's `lucide-react` imports to Phosphor.

- No em dash and no emoji anywhere in source (`bun run check:source` fails on them). Use Phosphor icons (`@phosphor-icons/react`), never glyphs like the mockups' pencil or gear characters, and never lucide.
- Icon weights: `duotone` for navigation and feature tiles, `bold` for toolbar and small buttons, `fill` for on-states (liked, bookmarked, publish, GitHub). Reference: `scratchpad/jot-icons.html`.
- No changes to `apps/api`, `apps/worker` or `packages/contracts`.
- Add packages only with `bun add` / `bunx shadcn`; never hand-edit `bun.lock`.
- App chrome is light only; `next-themes` and the theme toggle are removed.
- Published posts still honor `appearance.theme` (`system`, `light`, `dark`); stored accent names keep their current hex values in `document.tsx`.
- Colors: ink `#16140f`, sky-deep `#1f7fe6`, sky `#3fa9ff`, sky-light `#d8f3ff`, sky-soft `#e3f2ff`, app-bg `#f4f9ff`, line `#dbe8f5`, grass `#86dd78` / `#45bd5f` / `#23944c`, sun `#ffd34d`.
- Fonts: Bricolage Grotesque (display), Fraunces (serif, SOFT 100 for italic accents), Geist (UI), Geist Mono (mono), all via `next/font/google`.
- GitHub: `https://github.com/toovinod/jot`; doc links point at `/blob/main/docs/OPERATIONS.md`, `/blob/main/docs/API.md`, `/blob/main/LICENSE`, `/blob/main/CONTRIBUTING.md`, `/blob/main/SECURITY.md`.
- Never claim: "free", read counts, subscriber counts, analytics, custom domains, lossless image paste.
- Every animation respects `prefers-reduced-motion`.
- No horizontal page scroll at 375 px width.
- Gates: `bun run check`, `bun run test`, `bun run build` from repo root (`bun run verify` runs all three).
- Commits: the owner's rules say commit only when asked. Each task ends with a checkpoint (show the diff). If the owner approves commits, work on branch `redesign/sky` and commit per task with no co-author lines.

## Review Focus

1. **Reduced motion:** a visitor with `prefers-reduced-motion: reduce` sees every element in its final state with no movement (hero fan, planes, scroll reveals, demo plane). Pinned in Task 1 (MotionConfig test) and Task 14 (browser emulation).
2. **Published page theme `system`:** without `next-themes`, a reader whose OS is dark must still get a dark page when the author picked `system`; `light` stays light on a dark OS. Pinned in Task 1.
3. **Demo input abuse:** empty input, a 50 000 character paste, and `<script>` text must render as escaped text, capped, never through `dangerouslySetInnerHTML`. Pinned in Task 7.
4. **Prolific author dashboard:** an author with 120 posts must see correct stat totals, not the first page only; a failed page load shows stats as unavailable, not wrong numbers. Pinned in Task 10.
5. **Phone width:** hero scene, demo window and editor panels must not cause horizontal scroll at 375 px. Pinned in Task 14 (scrollWidth check on every route).

---

## File Structure

| Path (under `apps/web`)         | Responsibility                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `components.json`               | shadcn config (new-york style, Tailwind v4, `@/components/ui`)                     |
| `src/app/globals.css`           | Tokens, shadcn variable mapping, dark variant for published pages only             |
| `src/lib/fonts.ts`              | `next/font` instances and CSS variable names                                       |
| `src/lib/site.ts`               | GitHub and doc URLs                                                                |
| `src/components/providers.tsx`  | Session context (unchanged) plus `MotionConfig`; no ThemeProvider                  |
| `src/components/brand/logo.tsx` | `JotMark`, `Brand`                                                                 |
| `src/app/icon.svg`              | Favicon (filled mark)                                                              |
| `src/components/ui/*`           | shadcn primitives; `button.tsx` replaced, `fields.tsx` keeps its exports           |
| `src/components/world/*`        | Reusable scene parts: sky, sun, cloud, hills, house, flyer, grain, `SkyScene`      |
| `src/components/landing/*`      | Landing sections and demo                                                          |
| `src/components/shell.tsx`      | Marketing `Header`, `Footer`, `Page`; app `AppShell` sidebar; `Private`, `Loading` |
| `src/app/page.tsx`              | Landing composition                                                                |
| `src/app/discover/page.tsx`     | Discover feed (moved from `/`)                                                     |
| `src/lib/dashboard-stats.ts`    | Stats and greeting helpers                                                         |
| Existing screen files           | Restyled in place                                                                  |

---

### Task 1: Foundation: tokens, fonts, light-only app, published-page theme, motion

**Files:**

- Create: `apps/web/src/lib/fonts.ts`, `apps/web/src/lib/site.ts`, `apps/web/components.json`
- Modify: `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/src/components/providers.tsx`, `apps/web/src/components/shell.tsx:4,34-48` (remove `useTheme` and toggle), `apps/web/src/components/document.tsx:206-232`
- Test: `apps/web/tests/theme.test.tsx`

**Interfaces:**

- Produces: `fontVariables: string` (className with all four font CSS variables) from `lib/fonts.ts`; Tailwind fonts `font-display`, `font-serif`, `font-sans`, `font-mono`; `GITHUB_URL`, `docLinks: { selfHost, api, license, contributing, security }` from `lib/site.ts`; `themeClass(theme: Appearance["theme"]): string` exported from `document.tsx`.

- [ ] **Step 1: Write failing tests in `tests/theme.test.tsx`**

```tsx
test("published page theme classes", () => {
  expect(themeClass("dark")).toBe("dark");
  expect(themeClass("light")).toBe("light");
  expect(themeClass("system")).toBe("theme-system");
});
test("Article with system theme carries theme-system class", () => {
  // render <Article> with default appearance but theme "system"
  expect(html).toContain("theme-system");
});
test("Providers wraps children in MotionConfig reducedMotion user", () => {
  // read source of providers.tsx and assert it contains 'reducedMotion="user"' and not 'next-themes'
});
```

- [ ] **Step 2: Run** `cd apps/web && bun test tests/theme.test.tsx`. Expected: FAIL (`themeClass` not exported).

- [ ] **Step 3: Install** from `apps/web`: `bun add motion @phosphor-icons/react` and `bun remove next-themes`; run `bunx shadcn@latest init` choosing new-york, neutral, CSS variables, writing `components.json` with aliases `@/components`, `@/components/ui`, `@/lib/utils`. Keep the existing `cn` in `src/lib/utils.ts` (do not let init overwrite other helpers there).

- [ ] **Step 4: Implement**
  - `globals.css`: one `:root` light token set with the Global Constraints colors mapped onto shadcn variables (`--background: #f4f9ff`, `--foreground: #16140f`, `--card: #fff`, `--primary: #16140f`, `--primary-foreground: #fff`, `--accent: #3fa9ff`, `--border: #dbe8f5`, `--ring: #3fa9ff`, plus `--sky*`, `--grass*`, `--sun`, `--line` custom tokens exposed through `@theme inline`). Keep a `.dark, .theme-system (inside prefers-color-scheme: dark)` token block with today's dark values for published pages. Replace the custom variant with:
    ```css
    @custom-variant dark {
      &:where(.dark, .dark *) {
        @slot;
      }
      @media (prefers-color-scheme: dark) {
        &:where(.theme-system, .theme-system *) {
          @slot;
        }
      }
    }
    ```
  - `fonts.ts`: four `next/font/google` instances with variables `--font-display`, `--font-serif`, `--font-sans`, `--font-mono`; Fraunces with `axes: ["SOFT", "opsz"]`.
  - `layout.tsx`: apply `fontVariables` on `<html>`; drop `suppressHydrationWarning`; update metadata description to the spec hero sub.
  - `providers.tsx`: remove ThemeProvider; wrap in `<MotionConfig reducedMotion="user">`.
  - `document.tsx`: export `themeClass`; `Article` uses `themeClass(a.theme)`; accents keep current hex values.
  - `site.ts`: constants from Global Constraints.

- [ ] **Step 5: Run** `bun test` (all web tests) and `cd ../.. && bun run check`. Expected: all pass.

- [ ] **Step 6: Browser check** `bun run dev` from root, open `/`: fonts load, background is `#f4f9ff`, no theme toggle. Open a published post set to `system` with dark emulation (`emulate colorScheme dark`): page is dark.

- [ ] **Step 7: Checkpoint** (show diff; commit `feat(web): light tokens, fonts, motion, published theme` if approved).

### Task 2: Logo

**Files:**

- Create: `apps/web/src/components/brand/logo.tsx`, `apps/web/src/app/icon.svg`
- Modify: `apps/web/src/components/shell.tsx` (delete old `Brand`, re-export from brand)
- Test: `apps/web/tests/logo.test.tsx`

**Interfaces:**

- Produces: `JotMark({ variant?: "outline" | "filled"; animate?: boolean; className?: string; title?: string })` rendering an inline SVG (viewBox `0 0 100 100`, three page paths hinged at `22 82`); `Brand({ href?: string; className?: string })` = mark + "jot" wordmark in `font-display`.

- [ ] **Step 1: Failing tests:** `JotMark` renders `<svg` with `viewBox="0 0 100 100"` and 3 `<path`; with `title` it has `role="img"` and `<title>`, without it `aria-hidden="true"`; `variant="filled"` paths have `fill="currentColor"`; `Brand` renders link to `/` containing `jot`.
- [ ] **Step 2: Run** `bun test tests/logo.test.tsx`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.** Trace the owner's PNG `/Users/vinodbiradar/.t3/userdata/attachments/22118671-b25d-4c73-ac23-0f3c7b1490b6-1c36bf3c-e282-4ada-a2f8-001dc82eb147.png` into three rounded quadrilateral paths (mockup paths in `jot-direction-a2.html` symbol `#jot` are the starting point; refine corners to match the PNG). Outline variant: white fill, ink stroke width 5, round joins. Filled variant: ink fill with white 3 px gaps between pages, used below 32 px. `animate` uses Motion to rotate pages 1 and 2 from 26deg and 12deg to 0 around `22px 82px` (`transformBox: "view-box"`), spring, once on mount. `icon.svg` is the filled variant.
- [ ] **Step 4: Run** `bun test`. Expected: PASS.
- [ ] **Step 5: Browser check:** favicon shows in tab; header logo fans on load; with reduced motion it is static.
- [ ] **Step 6: Checkpoint.**

### Task 3: UI primitives

**Files:**

- Create via `bunx shadcn@latest add`: `input label textarea tabs dialog dropdown-menu sheet tooltip toggle-group card badge avatar separator skeleton sonner` in `apps/web/src/components/ui/`
- Replace: `apps/web/src/components/ui/button.tsx` (shadcn button, then extend)
- Modify: `apps/web/src/components/ui/fields.tsx` (same exports `Input, Textarea, Select, Field, ErrorMessage`, built on shadcn `Input`, `Textarea`, `Label`), `apps/web/src/components/providers.tsx` (sonner `Toaster` from `ui/sonner` if not already rendered there)
- Test: `apps/web/tests/ui.test.tsx`

**Interfaces:**

- Produces: `Button` with variants `default` (ink pill, `shadow-[0_4px_0_#000]`, press: `active:translate-y-0.5 active:shadow-[0_1px_0_#000]`), `outline` (white pill, line ring and 3 px line shadow), `sky` (sky pill, sky-deep shadow), `ghost`, `destructive`, `link`; sizes `default`, `sm`, `lg`, `icon`. Hover lifts `-translate-y-0.5` with `transition-transform` spring-like easing `ease-[cubic-bezier(.3,.7,.4,1.5)]`, disabled under `motion-reduce:`. Existing call sites keep working because variant and size names are a superset of today's.

- [ ] **Step 1: Failing tests:** `Button` default and `sky` variants render distinct class strings containing `rounded-full`; `asChild` renders an `<a>`; `Field` renders a `<label>` tied to its control by `htmlFor`; `ErrorMessage` with empty message renders nothing.
- [ ] **Step 2: Run** `bun test tests/ui.test.tsx`. Expected: FAIL on `rounded-full` / `sky`.
- [ ] **Step 3: Implement** as in Interfaces. Replace every `lucide-react` import inside the generated shadcn files with the Phosphor equivalent (`X`, `CaretDown`, `CaretRight`, `Check`, `Circle`).
- [ ] **Step 4: Run** `bun test` and `bun run check` (root). Expected: PASS; no call site type errors.
- [ ] **Step 5: Checkpoint.**

### Task 4: World scene parts

**Files:**

- Create: `apps/web/src/components/world/sky.tsx` (exports below), `apps/web/src/components/world/use-parallax.ts`
- Test: `apps/web/tests/world.test.tsx`

**Interfaces:**

- Produces (all decorative, `aria-hidden="true"`, inline SVG or divs, no images):
  - `Sky({ className, children })`: gradient `#1f7fe6 0%, #3fa9ff 42%, #9fdcff 78%, #d8f3ff 100%`, `relative isolate overflow-hidden`.
  - `Sun({ className })`, `Cloud({ className, depth?: number })`, `Hills({ layers?: 1 | 2 | 3; className })` (three layered paths in grass colors with light top strokes), `House({ door?: "terra" | "sky"; className })`, `Flyer({ tag?: string; className; delay?: number })` (a `JotMark` rotated -30deg with a mono pill tag and green dot, idle bob 6 s), `Bubble({ children, className })` (ink speech bubble pop loop), `Grain()` (SVG turbulence overlay, `mix-blend-overlay opacity-20`), `Trail({ d: string; className })` (dashed animated path).
  - `useParallax(ref): void` sets `translate` on children with `data-depth` from pointer position; no-op when reduced motion or coarse pointer.
  - `SkyScene({ variant: "hero" | "panel" | "banner" | "strip"; children })` composes the above for reuse by landing, auth panel, dashboard banner, author banner, post footer strip, error pages.

- [ ] **Step 1: Failing tests:** each `SkyScene` variant renders with `aria-hidden` on decoration and still renders `children` outside the hidden layer; `Flyer` renders its tag text; no output contains an emoji code point (regex `\p{Extended_Pictographic}`).
- [ ] **Step 2: Run** `bun test tests/world.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use mockup `jot-direction-a2.html` shapes and positions. Motion for bob and pop; CSS keyframes acceptable for the dashed trail.
- [ ] **Step 4: Run** `bun test`. Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 5: Marketing shell and Discover route

**Files:**

- Modify: `apps/web/src/components/shell.tsx` (`Header`, `Footer`, `Page`)
- Create: `apps/web/src/app/discover/page.tsx` (move today's feed UI out of `src/app/page.tsx` unchanged in behavior)
- Test: `apps/web/tests/shell.test.tsx`

**Interfaces:**

- Consumes: `Brand`, `Button`, `GITHUB_URL`, `docLinks`.
- Produces: `Header({ tone?: "sky" | "plain" })` (sky = transparent over the hero, white text; plain = white bar for other pages). Signed out: discover, how it works (`/#how`), self-host (`/#self-host`), github, `log in`, `start writing`. Signed in: discover, github, `dashboard`, `new page` (`/dashboard?new=1`). `Footer()`: spec section 8 copy and columns, fine print in mono. `Page({ children, tone? })`.
- Discover page: `/discover` with heading "read what people are publishing.", Latest/Popular as shadcn `Tabs`, search `Input`, `PostCard` grid; same `usePostCollection` call as today.

- [ ] **Step 1: Failing tests:** `Footer` HTML contains `https://github.com/toovinod/jot`, `/blob/main/docs/OPERATIONS.md`, `/blob/main/LICENSE`, and "names and pages shown on this site are samples."; `Footer` contains no em dash (U+2014); Discover page module exports a default component.
- [ ] **Step 2: Run** `bun test tests/shell.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** `Header` renders inside a minimal session-less fallback when `useSession` is loading (show signed-out links hidden until loaded, as today).
- [ ] **Step 4: Run** `bun test`. Expected: PASS.
- [ ] **Step 5: Browser check:** `/discover` loads the feed, search and tabs work; header and footer links resolve (GitHub links open the repo files).
- [ ] **Step 6: Checkpoint.**

### Task 6: Landing sections (static)

**Files:**

- Create: `apps/web/src/components/landing/hero.tsx`, `features.tsx`, `how-it-works.tsx`, `readers.tsx`, `self-host.tsx`, `closing.tsx`, `reveal.tsx`
- Modify: `apps/web/src/app/page.tsx` (compose: Hero, Demo placeholder slot, Features, HowItWorks, Readers, DiscoverPreview slot, SelfHost, Closing, Footer)
- Test: `apps/web/tests/landing.test.tsx`

**Interfaces:**

- Consumes: `SkyScene`, `Flyer`, `House`, `Bubble`, `Trail`, `Header tone="sky"`, `Button`, `JotMark animate`.
- Produces: `Reveal({ children, delay? })` (Motion `whileInView` fade-up 16 px, once, `viewport={{ once: true, amount: 0.3 }}`); each section exports a component with an `id` anchor: `#how`, `#self-host`.

- [ ] **Step 1: Failing tests:** rendering `<Hero />` contains "paste the mess." and "publish the page." and the spec sub verbatim; `<Features />` contains all six spec headings ("paste from anywhere.", "code that looks like code.", "make it yours.", "drafts stay drafts.", "every edition kept.", "an editor that won't rewrite you."); `<HowItWorks />` has `id="how"` and four stops; `<SelfHost />` links to `GITHUB_URL` and `docLinks.selfHost`; combined landing HTML does not match `/\bfree\b/i`, `/analytics/i`, `/custom domain/i`.
- [ ] **Step 2: Run** `bun test tests/landing.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** copy verbatim from spec sections 1, 3, 4, 5, 6, 7. Hero: eyebrow pill, Bricolage 800 headline with Fraunces italic second line, two flyers with `/@maya/slow-mornings` and `/@dev/why-we-left-redis`, houses with "+1 reader subscribed" bubble, `useParallax`. HowItWorks: wide hills strip; a `Flyer` moves along the dashed path with `useScroll` + `useTransform` (`offsetDistance` 0% to 100%) and each stop highlights when passed. Self-host: three white cards with pressable buttons. Closing: full-bleed `SkyScene variant="hero"` with many small flyers. `CTA` targets: signed out `/signup`, signed in `/dashboard?new=1`; "read a real page" goes to `/discover`.
- [ ] **Step 4: Run** `bun test`. Expected: PASS.
- [ ] **Step 5: Browser check** at 1440 and 390 widths against mockup A2.
- [ ] **Step 6: Checkpoint.**

### Task 7: Live demo

**Files:**

- Create: `apps/web/src/components/landing/demo-parse.ts`, `apps/web/src/components/landing/demo.tsx`
- Modify: `apps/web/src/app/page.tsx` (insert `<Demo />` after Hero)
- Test: `apps/web/tests/demo-parse.test.ts`, `apps/web/tests/demo.test.tsx`

**Interfaces:**

- Produces: `type DemoBlock = { kind: "h1" | "h2" | "p" | "li" | "todo" | "code"; text: string; done?: boolean }`; `DEMO_LIMIT = 2000`; `parseDemoNote(input: string): DemoBlock[]`; `SAMPLE_NOTE: string` (a messy note: `# slow mornings`, bullet lines, a `- [ ]` todo, a fenced code block); `Demo()`.

- [ ] **Step 1: Failing parser tests:**

````ts
expect(parseDemoNote("")).toEqual([]);
expect(parseDemoNote("# Hi\nplain")).toEqual([
  { kind: "h1", text: "Hi" },
  { kind: "p", text: "plain" },
]);
expect(parseDemoNote("- [x] done\n- [ ] not")).toEqual([
  { kind: "todo", text: "done", done: true },
  { kind: "todo", text: "not", done: false },
]);
expect(parseDemoNote("```js\nconst a = 1\n```")).toEqual([{ kind: "code", text: "const a = 1" }]);
expect(parseDemoNote("x".repeat(50000)).reduce((n, b) => n + b.text.length, 0)).toBeLessThanOrEqual(
  DEMO_LIMIT,
);
expect(parseDemoNote("<script>alert(1)</script>")).toEqual([
  { kind: "p", text: "<script>alert(1)</script>" },
]);
````

`demo.test.tsx`: rendered `<Demo />` HTML contains "try it. right here." and "this runs in your browser and saves nothing.", escapes `<script>` from `SAMPLE_NOTE`-style input, and the demo source file does not contain `dangerouslySetInnerHTML`.

- [ ] **Step 2: Run** `bun test tests/demo-parse.test.ts tests/demo.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Parser: truncate input to `DEMO_LIMIT` first, unclosed fence runs to end. Demo: a window with shadcn `Tabs` `1 paste`, `2 shape`, `3 publish`; left `Textarea` prefilled with `SAMPLE_NOTE`, right live preview of blocks. Shape tab: `ToggleGroup` serif/sans/mono, five accent swatches matching `document.tsx` light accent hexes, width narrow/standard/wide; preview restyles with Motion `layout`. Publish tab: button sends a `Flyer` off the window (Motion), then reveals mono `/@you/` + `slugify(first heading or "your-title")`. No network calls.
- [ ] **Step 4: Run** `bun test`. Expected: PASS.
- [ ] **Step 5: Browser check:** paste a long Google Docs selection; preview stays bounded; reduced motion shows the URL with no flight.
- [ ] **Step 6: Checkpoint.**

### Task 8: Discover preview and post cards

**Files:**

- Create: `apps/web/src/components/landing/discover-preview.tsx`
- Modify: `apps/web/src/components/post-card.tsx`, `apps/web/src/app/page.tsx`
- Test: existing `apps/web/tests/post-summary.test.tsx` (must keep passing), add a case in `apps/web/tests/landing.test.tsx`

**Interfaces:**

- Consumes: `usePostCollection("q=&sort=latest", 4)`.
- Produces: `PostCard` restyled as white card (rounded-2xl, line border, 3 px line bottom shadow, hover lift and `-rotate-[.3deg]`), Fraunces title, mono `/@user/slug`, likes and comments counts with Phosphor `Heart` and `ChatCircle`. Same props.

- [ ] **Step 1: Failing test:** `DiscoverPreview` renders heading "read what people are publishing." and a link to `/discover`; with zero posts it renders the empty copy "nothing here yet. be the first to publish." and a start-writing link (no error thrown).
- [ ] **Step 2: Run** the two test files. Expected: new case FAILS, `post-summary` passes.
- [ ] **Step 3: Implement.** Preview shows up to 4 posts, `Skeleton` while loading, hides itself on load error.
- [ ] **Step 4: Run** `bun test`. Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 9: Auth screens

**Files:**

- Create: `apps/web/src/components/auth-layout.tsx`
- Modify: `apps/web/src/components/auth-form.tsx`, `apps/web/src/app/login/page.tsx`, `apps/web/src/app/signup/page.tsx`, `apps/web/src/app/auth/forgot/page.tsx`, `apps/web/src/app/auth/reset/page.tsx`, `apps/web/src/app/auth/verify/page.tsx`
- Test: `apps/web/tests/auth.test.tsx`

**Interfaces:**

- Produces: `AuthLayout({ title, sub, children })`: left white column with `Brand` and the form card, right `SkyScene variant="panel"` (hidden below `md`).
- Copy: login "welcome back." / "your drafts are right where you left them."; signup "claim your /@name." with a live mono chip `/@{username || "username"}` under the username field, keeping today's permanence note.

- [ ] **Step 1: Failing tests:** signup `AuthForm` render contains "claim your /@name." and `/@username`; login render contains "welcome back."; form still posts to the same endpoints (assert the source still references `/auth/signup` and `/auth/login`).
- [ ] **Step 2: Run** `bun test tests/auth.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** markup and styling only; keep every handler, validation and redirect as is.
- [ ] **Step 4: Run** `bun test`. Expected: PASS.
- [ ] **Step 5: Browser check:** sign up a new account and log in end to end against the running API.
- [ ] **Step 6: Checkpoint.**

### Task 10: App shell and dashboard

**Files:**

- Create: `apps/web/src/lib/dashboard-stats.ts`
- Modify: `apps/web/src/components/shell.tsx` (replace `LibraryNav` with `AppShell`), `apps/web/src/app/dashboard/page.tsx`
- Test: `apps/web/tests/dashboard-stats.test.ts`

**Interfaces:**

- Produces:
  - `type DashboardStats = { live: number; drafts: number; likes: number }`
  - `summarize(posts: PostSummary[]): DashboardStats` (live = `isPublished`, drafts = `!isPublished`, likes = sum of `likes`)
  - `loadAllMine(fetchPage: (offset: number, limit: number) => Promise<PostSummary[]>, limit = 50): Promise<PostSummary[]>` (pages until a page shorter than `limit`; hard stop at 2000 posts; rejects on fetch error)
  - `greeting(date: Date): "morning" | "afternoon" | "evening"` (before 12, before 18, else)
  - `AppShell({ active: "mine" | "bookmarks" | "discover" | "settings"; children })`: white sidebar (Brand; Your writing `PencilSimpleLine`; Bookmarks `BookmarkSimple`; Discover `Compass` to `/discover`; Settings `GearSix`, all duotone; hills strip at bottom with account chip and a `DropdownMenu` containing Log out using today's logout logic). Below `md` it becomes a top bar with a `Sheet`.

- [ ] **Step 1: Failing tests:**

```ts
expect(summarize([pub(3), pub(2), draft(0)])).toEqual({ live: 2, drafts: 1, likes: 5 });
// 120 posts, limit 50 -> fetchPage called with offsets 0, 50, 100, returns 120 items
// fetchPage throwing on second call -> loadAllMine rejects
expect(greeting(new Date(2026, 0, 1, 9))).toBe("morning");
expect(greeting(new Date(2026, 0, 1, 12))).toBe("afternoon");
expect(greeting(new Date(2026, 0, 1, 18))).toBe("evening");
```

- [ ] **Step 2: Run** `bun test tests/dashboard-stats.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** helpers, then dashboard: `SkyScene variant="banner"` with "{greeting}, {first name}." (Fraunces italic name) and status line "{drafts} drafts waiting." when drafts > 0, else "everything you wrote is live."; `+ new page` button using today's `createStory`; three stat `Card`s (pages live, drafts, likes on your pages) fed by `loadAllMine` using `api("/posts?scope=mine&offset=..&limit=..")`, showing `Skeleton` while loading and "-" with a muted "couldn't load totals" note on error; shadcn `Tabs` All / Live / Drafts / Unlisted over today's list; post rows as cards with status `Badge` (Live green, Draft gray, Unlisted sky). Bookmarks tab (`?tab=bookmarks`) renders the bookmarks list under the same shell. Keep `?new=1` behavior.
- [ ] **Step 4: Run** `bun test`. Expected: PASS.
- [ ] **Step 5: Browser check** with the seeded account: numbers match the list; create a page from the banner button.
- [ ] **Step 6: Checkpoint.**

### Task 11: Editor

**Files:**

- Modify: `apps/web/src/components/editor/editor-workspace.tsx`, `editor-toolbar.tsx`, `editor-sidebar.tsx`, `draft-canvas.tsx`, `appearance-panel.tsx`, `ai-panel.tsx`, `publication-panel.tsx`, `publication-history.tsx`, `save-notice.tsx`, `recovery-notice.tsx`, `rich-editor.tsx` (class strings only)
- Test: existing `apps/web/tests/editor-controller.test.tsx`, `editor-import.test.ts`, `paste.test.ts`, `save-queue.test.ts`, `draft-recovery.test.ts` must keep passing unchanged

**Interfaces:**

- Consumes: `Button`, `ToggleGroup`, `Tabs`, `Tooltip`, `Badge`, `Sheet`, `JotMark`.
- Produces: no new exports. Toolbar icons are Phosphor bold (`TextB`, `TextItalic`, `TextHTwo`, `Quotes`, `Code`, `ListChecks`, `Image`, `Table`). Layout per mockup `jot-app-cool.html`: white top bar (mark, mono breadcrumb, save status dot from the existing save state, `preview` outline button, `publish` sky button); app-bg canvas with a white rounded sheet; dark floating toolbar (ink pill group, active item `bg-white/20`, each button with `Tooltip`); right panel `Tabs`: Appearance, Suggestions, Publish, History. Appearance: accent swatch radio group, font `ToggleGroup`, width `ToggleGroup`, page theme `ToggleGroup` (system, light, dark) kept, sortable sections kept (dnd-kit) with grip and arrow buttons. Suggestions: each result as an amber card with keep and skip. Below `lg` the panel opens in a `Sheet`.

- [ ] **Step 1: Run the editor tests now** `bun test tests/editor-controller.test.tsx tests/editor-import.test.ts tests/paste.test.ts tests/save-queue.test.ts tests/draft-recovery.test.ts`. Expected: PASS (baseline).
- [ ] **Step 2: Restyle** the files listed, changing markup and classes only; every handler, prop and state hook stays.
- [ ] **Step 3: Run** the same tests plus `bun run check` (root). Expected: PASS.
- [ ] **Step 4: Browser check:** paste from Google Docs, import a `.md`, upload an image, reorder sections by keyboard and pointer, run a grammar suggestion if AI is configured (or see the honest disabled state), publish, restore an edition.
- [ ] **Step 5: Checkpoint.**

### Task 12: Public post and author page

**Files:**

- Modify: `apps/web/src/components/document.tsx` (Article layout and fonts only), `apps/web/src/components/engagement.tsx`, `apps/web/src/components/subscribe.tsx`, `apps/web/src/app/[handle]/page.tsx`, `apps/web/src/app/[handle]/[slug]/page.tsx`
- Test: existing `apps/web/tests/document.test.tsx`, `public-route.test.ts`; extend `tests/theme.test.tsx`

**Interfaces:**

- Consumes: `themeClass`, `SkyScene variant="strip"`, `PostCard`.
- Produces: Article keeps theme, accent and width logic; serif = Fraunces, sans = Geist, mono = Geist Mono. Post page: `Header tone="plain"`, article, engagement row (like, bookmark as pressable icon buttons with counts), comments as cards, then a sky-and-hills strip with the subscribe form and "published with jot" link to `/`. Author page: `SkyScene variant="banner"` with avatar, name, bio, subscribe; `PostCard` grid.

- [ ] **Step 1: Failing test** in `theme.test.tsx`: Article with `font: "serif"` has class `font-serif`; with `theme: "dark"` has class `dark` and does not contain `theme-system`.
- [ ] **Step 2: Run** `bun test tests/theme.test.tsx tests/document.test.tsx tests/public-route.test.ts`. Expected: only new cases may fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun test`. Expected: PASS.
- [ ] **Step 5: Browser check:** view a light, a dark and a system post (with dark emulation); like, bookmark, comment, subscribe.
- [ ] **Step 6: Checkpoint.**

### Task 13: Settings, subscriptions, error, not-found

**Files:**

- Modify: `apps/web/src/app/settings/page.tsx`, `apps/web/src/components/account-action.tsx`, `apps/web/src/app/subscriptions/confirm/page.tsx`, `apps/web/src/app/subscriptions/unsubscribe/page.tsx`, `apps/web/src/components/subscription-action.tsx`, `apps/web/src/app/error.tsx`, `apps/web/src/app/not-found.tsx`
- Test: `apps/web/tests/misc-pages.test.tsx`

**Interfaces:**

- Consumes: `AppShell active="settings"`, `Card`, `SkyScene variant="panel"`, `Flyer`.
- Produces: settings as profile and account `Card`s inside `AppShell`; subscription pages as one centered card on a sky panel with the single existing action button; not-found and error: sky scene with a lone `Flyer`, headline "this page flew off.", buttons home and discover (error page keeps its reset handler).

- [ ] **Step 1: Failing test:** `NotFound` render contains "this page flew off." and links to `/` and `/discover`.
- [ ] **Step 2: Run** `bun test tests/misc-pages.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** markup and styling only.
- [ ] **Step 4: Run** `bun test`. Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 14: Full verification

**Files:** none new unless fixes are needed.

- [ ] **Step 0: Remove lucide.** `grep -rn "lucide-react" apps/web/src` must print nothing (every screen task swaps its own icons to Phosphor); then `bun remove lucide-react` in `apps/web`.
- [ ] **Step 1: Run** `bun run verify` from repo root. Expected: source policy passed, checks, tests and build all green.
- [ ] **Step 2: Run** `bun run test:integration` against a disposable database with the app running. Expected: PASS.
- [ ] **Step 3: Browser pass** at 1440 and 375 widths on `/`, `/discover`, `/login`, `/signup`, `/auth/forgot`, `/dashboard`, `/dashboard?tab=bookmarks`, `/editor/[id]`, `/@user`, `/@user/slug`, `/settings`, `/subscriptions/confirm`, `/subscriptions/unsubscribe`, a 404. On each, evaluate `document.documentElement.scrollWidth <= window.innerWidth` (expected `true`) and screenshot.
- [ ] **Step 4: Reduced motion:** emulate `prefers-reduced-motion: reduce`; reload `/`; hero logo, flyers, reveals and demo show final state with no movement.
- [ ] **Step 5: Keyboard:** tab through landing, auth and editor; focus rings visible on sky and white backgrounds; dialogs and sheets trap and restore focus.
- [ ] **Step 6: Checkpoint:** report results and screenshots to the owner.
