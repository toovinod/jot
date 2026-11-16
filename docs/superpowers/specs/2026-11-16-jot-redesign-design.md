# Jot redesign: landing page and app UI

Status: owner decisions recorded; awaiting final approval.
Date: 2026-11-16.

## Intent

The current web UI reads as generic ("AI slop"): dark terracotta, Arial and Georgia, hand-rolled controls, no motion.
The owner wants Jot to feel as alive and specific as dusk.bot, using real component libraries, with marketing copy that describes what Jot actually does.
Success: a landing page people want to scroll, an app that feels like the same world, and copy where every claim is true of the shipped product.

## Goals

- New landing page with an original illustrated world, a working in-browser demo, a feature grid, a "how it works" path, a self-host section, a final call to action and a full footer.
- Restyle every app screen in the same world: auth (login, signup, forgot, reset, verify), dashboard, editor, public post, author page, settings, subscription confirm and unsubscribe, error and not-found.
- New logo (owner supplied `jot.png`, three pages fanned from one corner) as a clean SVG, plus a filled variant for 16 to 32 px.
- New type system, shadcn/ui components, Motion animations and micro-interactions.

## Non-goals

- No backend or API changes. Go API, worker, contracts and data shapes stay as they are.
- No new product features. Nothing the copy promises may be missing from the product.
- No read counts or subscriber counts in the dashboard: the API does not expose them today.
- No pricing section and no price claims.

## Anti-goals

- A dusk.bot clone: no pixel art, no bot characters, no copied layout or copy. Inspiration only.
- Copy that claims things Jot does not do (analytics, custom domains, lossless import of every pasted image, "free" hosting).
- Motion that slows reading or ignores `prefers-reduced-motion`.
- Breaking the editor: paste handling, save queue, draft recovery and publishing behavior must not change.

## Decisions made with the owner

| Decision          | Choice                                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overall direction | Playful illustrated world (option C, then hero option A "paper planes")                                                                                                |
| World             | Bright sky gradient, sun, clouds, layered rolling hills, small houses as readers, paper grain                                                                          |
| Motif             | The logo's fanned pages are the flying "planes", each carrying a `/@user/slug` tag; houses get "+1 reader subscribed" bubbles                                          |
| Inside the app    | Same world, not a cream editorial look: white cards on a pale sky background, sky accent, hills accents, pressable buttons. The writing sheet itself stays clean white |
| Dark mode         | Removed from the app UI. Light only. Published pages still honor the author's per-page theme (system, light, dark), so readers can see dark pages                      |
| Repository        | https://github.com/toovinod/jot (public, open source)                                                                                                                  |
| Logo              | Owner's fanned-pages mark, redrawn as SVG                                                                                                                              |
| Fonts             | Owner asked for better fonts; chosen pairing approved via mockup                                                                                                       |

Approved mockups (throwaway, not production code):

- Hero and type: `scratchpad/jot-direction-a2.html`
- Dashboard and editor: `scratchpad/jot-app-cool.html`

## Approaches considered

1. **Playful outside, calm editorial inside (cream).** Rejected by the owner after mockup: the app felt too plain.
2. **Bright desk with sticky notes (hero B).** Rejected: its world lives only in the hero and does not carry through the page.
3. **One playful sky world everywhere, calm only on the writing sheet.** Chosen. One visual system for marketing and app, motif tied to the logo and to what Jot does (pages fly out, readers receive them).

## Visual system

### Color tokens (light only)

| Token                         | Value                                      | Use                                    |
| ----------------------------- | ------------------------------------------ | -------------------------------------- |
| ink                           | `#16140f`                                  | Text, primary dark buttons             |
| sky-deep / sky / sky-light    | `#1f7fe6` / `#3fa9ff` / `#d8f3ff`          | Hero gradient, banners, primary accent |
| sky-soft                      | `#e3f2ff`                                  | Active nav, soft fills                 |
| app-bg                        | `#f4f9ff`                                  | App background                         |
| line                          | `#dbe8f5`                                  | Borders, pressed-button shadow         |
| grass 1 / 2 / 3               | `#86dd78` / `#45bd5f` / `#23944c`          | Hills                                  |
| sun                           | `#ffd34d`                                  | Sun, avatar, highlights                |
| status live / draft / changes | green / gray / amber pairs from the mockup | Post status pills                      |
| destructive                   | keep a red for delete and errors           |                                        |

Mapped onto shadcn CSS variables (`--background`, `--primary`, and so on) in `globals.css`.
App chrome is light only and `next-themes` with its toggle is removed. The dark tokens and `dark` variant stay only as far as `document.tsx` needs them to render a published page whose author chose a dark theme.

### Type

| Role            | Font                                                                   | Where                                                         |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| Display         | Bricolage Grotesque 700 to 800, tight tracking                         | Landing headlines, dashboard greeting, wordmark               |
| Editorial serif | Fraunces (SOFT 100 italic for accents; regular for titles and reading) | Headline accents, post titles, editor and public reading text |
| Interface       | Geist                                                                  | Buttons, forms, menus, body UI                                |
| Mono            | Geist Mono                                                             | URLs, code, small labels                                      |

