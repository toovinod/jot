"use client";
import { useState } from "react";
import Link from "next/link";
import { api, send } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Footer, Header } from "./shell";
import { Ground } from "./app/ground";
import { NotchedCard } from "./app/notched-card";
import { Critter, type CritterKind } from "./world/critters";
import { SkyScene } from "./world/sky";
import { Button } from "./ui/button";
import { ErrorMessage } from "./ui/fields";

type Stage = "ready" | "done" | "failed";

const missingToken = "this link is missing its token. use the complete link from your email.";

/** The confirm and unsubscribe links from subscriber emails: one button, then how it went. */
export function SubscriptionAction({ unsubscribe = false }: { unsubscribe?: boolean }) {
  const [busy, setBusy] = useState(false),
    [stage, setStage] = useState<Stage>("ready"),
    [author, setAuthor] = useState(""),
    [error, setError] = useState("");
  async function run() {
    const value = new URLSearchParams(location.search).get("token");
    setError("");
    if (!value) {
      setError(missingToken);
      setStage("failed");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ author?: unknown }>(
        `/subscriptions/${unsubscribe ? "unsubscribe" : "confirm"}`,
        { method: "POST", body: send({ token: value }) },
      );
      // Today the API answers {ok:true}; use the writer's name if it ever sends one.
      if (typeof result?.author === "string") setAuthor(result.author);
      setStage("done");
    } catch (e) {
      setError(friendlyError(e, { auto: false }).message);
      setStage("failed");
    } finally {
      setBusy(false);
    }
  }

  const copy: Record<Stage, { critter: CritterKind; title: string; body: string }> = unsubscribe
    ? {
        ready: {
          critter: "letter",
          title: "time for a little quiet?",
          body: "unsubscribe and this writer's new pages stop coming to your inbox.",
        },
        done: {
          critter: "page",
          title: "you're unsubscribed.",
          body: `no more emails from ${author || "this writer"}. you can subscribe again from their page any time.`,
        },
        failed: {
          critter: "letter",
          title: "that didn't go through.",
          body: "nothing changed yet. try again, or use the unsubscribe link in any of their emails.",
        },
      }
    : {
        ready: {
          critter: "letter",
          title: "one tap to confirm.",
          body: "confirm your email and new pages from this writer come straight to your inbox.",
        },
        done: {
          critter: "heart",
          title: "you're on the list.",
          body: "when this writer publishes with email on, the whole page arrives in your inbox. every email has a one-click unsubscribe.",
        },
        failed: {
          critter: "page",
          title: "that link didn't work.",
          body: "confirmation links last 24 hours. if this one ran out, subscribe again from the writer's page.",
        },
      };
  const { critter, title, body } = copy[stage];

  return (
    <>
      <Header tone="sky" />
      <main>
        <SkyScene
          variant="hero"
          className="min-h-[640px]"
          decor={
            <>
              <Critter
                kind="plane"
                className="absolute bottom-[14%] left-[10%] hidden size-11 -rotate-12 animate-[hop_3s_ease-in-out_infinite] motion-reduce:animate-none sm:block"
              />
              <Critter
                kind="book"
                blinkDelay={-2}
                className="absolute bottom-[9%] right-[12%] hidden size-10 animate-[hop_2.8s_ease-in-out_-1s_infinite] motion-reduce:animate-none sm:block"
              />
            </>
          }
        >
          <div className="relative mx-auto max-w-md px-4 pb-40 pt-32 md:pt-36">
            <NotchedCard className="px-6 pb-10 pt-8 text-center text-ink sm:px-10">
              <div aria-hidden="true" className="relative mx-auto mb-5 h-20 w-44">
                <Ground className="h-9" />
                <Critter
                  key={stage}
                  kind={critter}
                  className={cn(
                    "absolute bottom-5 left-1/2 size-12 -translate-x-1/2",
                    stage === "failed"
                      ? "rotate-12"
                      : "animate-[hop_2.4s_ease-in-out_infinite] motion-reduce:animate-none",
                  )}
                />
              </div>
              <p className="font-mono text-xs text-sky-deep">
                {unsubscribe ? "email from jot" : "your subscription"}
              </p>
              <h1 className="mt-2 font-display text-4xl font-medium leading-[1.02] tracking-[-0.05em]">
                {title}
              </h1>
              <p
                role={stage === "ready" ? undefined : "status"}
                className="mx-auto mt-3 max-w-xs text-sm leading-6 text-muted-foreground"
              >
                {body}
              </p>
              {error && (
                <div className="mt-5 text-left">
                  <ErrorMessage message={error} />
                </div>
              )}
              <div className="mt-7 flex flex-wrap justify-center gap-2.5">
                {stage === "done" ? (
                  <Button size="lg" variant="outline" asChild>
                    <Link href="/discover">browse discover</Link>
                  </Button>
                ) : (
                  <>
                    {(stage === "ready" || error !== missingToken) && (
                      <Button size="lg" disabled={busy} onClick={run}>
                        {busy
                          ? "one moment…"
                          : stage === "failed"
                            ? "try again"
                            : unsubscribe
                              ? "unsubscribe"
                              : "confirm subscription"}
                      </Button>
                    )}
                    {stage === "failed" && (
                      <Button size="lg" variant="outline" asChild>
                        <Link href="/discover">browse discover</Link>
                      </Button>
                    )}
                  </>
                )}
              </div>
            </NotchedCard>
          </div>
        </SkyScene>
      </main>
      <Footer />
    </>
  );
}
