import type { Metadata } from "next";
import Link from "next/link";
import { Legal } from "@/components/legal";
import { docLinks } from "@/lib/site";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <Legal
      title="terms"
      updated="November 18, 2026"
      intro={<p>short and plain. by using jot you agree to the following.</p>}
      sections={[
        {
          id: "yours",
          title: "your writing stays yours",
          body: (
            <p>
              you own what you write. publishing a page lets jot store it, show it to readers and,
              when you choose, email the full page to your subscribers. nothing more. you can
              download everything you wrote from settings at any time.
            </p>
          ),
        },
        {
          id: "on-you",
          title: "what you publish is on you",
          body: (
            <p>
              don&apos;t publish anything illegal, anything that harasses people, or anything that
              isn&apos;t yours to share. pages and comments that break this can be removed, and
              accounts that keep doing it can be closed.
            </p>
          ),
        },
        {
          id: "comments",
          title: "comments on your pages",
          body: (
            <p>
              you can turn comments off on any page, delete any comment on your pages, and block a
              reader from commenting on all of them. blocking hides their comments on your pages
              until you unblock them.
            </p>
          ),
        },
        {
          id: "email",
          title: "email to subscribers",
          body: (
            <p>
              jot only sends your pages to readers who confirmed their subscription, and every email
              has an unsubscribe link. use your subscriber list for your pages and nothing else.
            </p>
          ),
        },
        {
          id: "domains",
          title: "custom domains",
          body: (
            <p>
              only add a domain you own or are allowed to use. the TXT record proves it; remove the
              domain in settings if that changes.
            </p>
          ),
        },
        {
          id: "unlisted",
          title: "unlisted is not private",
          body: (
            <p>
              an unlisted page stays out of discover, but anyone with its link can read it. keep
              anything truly private in a draft.
            </p>
          ),
        },
        {
          id: "leaving",
          title: "leaving",
          body: (
            <p>
              you can delete your account from settings whenever you like. it removes your pages and
              data as described in the <Link href="/privacy">privacy notes</Link>.
            </p>
          ),
        },
        {
          id: "as-is",
          title: "as is",
          body: (
            <p>
              jot is open source under the <a href={docLinks.license}>MIT license</a>. it comes
              without warranty. keep your own copy of anything you can&apos;t afford to lose.
            </p>
          ),
        },
        {
          id: "changes",
          title: "changes",
          body: <p>if these terms change, the date at the top changes with them.</p>,
        },
      ]}
    />
  );
}