All loaded with `next/font/google` and exposed as Tailwind theme fonts.
Published-page font choices (serif, sans, mono) map to Fraunces, Geist and Geist Mono.

### Shape and motion language

- Rounded (12 to 28 px radii), pill buttons with a solid bottom shadow that compresses on press (spring easing).
- Cards lift 2 px on hover.
- Load: logo pages fan open from the hinge corner.
- Scroll: sections ease in once, planes follow a dashed path in "how it works".
- Hero: subtle pointer parallax on hills and clouds, idle bobbing planes, pulsing sun.
- Every animation is disabled or reduced under `prefers-reduced-motion`.

### Libraries

| Library                                          | Why                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| shadcn/ui (Tailwind v4 setup, `components.json`) | Button, input, label, tabs, dialog, dropdown-menu, sheet, tooltip, toggle-group, card, badge, avatar, separator, skeleton, sonner. Replaces hand-written `ui/button.tsx` and `ui/fields.tsx`                                                                                                                                         |
| `motion`                                         | Load, scroll, layout and press animations                                                                                                                                                                                                                                                                                            |
| `next/font`                                      | Fonts, no new dependency                                                                                                                                                                                                                                                                                                             |
| `@phosphor-icons/react`                          | All icons. Replaces lucide-react, which the owner rejected as generic. Weights: duotone for navigation and feature tiles (tinted with sky, grass, sun, rose), bold for the editor toolbar and small buttons, fill for on-states (liked heart, saved bookmark, publish plane, GitHub logo). Use the `/ssr` entry in server components |

Already present and kept: Radix Slot, cva, clsx, tailwind-merge, sonner, tw-animate-css. `lucide-react` is removed once nothing imports it, including the icons inside generated shadcn components.
`next-themes` is removed with the app's dark-mode toggle; published-page theme is applied by `document.tsx` as today.
The Vercel AI SDK is not used: Jot's AI runs as queued jobs in the Go API, not streaming chat.

## Landing page

Sections, top to bottom, with final copy.
Voice: lowercase on marketing headlines, short, concrete, no hype words.

### Nav

`jot` logo and wordmark · discover · how it works · self-host · github · `log in` · `start writing`.

### 1. Hero

- Eyebrow: `open source` · a home for your words at /@you
- Headline: **paste the mess.** _publish the page._
- Sub: bring notes from Google Docs, Notion, Word, Apple Notes or plain Markdown. jot keeps your headings, lists, tables and code, and gives the page its own link.
- Buttons: `start writing` · `read a real page` (links to Discover)
- Scene: sky, sun, clouds, hills, two planes with link tags, houses with a subscribe bubble.

### 2. Live demo ("try it right here")

- Headline: **try it. right here.**
- Sub: this runs in your browser and saves nothing.
- A small editor window in three tabs: `1 paste` · `2 shape` · `3 publish`.
  - Paste: a messy sample note (Markdown symbols, a code fence, a todo list) that the visitor can also replace by typing or pasting. It renders into clean formatted blocks.
  - Shape: font segmented control (serif, sans, mono), five accent swatches, width control. The preview restyles live.
  - Publish: a publish button that animates a plane off the page and reveals `/@you/your-title` built from the title.
- Client-side only. No API calls. Uses a lightweight renderer, not the real Tiptap editor, unless reusing Tiptap is simpler for the builder.

### 3. Features: "everything a page needs. nothing it doesn't."

Six cards, each with a Phosphor duotone icon in a tinted tile (ClipboardText, BracketsCurly, Palette, EyeSlash, ClockCounterClockwise, Sparkle, in the order of the cards below):

1. **paste from anywhere.** Google Docs, Notion, Word, Apple Notes, a web page. the structure survives the trip.
2. **code that looks like code.** code blocks, tables, task lists and images sit right next to your words.
3. **make it yours.** pick a font, an accent and a reading width. drag the cover, title and author bio into the order you like.
4. **drafts stay drafts.** keep editing a live page. readers see the published version until you publish again.
5. **every edition kept.** each publish is saved. bring an old one back into your draft without touching what's live.
6. **an editor that won't rewrite you.** optional AI checks grammar, flow and gaps in your argument. it suggests. you decide.

### 4. How it works: "from notes to readers in four stops."

A wide hills strip; a plane travels along a dashed path, stopping at four flags as the user scrolls.

1. **paste.** drop it in. messy is fine.
2. **shape.** fix the headings, pick the look.
3. **publish.** your page lives at /@you/your-title. share it openly, or keep it unlisted for the people you send it to.
4. **land.** it shows up in discover, and people who subscribed get it by email.

### 5. Readers: "pages people come back to."

Short strip of three items: readers can like, bookmark and comment; search Discover by latest or popular; subscribe to an author by email and leave in one click.

### 6. Self-host: "yours to keep. yours to run."

Three cards in the place dusk.bot uses for pricing:

- **write here.** sign up and start publishing. (button: `start writing`)
- **run your own.** Next.js, a Go API and Postgres. one Docker Compose file. email (Resend) and AI (OpenAI) switch on only when you add keys. (button: `self-hosting guide`)
- **make it better.** MIT licensed. read the code, open an issue, send a pull request. (button: `github`)

