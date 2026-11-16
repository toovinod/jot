"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { User } from "@jot/contracts";
import { passwordValidationError } from "@/lib/password";
import { safeReturnPath } from "@/lib/navigation";
import { api, send } from "@/lib/api";
import { useSession } from "./providers";
import { Brand } from "./shell";
import { Button } from "./ui/button";
import { Field, Input, ErrorMessage } from "./ui/fields";
export function AuthForm({ signup = false }: { signup?: boolean }) {
  const router = useRouter();
  const { setUser } = useSession();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="flex flex-col p-7 sm:p-14">
        <Brand />
        <div className="mx-auto my-auto w-full max-w-sm py-20">
          <p className="mb-4 text-xs uppercase tracking-[.16em] text-primary">
            {signup ? "Your words, your place" : "A little space to think"}
          </p>
          <h1 className="font-serif text-5xl tracking-tight">
            {signup ? "Make yourself at home." : "Welcome back."}
          </h1>
          <p className="mb-9 mt-4 text-sm leading-6 text-muted-foreground">
            {signup
              ? "An empty page. A fresh perspective. All that's missing is you."
              : "Your drafts are right where you left them."}
          </p>
          <form
            className="grid gap-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              const form = new FormData(e.currentTarget);
              try {
                const body = Object.fromEntries(form.entries());
                const passwordError = passwordValidationError(String(body.password || ""), signup);
                if (passwordError) throw new Error(passwordError);
                const user = await api<User>(`/auth/${signup ? "signup" : "login"}`, {
                  method: "POST",
                  body: send(body),
                });
                setUser(user);
                const next = new URLSearchParams(location.search).get("next");
                router.replace(
                  safeReturnPath(next, location.origin) ||
                    (signup ? "/dashboard?new=1" : "/dashboard"),
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {signup && (
              <>
                <Field label="Your name">
                  <Input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={100}
                    placeholder="Alex Morgan"
                  />
                </Field>
                <Field
                  label="Username"
                  hint="Your home will be at /@username. Choose carefully; this is permanent."
                >
                  <Input
                    name="username"
                    required
                    pattern="[a-z0-9_]{3,32}"
                    minLength={3}
                    maxLength={32}
                    autoComplete="username"
                    placeholder="alexmorgan"
                  />
                </Field>
              </>
            )}
            <Field label="Email address">
              <Input
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Password" hint={signup ? "Use a long, unique password." : undefined}>
              <Input
                type="password"
                name="password"
                minLength={1}
                maxLength={72}
                required
                autoComplete={signup ? "new-password" : "current-password"}
              />
            </Field>
            {!signup && (
              <Link href="/auth/forgot" className="justify-self-end text-xs text-primary underline">
                Forgot your password?
              </Link>
            )}
            <ErrorMessage message={error} />
            <Button disabled={busy} className="mt-2 w-full" type="submit">
              {busy ? "One moment…" : signup ? "Create your account" : "Log in"}
              <ArrowRight />
            </Button>
          </form>
          <p className="mt-7 text-center text-sm text-muted-foreground">
            {signup ? "Already have a home here?" : "New around here?"}{" "}
            <Link
              className="text-primary underline-offset-4 hover:underline"
              href={signup ? "/login" : "/signup"}
            >
              {signup ? "Log in" : "Create an account"}
            </Link>
          </p>
        </div>
        <p className="text-xs text-muted-foreground">A quiet corner of the internet.</p>
      </section>
      <aside className="hidden flex-col justify-between bg-muted p-16 lg:flex">
        <p className="text-xs uppercase tracking-[.2em] text-muted-foreground">
          Less noise. More meaning.
        </p>
        <div>
          <div className="mb-10 h-px w-16 bg-primary" />
          <p className="font-serif text-6xl leading-[1.12] tracking-tight">
            Some thoughts
            <br />
            need more than
            <br />
            <span className="italic text-primary">a fleeting moment.</span>
          </p>
          <p className="mt-8 max-w-xs text-sm leading-7 text-muted-foreground">
            Paste something you've been working on. Give it a shape. Share it when you're ready.
          </p>
        </div>
        <p className="font-serif text-2xl italic text-muted-foreground">
          Start anywhere. Make it yours.
        </p>
      </aside>
    </main>
  );
}
