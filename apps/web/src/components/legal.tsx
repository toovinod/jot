import type { ReactNode } from "react";
import { Footer, Header } from "@/components/shell";
import { NotchedCard, PageBody, SceneHeader } from "@/components/app";

export type LegalSection = { id: string; title: string; body: ReactNode };

/** Long-form legal pages: a sky band, a contents list beside the text on wide screens. */
export function Legal({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <>
      <Header />
      <main>
        <SceneHeader title={`${title}.`} subtitle={`last updated ${updated}`} critter="book" />
        <PageBody>
          <div className="relative -mt-14 grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
            <NotchedCard className="hidden p-5 lg:sticky lg:top-24 lg:block">
              <nav aria-label="On this page">
                <p className="font-mono text-xs text-sky-deep">on this page</p>
                <ol className="mt-3 grid gap-1 text-sm">
                  {sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className="block rounded-lg px-2 py-1 text-muted-foreground transition-colors hover:bg-sky-soft hover:text-foreground"
                      >
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </NotchedCard>
            <NotchedCard className="px-6 py-9 md:px-12 md:py-12">
              <article className="max-w-[68ch] leading-7 text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_p+p]:mt-3 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:space-y-2">
                <div className="text-lg leading-8 text-foreground">{intro}</div>
                {sections.map((section) => (
                  <section
                    key={section.id}
                    id={section.id}
                    className="mt-10 scroll-mt-24 border-t border-border pt-8"
                  >
                    <h2 className="mb-3 font-display text-2xl font-semibold tracking-[-0.035em] text-foreground">
                      {section.title}
                    </h2>
                    {section.body}
                  </section>
                ))}
              </article>
            </NotchedCard>
          </div>
        </PageBody>
      </main>
      <Footer />
    </>
  );
}
