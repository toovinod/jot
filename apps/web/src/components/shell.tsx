"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Moon,
  Sun,
  ArrowUpRight,
  PenLine,
  Library,
  Bookmark,
  Settings,
  Compass,
  LogOut,
} from "lucide-react";
import { Fragment, useEffect, type ReactNode } from "react";
import { useSession } from "./providers";
import { Button } from "./ui/button";
import { ErrorMessage } from "./ui/fields";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 text-xl font-black tracking-tight">
      <span className="flex size-7 items-center justify-center rounded bg-foreground text-sm text-background">
        j
      </span>
      jot<span className="text-primary">.</span>
    </Link>
  );
}
export function Header() {
  const { user, loading } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-5 md:px-10">
        <Brand />
        <nav className="flex items-center gap-2 md:gap-5">
          <Link href="/" className="hidden text-sm text-muted-foreground sm:block">
            Discover
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle color theme"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <Sun className="hidden dark:block" />
            <Moon className="dark:hidden" />
          </Button>
          {!loading &&
            (user ? (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/dashboard">Your library</Link>
                </Button>
                <Button asChild>
                  <Link href="/dashboard?new=1">
                    <PenLine />
                    Write
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Link className="text-sm" href="/login">
                  Log in
                </Link>
                <Button asChild>
                  <Link href="/signup">
                    Start writing <ArrowUpRight />
                  </Link>
                </Button>
              </>
            ))}
        </nav>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="mx-auto flex max-w-7xl flex-wrap justify-between gap-4 px-6 py-12 text-xs text-muted-foreground">
      <Brand />
      <p>A quiet place for words that matter.</p>
      <span>Open source. Yours to make.</span>
    </footer>
  );
}
export function Page({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto min-h-[70vh] max-w-7xl px-5 py-12 md:px-10">{children}</main>
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
export function LibraryNav({ tab }: { tab: string }) {
  const { setUser } = useSession();
  const router = useRouter();
  return (
    <aside className="flex shrink-0 flex-wrap gap-2 md:w-48 md:flex-col">
      <p className="mb-4 hidden px-3 text-[11px] uppercase tracking-[.18em] text-muted-foreground md:block">
        Your workspace
      </p>
      {[
        { name: "Library", value: "mine", icon: Library, href: "/dashboard" },
        { name: "Bookmarks", value: "bookmarks", icon: Bookmark, href: "/dashboard?tab=bookmarks" },
        { name: "Settings", value: "settings", icon: Settings, href: "/settings" },
        { name: "Discover", value: "discover", icon: Compass, href: "/" },
      ].map((item) => (
        <Link
          key={item.value}
          href={item.href}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-muted-foreground hover:bg-muted",
            tab === item.value && "bg-muted font-medium text-foreground",
          )}
        >
          <item.icon size={17} />
          {item.name}
        </Link>
      ))}
      <button
        className="mt-4 flex items-center gap-3 px-3 py-3 text-sm text-muted-foreground"
        onClick={async () => {
          try {
            await api("/auth/logout", { method: "POST" });
            setUser(null);
            router.push("/");
          } catch {
            alert("Could not log out. Please try again.");
          }
        }}
      >
        <LogOut size={17} />
        Log out
      </button>
    </aside>
  );
}
export function Loading() {
  return (
    <p role="status" className="py-20 text-center text-sm text-muted-foreground">
      Loading your next good read…
    </p>
  );
}
