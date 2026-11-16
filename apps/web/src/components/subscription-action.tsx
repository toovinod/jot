"use client";
import { useState } from "react";
import Link from "next/link";
import { MailCheck, MailMinus } from "lucide-react";
import { api, send } from "@/lib/api";
import { Page } from "./shell";
import { Button } from "./ui/button";
import { ErrorMessage } from "./ui/fields";
export function SubscriptionAction({ unsubscribe = false }: { unsubscribe?: boolean }) {
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  const Icon = unsubscribe ? MailMinus : MailCheck;
  return (
    <Page>
      <section className="mx-auto max-w-md py-16 text-center">
        <Icon className="mx-auto mb-7 text-primary" size={35} strokeWidth={1} />
        <h1 className="font-serif text-4xl tracking-tight">
          {done
            ? unsubscribe
              ? "A little less in your inbox."
              : "You're on the list."
            : unsubscribe
              ? "Time for a little quiet?"
              : "A letter is waiting."}
        </h1>
        <p className="my-6 text-sm leading-7 text-muted-foreground">
          {done
            ? unsubscribe
              ? "Your subscription has been removed. You can always subscribe again."
              : "Your subscription is confirmed. New stories will arrive when the author publishes and sends a letter."
            : unsubscribe
              ? "Confirm below to stop receiving stories from this author."
              : "Confirm your email to start receiving this author's new stories."}
        </p>
        <ErrorMessage message={error} />
        {done ? (
          <Button asChild variant="outline">
            <Link href="/">Back to the reading room</Link>
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
    </Page>
  );
}
