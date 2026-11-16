"use client";
import { useState } from "react";
import { Mail, ArrowRight } from "lucide-react";
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
    <section className="rounded-xl border border-border bg-muted/40 p-6 sm:p-9">
      <Mail className="mb-5 text-primary" size={23} strokeWidth={1.5} />
      <h2 className="font-serif text-3xl">A letter, now and then.</h2>
      <p className="mb-6 mt-3 text-sm leading-6 text-muted-foreground">
        New stories from {name || username}, straight to your inbox. Only when they have something
        to share.
      </p>
      {!config.emailEnabled ? (
        <p className="text-xs text-muted-foreground">
          {configError || "Email subscriptions are not configured for this publication yet."}
        </p>
      ) : done ? (
        <p role="status" className="text-sm text-primary">
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
              <ArrowRight />
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
