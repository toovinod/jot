"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { User } from "@jot/contracts";
import { api, send, upload } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/providers";
import { AppShell, Private } from "@/components/shell";
import { Avatar } from "@/components/post-parts";
import { FormSection, PageBody, SceneHeader } from "@/components/app";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input, Textarea, ErrorMessage } from "@/components/ui/fields";
import {
  BlockedReaders,
  CustomDomainSection,
  DeleteAccount,
  EmailSection,
  ExportSection,
  Subscribers,
} from "./account-sections";
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
    <AppShell active="settings">
      <SceneHeader
        title="settings."
        subtitle="your profile, your readers, and everything you wrote."
        cast={["cup", "star", "cloud"]}
      />
      <PageBody>
        <div className="relative -mt-14 grid gap-5">
          <form
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
                toast.success("your profile is updated.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <FormSection
              title="profile"
              description="your name, photo and bio sign every page you publish."
              footer={
                <>
                  <p role="status" className="mr-auto text-xs text-muted-foreground">
                    {dirty ? "you have unsaved changes." : "your profile is up to date."}
                  </p>
                  <Button disabled={busy || uploading}>{busy ? "saving…" : "save profile"}</Button>
                </>
              }
            >
              <fieldset disabled={busy || uploading} className="grid min-w-0 gap-5">
                <div className="flex flex-wrap items-center gap-4">
                  <Avatar user={{ ...user, avatar, name }} size="large" />
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      className={cn(
                        buttonVariants({ variant: "outline" }),
                        "focus-within:ring-3 focus-within:ring-sky/60",
                      )}
                    >
                      {uploading ? "uploading…" : avatar ? "change photo" : "add a photo"}
                      <input
                        aria-label="Upload profile photo"
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
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
                        remove
                      </Button>
                    )}
                  </div>
                  <p className="w-full text-xs text-muted-foreground">
                    png, jpeg, gif or webp, up to 10 MB.
                  </p>
                </div>
                <Field label="name">
                  <Input
                    value={name}
                    required
                    maxLength={100}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field label="username" hint={`permanent. your pages live at /@${user.username}.`}>
                  <Input value={`@${user.username}`} disabled />
                </Field>
                <Field label="bio" hint="a few words about who you are. shown on your profile.">
                  <Textarea
                    value={bio}
                    maxLength={1000}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="curious about…"
                  />
                </Field>
                <ErrorMessage message={error} />
              </fieldset>
            </FormSection>
          </form>
          <EmailSection config={config} configError={configError} />
          <Subscribers />
          <BlockedReaders />
          {config.domainTarget && <CustomDomainSection target={config.domainTarget} />}
          <ExportSection />
          <DeleteAccount userId={user.id} />
        </div>
      </PageBody>
    </AppShell>
  );
}
