"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowClockwise, Copy, DownloadSimple, EnvelopeSimple } from "@phosphor-icons/react";
import type { BlockedReader, Config, CustomDomain, Subscriber } from "@jot/contracts";
import {
  allSubscribers,
  deleteAccount,
  exportArchive,
  getBlocked,
  getDomain,
  getSubscribers,
  removeDomain,
  removeSubscriber,
  requestVerification,
  setDomain,
  subscribersCsv,
  unblockReader,
  verifyDomain,
} from "@/lib/account-api";
import { clearAllDraftRecovery } from "@/lib/draft-recovery";
import { friendlyError } from "@/lib/errors";
import { date } from "@/lib/utils";
import { EmptyState, FormSection, IconButton, StatusBadge } from "@/components/app";
import { Avatar } from "@/components/post-parts";
import { Button } from "@/components/ui/button";
import { ErrorMessage, Field, Input } from "@/components/ui/fields";
import { Skeleton } from "@/components/ui/skeleton";

const pageSize = 50;
const list = "divide-y divide-border overflow-hidden rounded-2xl border border-border";

/** Busy flags keyed by row ID, so one slow request never locks the other rows. */
function useRowBusy() {
  const [rows, setRows] = useState<Set<string>>(new Set());
  return {
    has: (id: string) => rows.has(id),
    set: (id: string, on: boolean) =>
      setRows((current) => {
        const next = new Set(current);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      }),
  };
}

function RowSkeletons() {
  return (
    <div className="grid gap-2">
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
    </div>
  );
}

/** A retry under a section that failed to load. */
function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" type="button" className="w-fit" onClick={onClick}>
      <ArrowClockwise weight="bold" />
      try again
    </Button>
  );
}