### 7. Final call to action

Full-bleed sky and hills band, like dusk.bot's closing scene, with many small planes drifting.

- Headline: **your notes are already a post.**
- Sub: they just don't know it yet.
- Buttons: `start writing` · `star on github`

### 8. Footer

- Logo, wordmark, line: "a home for your words at /@you."
- Columns: **product** (discover, start writing, log in) · **learn** (how it works, self-hosting, API) · **open source** (github, MIT license, contributing, security). Doc links point at the GitHub files: `docs/OPERATIONS.md`, `docs/API.md`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md` under https://github.com/toovinod/jot.
- Fine print in mono: "made with jot. names and pages shown on this site are samples."

## App screens

All screens share: white cards on `app-bg`, sky accents, pill buttons, Bricolage headings, logo top-left.
Behavior, data loading and API calls stay exactly as they are today; only markup and styling change.

| Screen                             | Design                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login                              | Split layout: form on white left; right panel is the sky-and-hills scene with a plane. Headline: "welcome back." Sub: "your drafts are right where you left them."                                                                                                                                                                                                              |
| Signup                             | Same split. Headline: "claim your /@name." Live preview chip shows `/@username` as the user types the username. Note that the username is permanent, as today                                                                                                                                                                                                                   |
| Forgot / reset / verify            | Same split, single card, short copy                                                                                                                                                                                                                                                                                                                                             |
| Dashboard                          | Sidebar (logo, Your writing, Bookmarks, Discover, Settings, account chip over small hills). Sky banner with greeting "morning, name." and a status line from real counts. Three stat cards: pages live, drafts, total likes. Tabs All, Live, Drafts, Unlisted. Post cards with status pill (Live, Draft, Unlisted only), slug in mono, relative time, hover lift                |
| Editor                             | Top bar: logo, breadcrumb, save status dot, preview, `publish`. Clean white writing sheet with a dark floating toolbar. Right panel: appearance (accent swatches, font segmented control, width, sortable sections), AI suggestions as cards with keep and skip, publication panel and edition history. Existing recovery and save notices restyled as toasts or inline banners |
| Public post                        | Reader-first page using the author's chosen font, accent, width and theme (light or dark, including system). Dark pages keep today's dark accent values. Small sky-and-hills footer strip with subscribe form and "published with jot". Likes, bookmark and comments restyled                                                                                                   |
| Author page (`/@handle`)           | Sky banner with avatar, name, bio and subscribe; grid of post cards                                                                                                                                                                                                                                                                                                             |
| Settings                           | Cards for profile (name, bio, avatar) and account actions, same visual language                                                                                                                                                                                                                                                                                                 |
| Subscription confirm / unsubscribe | Small centered card on the sky scene, one action button, as today                                                                                                                                                                                                                                                                                                               |
| Error / not-found                  | Scene with a lost plane: "this page flew off."                                                                                                                                                                                                                                                                                                                                  |

Discover lives at `/` today. It moves to its own route `/discover` with the existing feed, search, and latest or popular tabs. The landing page gets a short "read what people are publishing" preview (first few posts from the feed) linking to it.

## Builder calls (made by Claude, owner can override)

- **Dashboard numbers:** the API returns paged lists with no totals and no "published with unpublished edits" flag. Stats are computed client-side by loading all of the author's own posts (`scope=mine`, paging until a short page). The "unpublished edits" pill and count from the mockup are dropped because the API cannot tell.
- **Bookmarks:** kept. Gets its own sidebar item, reusing today's bookmarks tab data.
- **`/` for signed-in users:** everyone sees the landing page. When signed in, the nav swaps `log in` / `start writing` for `dashboard` / `new page`.
- **Accent colors on published posts:** the stored names (orange, green, blue, violet, rose) keep their current light-mode hues so existing posts don't change look. Only app chrome uses the new palette.
- **Logo source:** owner's attachment `/Users/vinodbiradar/.t3/userdata/attachments/22118671-b25d-4c73-ac23-0f3c7b1490b6-1c36bf3c-e282-4ada-a2f8-001dc82eb147.png`, copied into the repo when building.

## Constraints

- Next.js 16, React 19.3, Tailwind 4, Bun. Stay within the existing stack.
- Source policy check fails on any em dash or emoji in source. Use Phosphor icons, never emoji glyphs.
- Repo gates: `bun run check`, `bun run test`, `bun run build` (or `bun run verify`). Existing tests in `apps/web/tests` must keep passing.
- Do not hand-edit `bun.lock`; add packages with `bun add`.
- Keep accessibility: focus rings, labels, keyboard sortable sections, contrast on sky backgrounds (white text on `#1f7fe6`, dark text on light sky).
- Layout must work at phone width with no horizontal scroll.

## Left to the builder

- Exact component breakdown, file layout for landing sections, and shadcn components added beyond the list above.
- Whether the demo reuses Tiptap or a lightweight renderer.
- Illustration technique (inline SVG recommended) and exact animation timings.
- Responsive breakpoints and mobile variants of the hero scene.
- Order of work, as long as the landing page lands first and each screen is checked in a browser.
