"use client";
import { FlewOff } from "@/components/flew-off";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <FlewOff
      code="error"
      eyebrow="something went wrong"
      sub="we couldn't load this page. try again in a moment."
      action={
        <Button size="lg" onClick={reset}>
          try again
        </Button>
      }
    />
  );
}
