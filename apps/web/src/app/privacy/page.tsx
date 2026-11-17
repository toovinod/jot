import type { Metadata } from "next";
import { Legal } from "@/components/legal";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <Legal
      title="privacy"
      updated="November 18, 2026"
      intro={
        <p>
          jot is open source and anyone can run it. this page describes what the software keeps and
          where it sends it. whoever runs the copy you use decides how long backups are kept and who
          can reach them.
        </p>
      }
      sections={[
        {
          id: "stores",
          title: "what jot stores",
          body: (
            <ul>
              <li>your account: email, username, name, bio and photo.</li>
              <li>your password, only as a bcrypt hash. nobody can read it back.</li>
              <li>your drafts, which only you can see, and every edition you publish.</li>
              <li>likes, bookmarks and comments you leave on pages.</li>
              <li>
                the email address you give when you subscribe to a writer, and the readers each
                writer has blocked from commenting.
              </li>
              <li>images you upload, and a custom domain if you add one.</li>
            </ul>
          ),
        },
        {
          id: "public",
          title: "what is public",
          body: (
            <p>
              published pages, your profile and your comments are public. unlisted pages are hidden
              from discover, but anyone with the link can read them. uploaded images live at public,
              hard-to-guess addresses, even when they sit in a draft, so don&apos;t upload anything
              sensitive.
            </p>
          ),
        },
        {
          id: "views",
          title: "counting reads",
          body: (
            <>
              <p>
                each page counts one read per reader per day. for a signed-out reader, jot keys the
                read to an HMAC-SHA256 of the network address (an IPv6 address is cut to its /64),
                made with a secret that lives only in the server&apos;s memory and is mixed with the
                date, so the key changes every day and can&apos;t be turned back into an address.
                raw addresses are not stored. for a signed-in reader the read is keyed to the
                account instead.
              </p>
              <p>
                these keys are deleted after about two days. writers only ever see a total per page.
                there are no ads and no analytics trackers.
              </p>
            </>
          ),
        },
        {
          id: "email",
          title: "subscriptions and email",
          body: (
            <>
              <p>
                when you subscribe to a writer, jot emails you a link to confirm. once you confirm,
                that writer can see your address in their subscriber list and download it. when they
                publish with email on, the full page goes to your inbox, not just a link.
              </p>
              <p>
                every email has a one-click unsubscribe. after you unsubscribe the address stays on
                record as unsubscribed, leaves the writer&apos;s list, and gets nothing more unless
                you subscribe and confirm again. sent email requests, which hold your address and
                your links, are deleted 30 days after they finish.
              </p>
            </>
          ),
        },
        {
          id: "comments",
          title: "comments and blocking",
          body: (
            <p>
              a writer can block a reader from commenting on their pages. while blocked, that
              reader&apos;s existing comments on the writer&apos;s pages are hidden, not deleted,
              and they show again if the writer unblocks them. the writer can also delete any
              comment on their pages, and you can delete your own.
            </p>
          ),
        },
        {
          id: "domains",
          title: "custom domains",
          body: (
            <p>
              if this copy of jot offers custom domains and you add one, the server looks up its DNS
              records to check that you own it. a verified domain is public: it points readers to
              your pages, and with the setup jot ships, the server gets a TLS certificate for it
              from a certificate authority, which records the name in public certificate logs.
              readers on your domain are signed out of jot.
            </p>
          ),
        },
        {
          id: "browser",
          title: "cookies and your browser",
          body: (
            <p>
              jot sets one cookie to keep you signed in. the editor keeps a local copy of unsaved
              writing in your browser so a dropped connection doesn&apos;t lose it, and a writing
              assistance request in progress stays in that tab until you close it.
            </p>
          ),
        },
        {
          id: "services",
          title: "services jot talks to",
          body: (
            <ul>
              <li>
                an email provider (Resend), if email is turned on, to send confirmations and new
                pages.
              </li>
              <li>
                an AI provider (OpenAI), only when you ask for writing assistance, and only the text
                you send. these requests are deleted a day after they finish.
              </li>
              <li>Fontshare, which serves the typeface this site uses to your browser.</li>
            </ul>
          ),
        },
        {
          id: "leaving",
          title: "taking your writing and leaving",
          body: (
            <>
              <p>
                from settings you can download everything you wrote as a zip of Markdown files, one
                per page, with drafts and live copies. you can also download your subscriber list as
                a CSV.
              </p>
              <p>
                you can unpublish or delete any page. deleting your account, also in settings, asks
                for your password and then removes your account, pages, editions, comments, likes,
                bookmarks, subscribers, custom domain and sessions, then deletes your uploaded
                files. it can&apos;t be undone. copies already sent by email can&apos;t be called
                back, and backups follow whoever runs this copy of jot.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
