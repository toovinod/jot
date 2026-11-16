"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import type { User } from "@jot/contracts";
import { passwordValidationError } from "@/lib/password";
import { safeReturnPath } from "@/lib/navigation";
import { api, send } from "@/lib/api";
import { useSession } from "./providers";
import { AuthLayout } from "./auth-layout";
import { Button } from "./ui/button";
import { Field, Input, ErrorMessage } from "./ui/fields";
export function AuthForm({ signup = false }: { signup?: boolean }) {
  const router = useRouter();
  const { setUser } = useSession();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [username, setUsername] = useState("");
  return (
    <AuthLayout
      eyebrow={signup ? "your words, your place" : "a little space to think"}
      title={signup ? "claim your /@name." : "welcome back."}
      sub={
        signup
          ? "an empty page, a link of your own. all that's missing is you."
          : "your drafts are right where you left them."
      }
    >
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
              safeReturnPath(next, location.origin) || (signup ? "/dashboard?new=1" : "/dashboard"),
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
            <Field label="Username" hint="Choose carefully; your username is permanent.">
              <Input
                name="username"
                required
                pattern="[a-z0-9_]{3,32}"
                minLength={3}
                maxLength={32}
                autoComplete="username"
                placeholder="alexmorgan"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
              />
              <span className="w-fit rounded-full bg-sky-soft px-2.5 py-1 font-mono text-xs text-sky-deep">
                /@{username || "username"}
              </span>
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
          <Link
            href="/auth/forgot"
            className="justify-self-end text-xs text-sky-deep underline-offset-4 hover:underline"
          >
            Forgot your password?
          </Link>
        )}
        <ErrorMessage message={error} />
        <Button disabled={busy} size="lg" className="mt-2 w-full" type="submit">
          {busy ? "one moment…" : signup ? "create your account" : "log in"}
          <ArrowRight weight="bold" />
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-muted-foreground">
        {signup ? "already have a home here?" : "new around here?"}{" "}
        <Link
          className="font-medium text-sky-deep underline-offset-4 hover:underline"
          href={signup ? "/login" : "/signup"}
        >
          {signup ? "log in" : "create an account"}
        </Link>
      </p>
    </AuthLayout>
  );
}
