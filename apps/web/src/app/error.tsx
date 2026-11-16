"use client";
import { FlewOff } from "@/components/flew-off";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <FlewOff
      eyebrow="something went wrong"
      sub="We couldn't load this page. Please try again in a moment."
      action={
        <Button variant="sky" onClick={reset}>
          try again
        </Button>
      }
    />
  );
}
