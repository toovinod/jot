"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { User } from "@jot/contracts";
import { api, send, upload } from "@/lib/api";
import { useSession } from "@/components/providers";
import { Page, Private, LibraryNav } from "@/components/shell";
import { Avatar } from "@/components/document";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, ErrorMessage } from "@/components/ui/fields";
export default function Settings() {
  return (
    <Private>
      <SettingsContent />
    </Private>
  );
}
function SettingsContent() {
  const { user, setUser, config, configError } = useSession();
  const [name, setName] = useState(user?.name || ""),
    [bio, setBio] = useState(user?.bio || ""),
    [avatar, setAvatar] = useState(user?.avatar || ""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const mounted = useRef(true);
  const baseline = useRef({
    name: user?.name || "",
    bio: user?.bio || "",
    avatar: user?.avatar || "",
  });
  const dirty = !!user && (name !== user.name || bio !== user.bio || avatar !== user.avatar);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Refresh pristine fields from another tab while retaining edits made in this form.
  useEffect(() => {
    const prior = baseline.current;
    const next = { name: user?.name || "", bio: user?.bio || "", avatar: user?.avatar || "" };
    if (name === prior.name && bio === prior.bio && avatar === prior.avatar) {
      setName(next.name);
      setBio(next.bio);
      setAvatar(next.avatar);
    }
    baseline.current = next;
  }, [user?.name, user?.bio, user?.avatar]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || uploading) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, uploading]);
  if (!user) return null;
  return (
    <Page>
      <div className="flex flex-col gap-10 md:flex-row">
        <LibraryNav tab="settings" />
        <div className="max-w-xl flex-1">
          <p className="mb-3 text-xs uppercase tracking-[.15em] text-primary">
            Make yourself known
          </p>
          <h1 className="font-serif text-5xl tracking-tight">A little about you.</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Your public profile is the signature at the end of every story.
          </p>
          <form
            className="mt-10 grid gap-6"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy || uploading) return;
              setBusy(true);
              setError("");
              try {
                const saved = await api<User>("/me", {
                  method: "PATCH",
                  headers: { "X-Jot-User-ID": user.id },
                  body: send({ name, bio, avatar }),
                });
                if (!mounted.current) return;
                setUser(saved);
                setName(saved.name);
                setBio(saved.bio);
                setAvatar(saved.avatar);
                toast.success("Your profile is updated.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy || uploading} className="grid gap-6">
              <div className="flex items-center gap-5">
                <Avatar user={{ ...user, avatar, name }} size="large" />
                <label className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm focus-within:ring-2 focus-within:ring-ring">
                  {uploading ? "Uploading…" : "Change photo"}
                  <input
                    aria-label="Upload profile photo"
                    type="file"
                    accept="image/png,image/jpeg,image/gif"
                    className="sr-only"
                    disabled={uploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploading(true);
                      try {
                        setAvatar((await upload(file)).url);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </label>
                {avatar && (
                  <Button variant="ghost" onClick={() => setAvatar("")} type="button">
                    Remove
                  </Button>
                )}
              </div>
              <Field label="Name">
                <Input
                  value={name}
                  required
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Username" hint="Your permanent address on Jot.">
                <Input value={`@${user.username}`} disabled />
              </Field>
              <Field label="Bio" hint="A few words about who you are. Public on your profile.">
                <Textarea
                  value={bio}
                  maxLength={1000}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Curious about…"
                />
              </Field>
              <ErrorMessage message={error} />
              <p role="status" className="text-xs text-muted-foreground">
                {dirty ? "You have unsaved profile changes." : "Your profile is up to date."}
              </p>
              <Button className="justify-self-start" disabled={busy || uploading}>
                {busy ? "Saving…" : "Save profile"}
              </Button>
            </fieldset>
          </form>
          <section className="mt-14 border-t border-border pt-7">
            <h2 className="font-medium">Available in this workspace</h2>
            <ErrorMessage message={configError} />
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Writing assistance: {config.aiEnabled ? "available" : "not configured"}
              <br />
              Email subscriptions: {config.emailEnabled ? "available" : "not configured"}
            </p>
            <p className="mt-5 text-xs leading-6 text-muted-foreground">
              Verify your account email before sending publication emails. Confirmation links are
              delivered through the configured email provider.
            </p>
            <Button
              className="mt-4"
              type="button"
              variant="outline"
              disabled={!config.emailEnabled || busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api("/auth/verification/request", { method: "POST", body: send({}) });
                  toast.success("Check your inbox for a verification link.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Send verification link
            </Button>
          </section>
        </div>
      </div>
    </Page>
  );
}