export function EmailSection({ config, configError }: { config: Config; configError: string }) {
  const [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState("");
  return (
    <FormSection
      title="email"
      description="verify your address before your pages can go out to subscribers."
      footer={
        <Button
          type="button"
          variant="outline"
          disabled={!config.emailEnabled || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await requestVerification();
              setSent(true);
              toast.success("check your inbox for a verification link.");
            } catch (e) {
              setError(friendlyError(e, { auto: false }).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <EnvelopeSimple weight="bold" />
          {busy ? "sending…" : "send verification link"}
        </Button>
      }
    >
      <ErrorMessage message={configError} />
      <dl className="grid gap-2 text-sm">
        {(
          [
            ["email subscriptions", config.emailEnabled],
            ["writing assistance", config.aiEnabled],
          ] as const
        ).map(([label, on]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>
              <StatusBadge status={on ? "live" : "draft"}>
                {on ? "available" : "not set up here"}
              </StatusBadge>
            </dd>
          </div>
        ))}
      </dl>
      <p role="status" className="text-sm leading-6 text-muted-foreground">
        {!config.emailEnabled
          ? "this copy of jot has no email provider, so there's nothing to verify yet."
          : sent
            ? "a link is on its way. it works for one hour."
            : "we'll email a link to the address you signed up with."}
      </p>
      <ErrorMessage message={error} />
    </FormSection>
  );
}

export function Subscribers() {
  const [items, setItems] = useState<Subscriber[]>([]),
    [total, setTotal] = useState<number | null>(null),
    // Where the next page starts on the server. The shown list drops repeats, so its length can lag.
    [next, setNext] = useState(0),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const removing = useRowBusy();
  async function load(offset: number) {
    setBusy(true);
    setError("");
    try {
      const page = await getSubscribers(offset, pageSize);
      // A removal or a new subscriber between pages shifts offsets, so a page can repeat someone.
      setItems((current) => {
        if (!offset) return page.items;
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !seen.has(item.id))];
      });
      setTotal(page.total);
      setNext(offset + page.items.length);
      setMore(page.items.length === pageSize && offset + page.items.length < page.total);
    } catch (e) {
      setError(friendlyError(e, { auto: false }).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load(0);
  }, []);
  async function remove(subscriber: Subscriber) {
    setError("");
    removing.set(subscriber.id, true);
    try {
      await removeSubscriber(subscriber.id);
      setItems((current) => current.filter((item) => item.id !== subscriber.id));
      setTotal((count) => (count ? count - 1 : 0));
      // Everyone after them moved up one, so the next page starts one earlier.
      setNext((offset) => Math.max(0, offset - 1));
    } catch (e) {
      setError(friendlyError(e, { auto: false }).message);
    } finally {
      removing.set(subscriber.id, false);
    }
  }
  async function download() {
    setBusy(true);
    setError("");
    try {
      const blob = new Blob([subscribersCsv(await allSubscribers())], { type: "text/csv" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "subscribers.csv";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      setError(friendlyError(e, { auto: false }).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormSection
      title="subscribers"
      description="readers who confirmed they want your pages by email."
      footer={
        total !== null && (
          <>
            <Button variant="ghost" type="button" disabled={busy} onClick={() => load(0)}>
              <ArrowClockwise weight="bold" />
              refresh
            </Button>
            {more && (
              <Button variant="outline" type="button" disabled={busy} onClick={() => load(next)}>
                show more
              </Button>
            )}
            {!!total && (
              <Button variant="outline" type="button" disabled={busy} onClick={download}>
                <DownloadSimple weight="bold" />
                download csv
              </Button>
            )}
          </>
        )
      }
    >
      {total !== null && total > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="font-display text-3xl font-medium tracking-[-0.04em] text-foreground">
            {total.toLocaleString()}
          </span>{" "}
          {total === 1 ? "person gets" : "people get"} your pages by email.
        </p>
      )}
      <ErrorMessage message={error} />
      {total === null && error && <RetryButton onClick={() => load(0)} />}
      {total === null && !error ? (
        <RowSkeletons />
      ) : total === 0 ? (
        <EmptyState
          critter="letter"
          className="pb-8 pt-6"
          title="no subscribers yet."
          body="readers can subscribe from your profile and from the end of each page."
        />
      ) : (
        items.length > 0 && (
          <ul className={list}>
            {items.map((subscriber) => (
              <li key={subscriber.id} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-sky-soft text-sky-deep"
                >
                  <EnvelopeSimple weight="fill" className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{subscriber.email}</span>
                  <span className="block text-xs text-muted-foreground">
                    since {date(subscriber.createdAt).toLowerCase()}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  aria-label={`Remove ${subscriber.email}`}
                  disabled={removing.has(subscriber.id)}
                  onClick={() => remove(subscriber)}
                >
                  {removing.has(subscriber.id) ? "removing…" : "remove"}
                </Button>
              </li>
            ))}
          </ul>
        )
      )}
    </FormSection>
  );
}

export function BlockedReaders() {
  const [items, setItems] = useState<BlockedReader[] | null>(null),
    [error, setError] = useState("");
  const unblocking = useRowBusy();
  function load() {
    setError("");
    getBlocked().then(setItems, (e) => setError(friendlyError(e, { auto: false }).message));
  }
  useEffect(load, []);
  async function unblock(reader: BlockedReader) {
    setError("");
    unblocking.set(reader.user.id, true);
    try {
      await unblockReader(reader.user.id);
      setItems((current) => current?.filter((item) => item.user.id !== reader.user.id) ?? null);
    } catch (e) {
      setError(friendlyError(e, { auto: false }).message);
    } finally {
      unblocking.set(reader.user.id, false);
    }
  }
  return (
    <FormSection
      title="blocked readers"
      description="they can't comment on any of your pages, and their comments there stay hidden until you unblock them."
    >
      <ErrorMessage message={error} />
      {!items ? (
        error ? (
          <RetryButton onClick={load} />
        ) : (
          <RowSkeletons />
        )
      ) : !items.length ? (
        <EmptyState
          critter="heart"
          className="pb-8 pt-6"
          title="nobody is blocked."
          body="you can block a reader from any comment they leave on your pages."
        />
      ) : (
        <ul className={list}>
          {items.map((reader) => (
            <li key={reader.user.id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar user={reader.user} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {reader.user.name}{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    @{reader.user.username}
                  </span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  blocked {date(reader.blockedAt).toLowerCase()}
                </span>
              </span>
              <Button
                variant="outline"
                size="sm"
                type="button"
                aria-label={`Unblock ${reader.user.name}`}
                disabled={unblocking.has(reader.user.id)}
                onClick={() => unblock(reader)}
              >
                {unblocking.has(reader.user.id) ? "unblocking…" : "unblock"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </FormSection>
  );
}

export function CustomDomainSection({ target }: { target: string }) {
  const [domain, setDomainState] = useState<CustomDomain | null>(null),
    [input, setInput] = useState(""),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(friendlyError(e, { auto: false }).message);
    } finally {
      setBusy(false);
    }
  }
  function load() {
    void run(async () => {
      setDomainState(await getDomain());
      setLoaded(true);
    });
  }
  useEffect(load, []);
  return (
    <FormSection
      title="custom domain"
      description="serve your profile and pages from a domain you own."
      footer={
        domain && (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await removeDomain();
                  setDomainState(null);
                  setInput("");
                })
              }
            >
              remove domain
            </Button>
            {!domain.verified && (
              <Button
                type="button"
                disabled={busy}
                onClick={() => run(async () => setDomainState(await verifyDomain()))}
              >
                {busy ? "checking…" : "check dns"}
              </Button>
            )}
          </>
        )
      }
    >
      <ErrorMessage message={error} />
      {!loaded && (error ? <RetryButton onClick={load} /> : <Skeleton className="h-11" />)}
      {loaded && !domain && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => setDomainState(await setDomain(input.trim().toLowerCase())));
          }}
        >
          <div className="min-w-56 flex-1">
            <Field label="domain">
              <Input
                value={input}
                required
                autoCapitalize="none"
                spellCheck={false}
                placeholder="blog.example.com"
                onChange={(e) => setInput(e.target.value)}
              />
            </Field>
          </div>
          <Button disabled={busy}>add domain</Button>
        </form>
      )}
      {domain && (
        <>
          <p className="flex flex-wrap items-center gap-2.5">
            <span className="break-all font-mono text-sm">{domain.domain}</span>
            {domain.verified ? (
              <StatusBadge status="live">verified</StatusBadge>
            ) : (
              <StatusBadge status="draft">waiting for dns</StatusBadge>
            )}
          </p>
          <ol className="grid gap-3 text-sm">
            <DnsRecord
              step={1}
              type="TXT"
              help="proves the domain is yours."
              name={domain.txtName}
              value={domain.txtValue}
            />
            <DnsRecord
              step={2}
              type="CNAME"
              help="sends readers to your pages."
              name={domain.domain}
              value={domain.target || target}
            />
          </ol>
          {!domain.verified && (
            <p className="text-xs leading-5 text-muted-foreground">
              add both records at your DNS provider, then check. new records can take a while to
              show up.
            </p>
          )}
        </>
      )}
    </FormSection>
  );
}

function DnsRecord({
  step,
  type,
  help,
  name,
  value,
}: {
  step: number;
  type: string;
  help: string;
  name: string;
  value: string;
}) {
  return (
    <li className="grid gap-2 rounded-2xl bg-sky-soft/50 p-4">
      <p>
        <span className="mr-2 inline-grid size-5 place-items-center rounded-full bg-ink font-mono text-[11px] text-white">
          {step}
        </span>
        add a <span className="font-mono">{type}</span> record. {help}
      </p>
      <dl className="grid gap-1.5 font-mono text-xs sm:grid-cols-[56px_minmax(0,1fr)] sm:items-center">
        {[
          ["name", name],
          ["value", value],
        ].map(([label, text]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 break-all">{text}</span>
              <IconButton
                variant="ghost"
                label={`Copy ${type} ${label}`}
                className="size-7"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(text);
                    toast.success(`copied the ${type} ${label}.`);
                  } catch {
                    toast.error("couldn't copy. select the text instead.");
                  }
                }}
              >
                <Copy weight="bold" />
              </IconButton>
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

export function ExportSection() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(await exportArchive());
      link.download = "jot-export.zip";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      setError(friendlyError(e, { auto: false }).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormSection
      title="export everything"
      description="a zip with every page as Markdown, drafts and live copies included."
      footer={
        <Button variant="outline" type="button" disabled={busy} onClick={download}>
          <DownloadSimple weight="bold" />
          {busy ? "preparing zip…" : "download zip"}
        </Button>
      }
    >
      <p className="text-sm leading-6 text-muted-foreground">
        each file starts with its title, slug, tags and status, so it moves cleanly into another
        tool. your subscriber list downloads separately, above.
      </p>
      <ErrorMessage message={error} />
    </FormSection>
  );
}

export function DeleteAccount({ userId }: { userId: string }) {
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await deleteAccount(password, userId);
          clearAllDraftRecovery();
          // A full load drops every bit of signed-in state; a client push would race the private-page redirect to login.
          location.replace("/");
        } catch (e) {
          setError(friendlyError(e, { auto: false }).message);
          setBusy(false);
        }
      }}
    >
      <FormSection
        className="bg-destructive/30"
        title={<span className="text-destructive">delete account</span>}
        description="removes your account, every page, comment, like and subscriber, and your uploaded files. it can't be undone."
        footer={
          <Button variant="destructive" disabled={busy || !password}>
            {busy ? "deleting…" : "delete my account"}
          </Button>
        }
      >
        <Field label="password" hint="type your password to confirm it's you.">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorMessage message={error} />
      </FormSection>
    </form>
  );
}
