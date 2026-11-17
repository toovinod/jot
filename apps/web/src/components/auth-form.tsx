"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle, Circle, WarningCircle } from "@phosphor-icons/react";
import type { User } from "@jot/contracts";
import { passwordValidationError } from "@/lib/password";
import { safeReturnPath } from "@/lib/navigation";
import { api, send } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useSession } from "./providers";
import { AuthLayout } from "./auth-layout";
import { Button } from "./ui/button";
import { Field, Input, ErrorMessage } from "./ui/fields";

export const authLink = "font-medium text-sky-deep underline-offset-4 hover:underline";

/** The server's password rules (10 to 72 bytes), checked live as a new password is typed. */
export function PasswordRules({ password }: { password: string }) {
  const bytes = new TextEncoder().encode(password).length;
  const rules = [
    { label: "10 characters or more", state: !bytes ? "unmet" : bytes >= 10 ? "met" : "unmet" },
    {
      label: "72 characters at most, fewer with accents or symbols",
      state: !bytes ? "unmet" : bytes <= 72 ? "met" : "broken",
    },
  ] as const;
  return (
    <ul aria-label="Password rules" className="grid gap-1.5 text-xs font-normal">
      {rules.map((rule) => {
        const Icon =
          rule.state === "met" ? CheckCircle : rule.state === "broken" ? WarningCircle : Circle;
        return (
          <li
            key={rule.label}
            className={cn(
              "flex items-center gap-1.5",
              rule.state === "met"
                ? "text-grass-3"
                : rule.state === "broken"
                  ? "text-destructive"
                  : "text-muted-foreground",
            )}
          >
            <Icon weight={rule.state === "unmet" ? "bold" : "fill"} className="size-3.5 shrink-0" />
            {rule.label}
            <span className="sr-only">{rule.state === "met" ? " (done)" : " (not yet)"}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function AuthForm({ signup = false }: { signup?: boolean }) {
  const router = useRouter();
  const { setUser } = useSession();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState("");
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
            setError(friendlyError(e, { auto: false }).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {signup && (
          <>
            <Field label="your name" hint="shown on your pages. you can change it later.">
              <Input
                name="name"
                autoComplete="name"
                required
                maxLength={100}
                placeholder="Harper"
              />
            </Field>
            <Field
              label="username"
              hint="3 to 32 lowercase letters, numbers or underscores. it can't be changed later."
            >
              <Input
                name="username"
                required
                pattern="[a-z0-9_]{3,32}"
                minLength={3}
                maxLength={32}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="harper"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
              />
              <span className="w-fit rounded-full bg-sky-soft px-2.5 py-1 font-mono text-xs text-sky-deep">
                /@{username || "username"}
              </span>
            </Field>
          </>
        )}
        <Field label="email address">
          <Input
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </Field>
        <div className="grid gap-2">
          <Field label="password">
            <Input
              type="password"
              name="password"
              minLength={1}
              maxLength={72}
              required
              autoComplete={signup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {signup ? (
            <PasswordRules password={password} />
          ) : (
            <Link href="/auth/forgot" className={cn(authLink, "justify-self-end text-xs")}>
              forgot your password?
            </Link>
          )}
        </div>
        <ErrorMessage message={error} />
        <Button disabled={busy} size="lg" className="mt-1 w-full" type="submit">
          {busy ? "one moment…" : signup ? "create your account" : "log in"}
          <ArrowRight weight="bold" />
        </Button>
        {signup && (
          <p className="text-center text-xs leading-5 text-muted-foreground">
            by creating an account you agree to the{" "}
            <Link href="/terms" className={authLink}>
              terms
            </Link>{" "}
            and the{" "}
            <Link href="/privacy" className={authLink}>
              privacy notes
            </Link>
            .
          </p>
        )}
      </form>
      <p className="mt-7 border-t border-border pt-6 text-center text-sm text-muted-foreground">
        {signup ? "already have an account?" : "new around here?"}{" "}
        <Link className={authLink} href={signup ? "/login" : "/signup"}>
          {signup ? "log in" : "create an account"}
        </Link>
      </p>
    </AuthLayout>
  );
}
