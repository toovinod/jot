"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ClipboardText, PaintBrush, PaperPlaneTilt, Square } from "@phosphor-icons/react";
import { cn, slugify } from "@/lib/utils";
import { JotMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/fields";
import { DEMO_LIMIT, SAMPLE_NOTE, parseDemoNote, type DemoBlock } from "./demo-parse";
import { Reveal, SectionTitle, softItalic } from "./reveal";

const steps = [
  { id: "paste", label: "1 paste", icon: ClipboardText },
  { id: "shape", label: "2 shape", icon: PaintBrush },
  { id: "publish", label: "3 publish", icon: PaperPlaneTilt },
] as const;
type Step = (typeof steps)[number]["id"];

const accents = {
  orange: "#a7482d",
  green: "#3c7055",
  blue: "#366aa1",
  violet: "#79519d",
  rose: "#b44f70",
} as const;
type Accent = keyof typeof accents;
const fonts = { serif: "font-serif", sans: "font-sans", mono: "font-mono" } as const;
const widths = { narrow: "max-w-[300px]", standard: "max-w-[380px]", wide: "max-w-full" } as const;

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="grid grid-cols-3 rounded-xl bg-background p-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => onChange(option)}
            className={cn(
              "cursor-pointer rounded-lg py-1.5 text-sm transition-colors",
              value === option
                ? "bg-white shadow-[0_0_0_1px_var(--border),0_2px_0_var(--border)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function Preview({ blocks, accent }: { blocks: DemoBlock[]; accent: string }) {
  if (!blocks.length)
    return (
      <p className="text-muted-foreground">your page shows up here. start typing on the left.</p>
    );
  return (
    <>
      {blocks.map((block, i) => {
        const key = `${i}-${block.kind}`;
        if (block.kind === "h1")
          return (
            <h3 key={key} className="text-3xl leading-tight tracking-tight">
              {block.text}
            </h3>
          );
        if (block.kind === "h2")
          return (
            <h4 key={key} className="mt-2 text-xl" style={{ color: accent }}>
              {block.text}
            </h4>
          );
        if (block.kind === "li")
          return (
            <p key={key} className="flex gap-2.5 pl-1">
              <span
                className="mt-2.5 size-1.5 shrink-0 rounded-full"
                style={{ background: accent }}
              />
              {block.text}
            </p>
          );
        if (block.kind === "todo")
          return (
            <p key={key} className="flex items-center gap-2.5">
              {block.done ? (
                <Check weight="bold" className="size-4 shrink-0" style={{ color: accent }} />
              ) : (
                <Square weight="bold" className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className={cn(block.done && "text-muted-foreground line-through")}>
                {block.text}
              </span>
            </p>
          );
        if (block.kind === "code")
          return (
            <pre
              key={key}
              className="overflow-x-auto rounded-xl bg-[#0f1a2b] p-3.5 font-mono text-xs leading-relaxed text-[#cfe6ff]"
            >
              {block.text}
            </pre>
          );
        return (
          <p key={key} className="leading-relaxed">
            {block.text}
          </p>
        );
      })}
    </>
  );
}

export function Demo() {
  const [step, setStep] = useState<Step>("paste");
  const [note, setNote] = useState(SAMPLE_NOTE);
  const [font, setFont] = useState<keyof typeof fonts>("serif");
  const [width, setWidth] = useState<keyof typeof widths>("standard");
  const [accent, setAccent] = useState<Accent>("orange");
  const [published, setPublished] = useState(false);
  const blocks = useMemo(() => parseDemoNote(note), [note]);
  const title = blocks.find((block) => block.kind === "h1")?.text ?? "";
  const url = `/@you/${slugify(title) || "your-title"}`;

  return (
    <section className="mx-auto max-w-7xl px-4 pt-24 md:px-8 md:pt-32">
      <Reveal>
        <SectionTitle eyebrow="live demo">
          try it. <em className={softItalic}>right here.</em>
        </SectionTitle>
        <p className="mt-4 text-muted-foreground">this runs in your browser and saves nothing.</p>
      </Reveal>
      <Reveal delay={0.1}>
        <div className="mt-10 overflow-hidden rounded-[28px] border border-border bg-white shadow-[0_6px_0_var(--border),0_30px_60px_-30px_rgba(10,40,90,.35)]">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <div aria-hidden="true" className="hidden gap-1.5 sm:flex">
              <span className="size-3 rounded-full bg-[#ff5f57]" />
              <span className="size-3 rounded-full bg-[#febc2e]" />
              <span className="size-3 rounded-full bg-[#28c840]" />
            </div>
            <div
              role="tablist"
              aria-label="Demo steps"
              className="mx-auto flex gap-1 rounded-full bg-background p-1"
            >
              {steps.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={step === item.id}
                  onClick={() => setStep(item.id)}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors",
                    step === item.id
                      ? "bg-ink text-white"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <item.icon weight={step === item.id ? "fill" : "duotone"} className="size-4" />
                  {item.label}
                </button>
              ))}
            </div>
            <span className="hidden w-[52px] sm:block" />
          </div>
          <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="border-b border-border p-5 md:border-b-0 md:border-r">
              {step === "paste" && (
                <label className="block">
                  <span className="mb-2 block text-xs font-medium text-muted-foreground">
                    paste or type anything. {note.length}/{DEMO_LIMIT}
                  </span>
                  <Textarea
                    value={note}
                    maxLength={DEMO_LIMIT}
                    onChange={(event) => {
                      setNote(event.target.value.slice(0, DEMO_LIMIT));
                      setPublished(false);
                    }}
                    className="min-h-80 font-mono text-[13px] leading-relaxed"
                  />
                </label>
              )}
              {step === "shape" && (
                <div className="space-y-6">
                  <Segmented
                    label="font"
                    value={font}
                    options={["serif", "sans", "mono"] as const}
                    onChange={setFont}
                  />
                  <div role="radiogroup" aria-label="accent">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">accent</p>
                    <div className="flex gap-2.5">
                      {(Object.keys(accents) as Accent[]).map((name) => (
                        <button
                          key={name}
                          type="button"
                          role="radio"
                          aria-checked={accent === name}
                          aria-label={name}
                          onClick={() => setAccent(name)}
                          className={cn(
                            "size-8 cursor-pointer rounded-full border-[3px] border-white transition-transform hover:scale-110 motion-reduce:transform-none",
                            accent === name ? "ring-2 ring-ink" : "ring-1 ring-border",
                          )}
                          style={{ background: accents[name] }}
                        />
                      ))}
                    </div>
                  </div>
                  <Segmented
                    label="width"
                    value={width}
                    options={["narrow", "standard", "wide"] as const}
                    onChange={setWidth}
                  />
                </div>
              )}
              {step === "publish" && (
                <div className="relative flex min-h-60 flex-col items-start justify-center gap-5">
                  <p className="text-muted-foreground">one click and it has an address.</p>
                  <Button
                    variant="sky"
                    size="lg"
                    onClick={() => setPublished(true)}
                    disabled={published}
                  >
                    <PaperPlaneTilt weight="fill" />
                    {published ? "published" : "publish"}
                  </Button>
                  <AnimatePresence>
                    {published && (
                      <>
                        <motion.div
                          aria-hidden="true"
                          className="pointer-events-none absolute left-24 top-1/2"
                          initial={{ x: 0, y: 0, opacity: 1, rotate: -20 }}
                          animate={{ x: 420, y: -260, opacity: 0, rotate: -40 }}
                          transition={{ duration: 1.1, ease: "easeIn" }}
                        >
                          <JotMark className="size-10 text-ink" />
                        </motion.div>
                        <motion.p
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.6 }}
                          className="flex items-center gap-2 rounded-full bg-[#dff5e3] px-3 py-1.5 font-mono text-sm text-grass-3"
                        >
                          <span className="size-2 rounded-full bg-grass-2" />
                          {url}
                        </motion.p>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
            <div className="bg-background/60 p-5 md:p-8">
              <motion.article
                layout
                transition={{ type: "spring", stiffness: 220, damping: 26 }}
                className={cn(
                  "mx-auto space-y-3 rounded-2xl bg-white p-6 text-[15px] shadow-[0_0_0_1px_var(--border)]",
                  fonts[font],
                  widths[width],
                )}
              >
                <Preview blocks={blocks} accent={accents[accent]} />
              </motion.article>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
