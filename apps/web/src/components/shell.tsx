"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookmarkSimple,
  Compass,
  DotsThree,
  GearSix,
  GithubLogo,
  List,
  PencilSimpleLine,
  Plus,
  SignOut,
  UserCircle,
} from "@phosphor-icons/react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useSession } from "./providers";
import { Brand, JotMark } from "./brand/logo";
export { Brand };
import { Button } from "./ui/button";
import { ErrorMessage } from "./ui/fields";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./ui/sheet";
import { Hills } from "./world/sky";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { GITHUB_URL, docLinks } from "@/lib/site";
export function Header({ tone = "plain" }: { tone?: "sky" | "plain" }) {
  const { user, loading } = useSession();
  const sky = tone === "sky";
  const link = cn(
    "hidden rounded-full px-3 py-1.5 text-sm font-medium transition-colors md:block",
    sky
      ? "text-white/90 hover:bg-white/15 hover:text-white"
      : "text-muted-foreground hover:bg-sky-soft hover:text-foreground",
  );
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
        <Brand animate className={sky ? "text-white [&_svg]:text-ink" : undefined} />
        <nav className="flex items-center gap-1">
          <Link href="/discover" className={link}>
            discover
          </Link>
          {!user && (
            <>
              <Link href="/#how" className={link}>
                how it works
              </Link>
              <Link href="/#self-host" className={link}>
                self-host
              </Link>
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
                  <Link href="/dashboard">dashboard</Link>
                </Button>
                <Button variant="default" size="sm" asChild className="ml-2 h-9">
                  <Link href="/dashboard?new=1">
                    <Plus weight="bold" />
                    new page
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" asChild className="h-9">
                  <Link href="/login">log in</Link>
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  asChild
                  className="ml-2 hidden h-9 sm:inline-flex"
                >
                  <Link href="/signup">start writing</Link>
                </Button>
              </>
            ))}
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
      { label: "start writing", href: "/signup" },
      { label: "log in", href: "/login" },
    ],
  },
  {
    title: "learn",
    links: [
      { label: "how it works", href: "/#how" },
      { label: "self-hosting", href: docLinks.selfHost },
      { label: "API", href: docLinks.api },
    ],
  },
  {
    title: "open source",
    links: [
      { label: "github", href: GITHUB_URL },
      { label: "MIT license", href: docLinks.license },
      { label: "contributing", href: docLinks.contributing },
      { label: "security", href: docLinks.security },
    ],
  },
];
export function Footer({ samples = false }: { samples?: boolean }) {
  return (
    <footer className="bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-10 pt-16 md:grid-cols-[1.4fr_repeat(3,1fr)] md:px-8">
        <div className="space-y-4">
          <Brand />
          <p className="max-w-xs text-sm leading-6 text-muted-foreground">
            a home for your words at /@you.
          </p>
        </div>
        {footerColumns.map((column) => (
          <div key={column.title}>
            <p className="mb-4 font-mono text-xs text-muted-foreground">{column.title}</p>
            <ul className="space-y-2.5">
              {column.links.map((item) => (
                <li key={item.label}>
                  {item.href.startsWith("http") ? (
                    <a href={item.href} className="text-[15px] hover:text-sky-deep">
                      {item.label}
                    </a>
                  ) : (
                    <Link href={item.href} className="text-[15px] hover:text-sky-deep">
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mx-auto max-w-7xl px-4 pb-10 font-mono text-xs text-muted-foreground md:px-8">
        made with jot.{samples && " names and pages shown on this site are samples."}
      </p>
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
        <ErrorMessage message={authError} />
        <Button onClick={() => location.reload()}>Retry connection</Button>
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
  { name: "Your writing", value: "mine", icon: PencilSimpleLine, href: "/dashboard" },
  { name: "Bookmarks", value: "bookmarks", icon: BookmarkSimple, href: "/dashboard?tab=bookmarks" },
  { name: "Discover", value: "discover", icon: Compass, href: "/discover" },
  { name: "Settings", value: "settings", icon: GearSix, href: "/settings" },
] as const;
type AppSection = (typeof appNav)[number]["value"];
function AppNav({ active, onNavigate }: { active: AppSection; onNavigate?: () => void }) {
  const { user, setUser } = useSession();
  const router = useRouter();
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      router.push("/");
    } catch {
      alert("Could not log out. Please try again.");
    }
  }
  return (
    <div className="relative flex h-full flex-col gap-1 overflow-hidden px-3 pb-28 pt-5">
      <Brand className="mb-6 px-2" />
      {appNav.map((item) => {
        const on = item.value === active;
        return (
          <Link
            key={item.value}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              on
                ? "bg-sky-soft font-medium text-foreground"
                : "text-muted-foreground hover:bg-background hover:text-foreground",
            )}
          >
            <item.icon
              weight={on ? "fill" : "duotone"}
              className={cn("size-5", on && "text-sky-deep")}
            />
            {item.name}
          </Link>
        );
      })}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-28">
        <Hills layers={2} className="h-full" />
      </div>
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger className="absolute inset-x-3 bottom-4 z-10 flex cursor-pointer items-center gap-2.5 rounded-xl bg-white px-3 py-2 text-left text-sm shadow-[0_3px_0_rgba(0,60,20,.25)] outline-none focus-visible:ring-3 focus-visible:ring-sky/50">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sun font-display text-xs font-bold">
              {(user.name || user.username).charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate">@{user.username}</span>
            <DotsThree weight="bold" className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-52 rounded-xl">
            <DropdownMenuItem asChild>
              <Link href={`/@${encodeURIComponent(user.username)}`}>
                <UserCircle weight="duotone" />
                your public page
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={logout}>
              <SignOut weight="duotone" />
              log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
export function AppShell({ active, children }: { active: AppSection; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-svh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-svh border-r border-border bg-white md:block">
        <AppNav active={active} />
      </aside>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-white/85 px-4 py-3 backdrop-blur-md md:hidden">
        <Brand />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Open menu">
              <List weight="bold" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <AppNav active={active} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
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
      <JotMark className="size-9 animate-bounce text-ink motion-reduce:animate-none" />
      loading your next good read…
    </div>
  );
}
