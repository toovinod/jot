"use client";
import { useState } from "react";
import Link from "next/link";
import { passwordValidationError } from "@/lib/password";
import { api, send } from "@/lib/api";
import { Page } from "./shell";
import { Button } from "./ui/button";
import { Field, Input, ErrorMessage } from "./ui/fields";
export function AccountAction({ mode }: { mode: "verify" | "reset" | "forgot" }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  const titles = {
    verify: "A small introduction.",
    reset: "A fresh start.",
    forgot: "Find your way back.",
  };
  return (
    <Page>
      <section className="mx-auto max-w-sm py-12">
        <p className="mb-5 text-xs uppercase tracking-[.16em] text-primary">Your account</p>
        <h1 className="font-serif text-4xl tracking-tight">{titles[mode]}</h1>
        <p className="my-6 text-sm leading-7 text-muted-foreground">
          {done
            ? mode === "verify"
              ? "Your email is verified. You're ready to send stories to your subscribers."
              : mode === "reset"
                ? "Your password has been updated. Please log in with your new password."
                : "If an account matches that address, a password reset link is on its way. Check your inbox."
            : mode === "verify"
              ? "Confirm your email address to send publication emails to your subscribers."
              : mode === "reset"
                ? "Choose a new password for your account. Previous sessions will be signed out."
                : "Enter your account email and we'll send a link to reset your password, if email is configured."}
        </p>
        {done ? (
          <Button variant="outline" asChild>
            <Link href={mode === "verify" ? "/settings" : "/login"}>
              {mode === "verify" ? "Back to settings" : "Back to login"}
            </Link>
          </Button>
        ) : (
          <form
            className="grid gap-5"
            onSubmit={async (e) => {
              e.preventDefault();
              const token = new URLSearchParams(location.search).get("token");
              if (mode !== "forgot" && !token) {
                setError("This link is missing its token. Use the complete link in your email.");
                return;
              }
              setBusy(true);
              setError("");
              try {
                if (mode === "reset") {
                  const passwordError = passwordValidationError(password);
                  if (passwordError) throw new Error(passwordError);
                }
                await api(
                  `/auth/${mode === "verify" ? "verification/confirm" : mode === "reset" ? "password/reset" : "password/request"}`,
                  {
                    method: "POST",
                    body: send(
                      mode === "verify"
                        ? { token }
                        : mode === "reset"
                          ? { token, password }
                          : { email },
                    ),
                  },
                );
                setDone(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {mode === "forgot" && (
              <Field label="Email address">
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
            )}
            {mode === "reset" && (
              <Field label="New password" hint="Use a long, unique password.">
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
            )}
            <ErrorMessage message={error} />
            <Button disabled={busy} type="submit">
              {busy
                ? "One moment…"
                : mode === "verify"
                  ? "Verify email"
                  : mode === "reset"
                    ? "Set new password"
                    : "Send reset link"}
            </Button>
          </form>
        )}
      </section>
    </Page>
  );
}
