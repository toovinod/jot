"use client";
import { Page } from "@/components/shell";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <Page>
      <div className="py-24 text-center">
        <h1 className="font-serif text-4xl">A small interruption.</h1>
        <p className="my-6 text-sm text-muted-foreground">
          We couldn't load this page. Please try again in a moment.
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </Page>
  );
}
