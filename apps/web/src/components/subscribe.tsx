"use client";
import { useState } from "react";
import { ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { api, send } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { useSession } from "./providers";
import { NotchedCard } from "./app/notched-card";
import { Ground } from "./app/ground";
import { Critter } from "./world/critters";
import { Button } from "./ui/button";
import { Input, ErrorMessage } from "./ui/fields";
export function Subscribe({ username, name }: { username: string; name: string }) {
  const { config, configError } = useSession();
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  return (
    <NotchedCard
      stripe="sky"
      id="subscribe"
      className="grid scroll-mt-24 gap-6 p-6 pb-10 sm:grid-cols-[112px_minmax(0,1fr)] sm:p-8 sm:pb-11"
    >
      <div
        aria-hidden="true"
        className="notched relative h-24 w-28 overflow-hidden bg-sky-soft sm:h-full sm:min-h-28"
      >
        <Ground className="h-10" />
        <Critter
          kind="letter"
          className="absolute bottom-6 left-1/2 size-11 -translate-x-1/2 animate-[hop_2.6s_ease-in-out_infinite] motion-reduce:animate-none"
        />
      </div>
      <section aria-labelledby="subscribe-title" className="min-w-0">
        <h2
          id="subscribe-title"
          className="font-display text-2xl font-semibold tracking-[-0.035em]"
        >
          get new pages by email.
        </h2>
        <p className="mb-5 mt-2 text-sm leading-6 text-muted-foreground">
          new pages from {name || username}, straight to your inbox. only when there is something to
          share.
        </p>
        {!config.emailEnabled ? (
          <p className="text-xs text-muted-foreground">
            {configError || "email subscriptions aren't set up on this site yet."}
          </p>
        ) : done ? (
          <p role="status" className="flex items-start gap-2 text-sm font-medium text-grass-3">
            <CheckCircle weight="fill" className="mt-0.5 size-4 shrink-0" />
            check your inbox to confirm. if you&apos;re already subscribed, you&apos;re all set.
          </p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api(`/authors/${encodeURIComponent(username)}/subscribe`, {
                  method: "POST",
                  body: send({ email }),
                });
                setDone(true);
              } catch (e) {
                setError(friendlyError(e, { auto: false }).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="sr-only" htmlFor="subscribe-email">
              Email address
            </label>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Input
                id="subscribe-email"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button disabled={busy} type="submit" className="h-11">
                {busy ? "sending…" : "subscribe"}
                <ArrowRight weight="bold" />
              </Button>
            </div>
            <div className="mt-3 empty:hidden">
              <ErrorMessage message={error} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              you&apos;ll confirm by email. unsubscribe any time.
            </p>
          </form>
        )}
      </section>
    </NotchedCard>
  );
}
