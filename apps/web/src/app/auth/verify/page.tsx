"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { api, ApiError, send } from "@/lib/api";
import { requestVerification } from "@/lib/account-api";
import { useSession } from "@/components/providers";
import { AuthLayout } from "@/components/auth-layout";
import { authLink } from "@/components/auth-form";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/fields";

export default function Verify() {
  const { user } = useSession();
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [expired, setExpired] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState("");
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout
      eyebrow="your account"
      title={done ? "you're verified." : expired ? "this link ran out." : "a small introduction."}
      sub={
        done
          ? "your email is confirmed, so your pages can go out to your subscribers."
          : sent
            ? "a new link is on its way. check your inbox; it works for one hour."
            : expired
              ? "this link has expired, was already used, or is incomplete."
              : "confirm your email address so your pages can go out to your subscribers."
      }
    >
      {done ? (
        <Button size="lg" className="w-full" asChild>
          <Link href="/settings">
            back to settings
            <ArrowRight weight="bold" />
          </Link>
        </Button>
      ) : expired ? (
        <div className="grid gap-5">
          <ErrorMessage message={error} />
          {sent ? null : user ? (
            <Button
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await requestVerification();
                  setSent(true);
                })
              }
            >
              {busy ? "one moment…" : "send a new link"}
            </Button>
          ) : (
            <Button size="lg" className="w-full" asChild>
              <Link href="/login?next=%2Fsettings">log in to send a new link</Link>
            </Button>
          )}
        </div>
      ) : (
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            const token = new URLSearchParams(location.search).get("token");
            if (!token) {
              setExpired(true);
              return;
            }
            void run(async () => {
              try {
                await api("/auth/verification/confirm", {
                  method: "POST",
                  body: send({ token }),
                });
                setDone(true);
              } catch (e) {
                if (e instanceof ApiError && e.code === "invalid_token") setExpired(true);
                else throw e;
              }
            });
          }}
        >
          <ErrorMessage message={error} />
          <Button disabled={busy} size="lg" className="w-full" type="submit">
            {busy ? "one moment…" : "verify email"}
            <ArrowRight weight="bold" />
          </Button>
        </form>
      )}
      {!done && (
        <p className="mt-7 border-t border-border pt-6 text-center text-sm text-muted-foreground">
          need another link? send one any time from{" "}
          <Link href="/settings" className={authLink}>
            settings
          </Link>
          .
        </p>
      )}
    </AuthLayout>
  );
}
