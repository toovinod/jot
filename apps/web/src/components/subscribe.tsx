"use client";
import { useState } from "react";
import { ArrowRight, EnvelopeSimple } from "@phosphor-icons/react";
import { api, send } from "@/lib/api";
import { useSession } from "./providers";
import { Button } from "./ui/button";
import { Input, ErrorMessage } from "./ui/fields";
export function Subscribe({ username, name }: { username: string; name: string }) {
  const { config, configError } = useSession();
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-border bg-white p-6 shadow-[0_4px_0_var(--border)] sm:p-9">
      <span className="mb-5 grid size-12 place-items-center rounded-2xl bg-sky-soft text-sky-deep">
        <EnvelopeSimple weight="duotone" size={26} />
      </span>
      <h2 className="font-display text-3xl font-extrabold tracking-[-0.05em]">
        a letter,{" "}
        <em className="font-serif font-normal italic tracking-[-0.03em] [font-variation-settings:'SOFT'_100]">
          now and then.
        </em>
      </h2>
      <p className="mb-6 mt-3 text-sm leading-6 text-muted-foreground">
        New pages from {name || username}, straight to your inbox. Only when there is something to
        share.
      </p>
      {!config.emailEnabled ? (
        <p className="text-xs text-muted-foreground">
          {configError || "Email subscriptions are not configured for this publication yet."}
        </p>
      ) : done ? (
        <p role="status" className="text-sm font-medium text-[#22803a]">
          Check your inbox to confirm. If you're already subscribed, you're all set.
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
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="sr-only" htmlFor="subscribe-email">
            Email address
          </label>
          <div className="flex gap-2">
            <Input
              id="subscribe-email"
              type="email"
              required
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button disabled={busy} type="submit">
              {busy ? "Sending…" : "Subscribe"}
              <ArrowRight weight="bold" />
            </Button>
          </div>
          <div className="mt-3">
            <ErrorMessage message={error} />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Confirm by email. Unsubscribe any time.
          </p>
        </form>
      )}
    </section>
  );
}
