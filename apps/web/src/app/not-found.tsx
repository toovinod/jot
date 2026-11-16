import Link from "next/link";
import { Page } from "@/components/shell";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <Page>
      <div className="py-24 text-center">
        <p className="mb-5 text-xs uppercase tracking-[.2em] text-primary">A page out of place</p>
        <h1 className="font-serif text-5xl">Nothing to read here.</h1>
        <p className="my-6 text-sm text-muted-foreground">
          This story may have moved, or its author may be taking a little time.
        </p>
        <Button asChild variant="outline">
          <Link href="/">Back to the reading room</Link>
        </Button>
      </div>
    </Page>
  );
}
