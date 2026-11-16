"use client";
import { useState } from "react";
import Link from "next/link";
import { EnvelopeSimple, EnvelopeSimpleOpen } from "@phosphor-icons/react";
import { api, send } from "@/lib/api";
import { Page } from "./shell";
import { SkyScene } from "./world/sky";
import { Button } from "./ui/button";
import { ErrorMessage } from "./ui/fields";
export function SubscriptionAction({ unsubscribe = false }: { unsubscribe?: boolean }) {
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  const Icon = unsubscribe ? EnvelopeSimpleOpen : EnvelopeSimple;
  return (
    <Page>
      <SkyScene variant="panel" className="rounded-[28px] px-4 py-14 sm:py-20">
        <section className="relative mx-auto max-w-md rounded-[28px] border border-border bg-white px-6 py-14 text-center shadow-[0_4px_0_var(--border)]">
          <span className="mx-auto mb-7 grid size-16 place-items-center rounded-3xl bg-sky-soft text-sky-deep">
            <Icon weight="duotone" size={34} />
          </span>
          <h1 className="font-display text-4xl font-extrabold tracking-[-0.05em]">
            {done
              ? unsubscribe
                ? "a little less in your inbox."
                : "you're on the list."
              : unsubscribe
                ? "time for a little quiet?"
                : "a letter is waiting."}
          </h1>
          <p className="my-6 text-sm leading-7 text-muted-foreground">
            {done
              ? unsubscribe
                ? "Your subscription has been removed. You can always subscribe again."
                : "Your subscription is confirmed. New pages will arrive when the author publishes and sends a letter."
              : unsubscribe
                ? "Confirm below to stop receiving pages from this author."
                : "Confirm your email to start receiving this author's new pages."}
          </p>
          <ErrorMessage message={error} />
          {done ? (
            <Button asChild variant="outline">
              <Link href="/discover">back to discover</Link>
            </Button>
          ) : (
            <Button
              className="mt-3"
              disabled={busy}
              onClick={async () => {
                const token = new URLSearchParams(location.search).get("token");
                if (!token) {
                  setError(
                    "This link is missing its token. Please use the complete link from your email.",
                  );
                  return;
                }
                setBusy(true);
                setError("");
                try {
                  await api(`/subscriptions/${unsubscribe ? "unsubscribe" : "confirm"}`, {
                    method: "POST",
                    body: send({ token }),
                  });
                  setDone(true);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "One moment…" : unsubscribe ? "Confirm unsubscribe" : "Confirm subscription"}
            </Button>
          )}
        </section>
      </SkyScene>
    </Page>
  );
}
