"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookmarkSimple,
  Compass,
  DotsThree,
  GearSix,
  GithubLogo,
  HardDrives,
  List,
  PencilSimpleLine,
  Plus,
  Question,
  SignOut,
  UserCircle,
} from "@phosphor-icons/react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useSession } from "./providers";
import { Brand } from "./brand/logo";
import { useStartHref } from "./landing/reveal";
export { Brand };
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./ui/sheet";
import { Critter, type CritterKind } from "./world/critters";
import { EmptyState } from "./app/empty-state";
import { Ground } from "./app/ground";
import { ink, raised } from "./app/pill";
import { IconButton } from "./app/toolbar";
import { api } from "@/lib/api";
import { appHref } from "@/lib/app-origin";
import { clearAllDraftRecovery } from "@/lib/draft-recovery";
import { cn } from "@/lib/utils";
import { GITHUB_URL, docLinks } from "@/lib/site";
export function Header({
  tone = "plain",
  appOrigin,
}: {
  tone?: "sky" | "plain";
  /** Set on a custom domain, where app pages live on the app origin. */
  appOrigin?: string;
}) {
  const { user, loading } = useSession();
  const [menu, setMenu] = useState(false);
  const app = (path: string) => appHref(path, appOrigin);
  const sky = tone === "sky";
  const link = cn(
    "hidden rounded-full px-3 py-1.5 text-sm font-medium transition-colors md:block",
    sky
      ? "text-white/90 hover:bg-white/15 hover:text-white"
      : "text-muted-foreground hover:bg-sky-soft hover:text-foreground",
  );
  // Phones get the same links, and the session actions, in a sheet.
  const menuLinks = [
    { label: "discover", href: app("/discover"), icon: Compass },
    ...(user
      ? []
      : [
          { label: "how it works", href: app("/#how"), icon: Question },
          { label: "self-host", href: docLinks.selfHost, icon: HardDrives },
        ]),
    { label: "github", href: GITHUB_URL, icon: GithubLogo },
  ];
  const menuActions = loading
    ? []
    : user
      ? [
          { label: "dashboard", href: app("/dashboard") },
          { label: "new page", href: app("/editor/new"), primary: true },
        ]
      : [
          { label: "log in", href: app("/login") },
          { label: "start writing", href: app("/signup"), primary: true },
        ];
  return (
    <header
      className={cn(
        "z-30 w-full",
        sky
          ? "absolute inset-x-0 top-0 text-white [--mark-fill:#fff]"
          : "sticky top-0 border-b border-border bg-white/80 backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-4 px-4 md:px-8">
        <Brand
          animate
          href={app("/")}
          className={sky ? "text-white [&_svg]:text-ink" : undefined}
        />
        <nav className="flex items-center gap-1">
          <Link href={app("/discover")} className={link}>
            discover
          </Link>
          {!user && (
            <>
              <Link href={app("/#how")} className={link}>
                how it works
              </Link>
              <a href={docLinks.selfHost} className={link}>
                self-host
              </a>
            </>
          )}
          <a href={GITHUB_URL} className={cn(link, "items-center gap-1.5 md:flex")}>
            <GithubLogo weight="fill" className="size-4" />
            github
          </a>
          <span className="w-2" />
          {!loading &&
            (user ? (
              <>
                <Button variant="outline" size="sm" asChild className="h-9">
                  <Link href={app("/dashboard")}>dashboard</Link>
                </Button>
                <Button variant="default" size="sm" asChild className="ml-2 h-9">
                  <Link href={app("/editor/new")}>
                    <Plus weight="bold" />
                    new page
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" asChild className="h-9">
                  <Link href={app("/login")}>log in</Link>
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  asChild
                  className="ml-2 hidden h-9 sm:inline-flex"
                >
                  <Link href={app("/signup")}>start writing</Link>
                </Button>
              </>
            ))}
          <Sheet open={menu} onOpenChange={setMenu}>
            <SheetTrigger asChild>
              <IconButton label="Open menu" className="ml-2 md:hidden">
                <List weight="bold" />
              </IconButton>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 gap-0 px-3 pb-5 pt-5">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <Brand href={app("/")} className="px-2" />
              <nav aria-label="Site" className="mt-6 grid gap-1">
                {menuLinks.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={() => setMenu(false)}
                    className="notched flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-sky-soft hover:text-foreground focus-visible:bg-sky-soft"
                  >
                    <item.icon weight="bold" aria-hidden="true" className="size-[18px]" />
                    {item.label}
                  </a>
                ))}
              </nav>
              {menuActions.length > 0 && (
                <div className="mt-6 grid gap-2 px-1">
                  {menuActions.map((item) => (
                    <Button key={item.label} variant={item.primary ? "default" : "outline"} asChild>
                      <Link href={item.href} onClick={() => setMenu(false)}>
                        {item.label}
                      </Link>
                    </Button>
                  ))}
                </div>
              )}
            </SheetContent>
          </Sheet>
        </nav>
      </div>
    </header>
  );
}
const footerColumns = [
  {
    title: "product",
    links: [
      { label: "discover", href: "/discover" },
      { label: "how it works", href: "/#how" },
      { label: "start writing", href: "/signup" },
    ],
  },
  {
    title: "resources",
    links: [
      { label: "self-hosting", href: docLinks.selfHost },
      { label: "API", href: docLinks.api },
      { label: "github", href: GITHUB_URL },
      { label: "contributing", href: docLinks.contributing },
    ],
  },
  {
    title: "legal",
    links: [
      { label: "privacy", href: "/privacy" },
      { label: "terms", href: "/terms" },
      { label: "MIT license", href: docLinks.license },
      { label: "security", href: docLinks.security },
    ],
  },
];
export function Footer({ appOrigin }: { appOrigin?: string }) {
  const start = useStartHref();
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1.6fr_repeat(3,1fr)] md:px-8">
        <div className="space-y-3">
          <Brand href={appHref("/", appOrigin)} />
          <p className="text-sm text-muted-foreground">
            questions?{" "}
            <a
              href={`${GITHUB_URL}/issues`}
              className="text-foreground underline underline-offset-4 hover:text-sky-deep"
            >
              open an issue
            </a>
            .
          </p>
        </div>
        {footerColumns.map((column) => (
          <div key={column.title}>
            <p className="mb-4 text-[15px] text-foreground">{column.title}</p>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              {column.links.map((item) => (
                <li key={item.label}>
                  {item.href.startsWith("http") ? (
                    <a href={item.href} className="transition-colors hover:text-foreground">
                      {item.label}
                    </a>
                  ) : (
                    <Link
                      href={appHref(item.href === "/signup" ? start : item.href, appOrigin)}
                      className="transition-colors hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
export function Page({ children, tone }: { children: ReactNode; tone?: "sky" | "plain" }) {
  return (
    <>
      <Header tone={tone} />
      <main className="mx-auto min-h-[70vh] max-w-7xl px-4 py-12 md:px-8">{children}</main>
      <Footer />
    </>
  );
}
export function Private({ children }: { children: ReactNode }) {
  const { user, loading, authError } = useSession();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (!loading && !user && !authError) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [loading, user, authError, path, router]);
  if (loading)
    return (
      <Page>
        <Loading />
      </Page>
    );
  if (authError && !user)
    return (
      <Page>
        <EmptyState
          critter="plane"
          title="can't reach jot right now."
          body={authError}
          action={<Button onClick={() => location.reload()}>retry connection</Button>}
          className="mx-auto max-w-xl"
        />
      </Page>
    );
  if (!user)
    return (
      <Page>
        <Loading />
      </Page>
    );
  return <Fragment key={user.id}>{children}</Fragment>;
}
const appNav = [
  {
    name: "your writing",
    value: "mine",
    icon: PencilSimpleLine,
    href: "/dashboard",
    color: ink.sun,
  },
  {
    name: "bookmarks",
    value: "bookmarks",
    icon: BookmarkSimple,
    href: "/dashboard?tab=bookmarks",
    color: ink.violet,
  },
  { name: "discover", value: "discover", icon: Compass, href: "/discover", color: ink.sky },
  { name: "settings", value: "settings", icon: GearSix, href: "/settings", color: ink.grass },
] as const;
type AppSection = (typeof appNav)[number]["value"];
// Each section has its own little scene on the sidebar hill: one critter hopping, one drifting over.
const hillScenes: Record<AppSection, { hops: CritterKind; drifts: CritterKind }> = {
  mine: { hops: "pencil", drifts: "plane" },
  bookmarks: { hops: "bookmark", drifts: "heart" },
  discover: { hops: "book", drifts: "plane" },
  settings: { hops: "cup", drifts: "cloud" },
};
function AppNav({ active, onNavigate }: { active: AppSection; onNavigate?: () => void }) {
  const { user } = useSession();
  const [logoutError, setLogoutError] = useState("");
  async function logout() {
    setLogoutError("");
    try {
      await api("/auth/logout", { method: "POST" });
      clearAllDraftRecovery();
      // A full load drops every bit of signed-in state; a client push would race the private-page redirect to login.
      location.replace("/");
    } catch {
      setLogoutError("couldn't log out. please try again.");
    }
  }
  return (
    <div className="relative flex h-full flex-col overflow-hidden px-3 pb-4 pt-5">
      <Brand className="px-2" />
      <Button asChild className="mx-1 mt-6">
        <Link href="/editor/new" onClick={onNavigate}>
          <Plus weight="bold" />
          new page
        </Link>
      </Button>
      <nav aria-label="App" className="mt-6 grid gap-1">
        {appNav.map((item) => {
          const on = item.value === active;
          return (
            <Link
              key={item.value}
              href={item.href}
              onClick={onNavigate}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-full px-3 py-2.5 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-sky/50",
                on
                  ? cn(raised, "text-ink")
                  : "text-muted-foreground hover:bg-background hover:text-foreground",
              )}
            >
              <item.icon
                weight="bold"
                className="size-[18px]"
                style={on ? { color: item.color } : undefined}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-24">
        <Ground className="h-full" />
        <Critter
          kind={hillScenes[active].drifts}
          blinkDelay={-1.5}
          className="absolute bottom-[64px] left-[10%] size-7 animate-[fly-off_9s_ease-in-out_-3s_infinite] motion-reduce:animate-none"
        />
        <Critter
          kind={hillScenes[active].hops}
          className="absolute bottom-[58px] right-[18%] size-9 animate-[hop_2.6s_ease-in-out_infinite] motion-reduce:animate-none"
        />
      </div>
      {logoutError && (
        <p
          role="alert"
          className="absolute inset-x-3 bottom-17 z-10 rounded-xl border border-destructive/25 bg-white p-2.5 text-xs text-destructive"
        >
          {logoutError}
        </p>
      )}
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger className="absolute inset-x-3 bottom-4 z-10 flex cursor-pointer items-center gap-2.5 rounded-full bg-white py-1.5 pl-1.5 pr-3 text-left text-sm shadow-[0_3px_0_rgba(0,60,20,.25)] outline-none focus-visible:ring-3 focus-visible:ring-sky/50">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sun font-display text-xs font-bold text-ink">
              {(user.name || user.username).charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate">@{user.username}</span>
            <DotsThree weight="bold" className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuItem asChild>
              <Link href={`/@${encodeURIComponent(user.username)}`}>
                <UserCircle weight="bold" />
                your public page
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <GearSix weight="bold" />
                settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={logout}>
              <SignOut weight="bold" />
              log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
/** The signed-in frame: a sidebar on desktop, a top bar with a menu sheet on phones. */
export function AppShell({ active, children }: { active: AppSection; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-svh md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-svh border-r border-border bg-white md:block">
        <AppNav active={active} />
      </aside>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-white/85 px-4 py-2.5 backdrop-blur-md md:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          <IconButton label="New page" asChild>
            <Link href="/editor/new">
              <Plus weight="bold" />
            </Link>
          </IconButton>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <IconButton label="Open menu">
                <List weight="bold" />
              </IconButton>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <AppNav active={active} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
export function Loading() {
  return (
    <div
      role="status"
      className="grid place-items-center gap-3 py-20 text-sm text-muted-foreground"
    >
      <Critter
        kind="page"
        className="size-10 animate-[hop_1.2s_ease-in-out_infinite] motion-reduce:animate-none"
      />
      loading your next good read…
    </div>
  );
}
