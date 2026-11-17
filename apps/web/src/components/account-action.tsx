"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { passwordValidationError } from "@/lib/password";
import { api, ApiError, send } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { AuthLayout } from "./auth-layout";
import { PasswordRules, authLink } from "./auth-form";
import { Button } from "./ui/button";
import { Field, Input, ErrorMessage } from "./ui/fields";

const missingToken = "this link is missing its token. use the complete link from your email.";

/** Asking for a password reset link, and choosing a new password from one. */
export function AccountAction({ mode }: { mode: "reset" | "forgot" }) {
  const reset = mode === "reset";
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [stale, setStale] = useState(false),
    [error, setError] = useState("");
  return (
    <AuthLayout
      eyebrow="your account"
      title={reset ? "a fresh start." : "find your way back."}
      sub={
        done
          ? reset
            ? "your password is updated and every session was signed out. log in with the new one."
            : "if an account matches that address, a reset link is on its way. it works for one hour."
          : reset
            ? "choose a new password. every device signed in to your account will be signed out."
            : "enter your account email and we'll send a link to choose a new password, if this copy of jot has email set up."
      }
    >
      {done ? (
        <Button size="lg" className="w-full" asChild>
          <Link href="/login">
            back to log in
            <ArrowRight weight="bold" />
          </Link>
        </Button>
      ) : (
        <form
          className="grid gap-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const token = new URLSearchParams(location.search).get("token");
            if (reset && !token) {
              setStale(true);
              setError(missingToken);
              return;
            }
            setBusy(true);
            setError("");
            try {
              if (reset) {
                const passwordError = passwordValidationError(password);
                if (passwordError) throw new Error(passwordError);
              }
              await api(`/auth/${reset ? "password/reset" : "password/request"}`, {
                method: "POST",
                body: send(reset ? { token, password } : { email }),
              });
              setDone(true);
            } catch (e) {
              if (e instanceof ApiError && e.code === "invalid_token") setStale(true);
              setError(friendlyError(e, { auto: false }).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {reset ? (
            <div className="grid gap-2">
              <Field label="new password">
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={1}
                  maxLength={72}
                  required
                />
              </Field>
              <PasswordRules password={password} />
            </div>
          ) : (
            <Field label="email address">
              <Input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
          )}
          <ErrorMessage message={error} />
          {stale && (
            <p className="text-sm text-muted-foreground">
              reset links work once, for one hour.{" "}
              <Link href="/auth/forgot" className={authLink}>
                send a new link
              </Link>
            </p>
          )}
          <Button disabled={busy} size="lg" className="mt-1 w-full" type="submit">
            {busy ? "one moment…" : reset ? "set new password" : "send reset link"}
            <ArrowRight weight="bold" />
          </Button>
        </form>
      )}
      {!done && (
        <p className="mt-7 border-t border-border pt-6 text-center text-sm text-muted-foreground">
          remembered it?{" "}
          <Link href="/login" className={authLink}>
            log in
          </Link>
          {" or "}
          <Link href="/signup" className={authLink}>
            create an account
          </Link>
        </p>
      )}
    </AuthLayout>
  );
}
