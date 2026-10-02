import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  Ban,
  Cpu,
  GitBranch,
  Languages,
  ListChecks,
  Radio,
  ShieldCheck,
  Waves,
} from "lucide-react";
import { Badge } from "../components/ui/panel";
import { Button } from "../components/ui/button";
import { processUtterance } from "../processing/pipeline";
import { LEXICON, lexiconPhrases } from "../data/lexicon";

const PIPELINE = [
  { name: "Shenava Koochik", role: "tract streaming, Persian, offline", icon: Cpu },
  { name: "Number freeze", role: "every dose becomes atomic", icon: ListChecks },
  { name: "Unit folding", role: "500 mg is one token", icon: Activity },
  { name: "Negation guard", role: "ندارد is never rewritten", icon: ShieldCheck },
  { name: "Terminology", role: "Persian → English, tiered", icon: Languages },
  { name: "Plausibility", role: "1600/90 gets caught", icon: Radio },
  { name: "BiDi assembly", role: "isolated, paste-ready", icon: GitBranch },
];

const SAFETY = [
  {
    title: "Numbers are frozen first",
    body: "Spoken doses, ranges and percentages are lifted into protected spans before any other stage runs. A later rule cannot rewrite a number even if it is certain it is wrong.",
  },
  {
    title: "Tier 3 never substitutes",
    body: "متوپرولول and متفورمین are one consonant apart. Terms that are acoustically or semantically ambiguous are flagged for you instead of being silently rewritten.",
  },
  {
    title: "No generative model in the path",
    body: "There is no LLM rewriting your note. The same audio always produces the same text, and every change the rules made is recoverable from the audit trail.",
  },
  {
    title: "Audio never leaves the device",
    body: "The decoder runs locally. No audio, no transcript and no key is sent to a third party, because a clinical note is not the vendor's training data.",
  },
];

const LIMITATIONS = [
  "Shenava hears Persian. Speak medical terms in Persian — «سی تی اسکن», not «CT scan» — and the terminology stage renders them in English for the chart.",
  "Spoken English sentences and English brand names are out of scope for v1. This is a deliberate trade, not a bug we missed.",
  "Symptoms and narrative stay in Persian on purpose. Only terms that real Iranian notes write in Latin script are converted.",
  "Clinical accuracy is the clinician's. The flags are a second pair of eyes, not a diagnosis.",
];

function LivePreview() {
  const samples = useMemo(
    () => [
      "فشار خون یکصد و بیست روی هشتاد میلی متر جیوه و نبض هفتاد و دو",
      "متفورمین پانصد میلی گرم روزانه مصرف شود و کاندید سی تی اسکن باشد",
      "سرفه ندارد اما تب سی و نه درجه دارد",
    ],
    [],
  );
  const [active, setActive] = useState(0);
  const result = useMemo(() => processUtterance(samples[active]), [samples, active]);

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-border/70 p-3">
        {samples.map((sample, index) => (
          <button
            key={sample}
            onClick={() => setActive(index)}
            className={`rounded-md px-3 py-1.5 text-[11px] transition-colors ${
              index === active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            }`}
          >
            {index === 0 ? "Vitals" : index === 1 ? "Prescription" : "Negation"}
          </button>
        ))}
      </div>

      <div className="space-y-4 p-5">
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
            <Waves className="h-3.5 w-3.5" />
            Acoustic output
          </div>
          <p dir="rtl" className="bidi-surface rounded-md bg-background/70 p-3 text-sm leading-7 text-muted-foreground">
            {samples[active]}
          </p>
        </div>

        <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          deterministic rules
          <span className="h-px flex-1 bg-border" />
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[11px] uppercase tracking-widest text-primary">
            <SparklineIcon />
            What lands in the chart
          </div>
          <motion.p
            key={result.plain}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            dir="rtl"
            className="bidi-surface rounded-md border border-primary/25 bg-primary/[0.07] p-3 text-sm leading-7 text-foreground"
          >
            {result.plain}
          </motion.p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {result.flags.length === 0 ? (
            <Badge tone="ok">no flags raised</Badge>
          ) : (
            result.flags.slice(0, 3).map((flag, index) => (
              <Badge key={index} tone={flag.severity === "danger" ? "danger" : flag.severity === "warn" ? "warn" : "primary"}>
                {flag.detail}
              </Badge>
            ))
          )}
          <span className="tabnum ms-auto text-[11px] text-muted-foreground">
            pipeline {result.stats.pipelineMs} ms
          </span>
        </div>
      </div>
    </div>
  );
}

function SparklineIcon() {
  return (
    <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
      <span className="flex h-2 items-end gap-[1px]">
        <span className="h-1 w-[2px] bg-primary" />
        <span className="h-2 w-[2px] bg-primary" />
        <span className="h-1.5 w-[2px] bg-primary" />
        <span className="h-2.5 w-[2px] bg-primary" />
      </span>
    </span>
  );
}

function SectionHeading({ kicker, title, body }: { kicker: string; title: string; body?: string }) {
  return (
    <div className="max-w-2xl">
      <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary">{kicker}</span>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h2>
      {body ? <p className="mt-3 text-sm leading-7 text-muted-foreground">{body}</p> : null}
    </div>
  );
}

export default function Landing() {
  const termCount = Object.values(LEXICON).reduce((sum, group) => sum + group.length, 0);
  const hotwordCount = lexiconPhrases().length;

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="surface-vignette pointer-events-none absolute inset-0 -z-10" />
      <div className="surface-grid pointer-events-none absolute inset-0 -z-10 opacity-[0.35]" />

      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative grid h-9 w-9 place-items-center rounded-md border border-primary/40 bg-primary/10">
              <Waves className="h-4 w-4 text-primary" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">شنوا</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Shenava Clinical
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="#architecture" className="hidden px-3 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block">
              Architecture
            </a>
            <a href="#safety" className="hidden px-3 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block">
              Safety
            </a>
            <Link to="/auth">
              <Button variant="primary" size="sm">
                Open the studio
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="container grid gap-14 pb-24 pt-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-24">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Badge tone="primary" className="mb-6">
              <Radio className="h-3 w-3" />
              Offline realtime · Persian → English clinical terms
            </Badge>

            <h1 className="text-4xl font-semibold leading-[1.25] tracking-tight text-foreground sm:text-5xl">
              You dictate in Persian.
              <br />
              <span className="bg-gradient-to-l from-primary via-primary to-accent bg-clip-text text-transparent">
                The chart gets English.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground">
              Shenava Koochik hears the Persian. A deterministic rule engine — not a language model —
              freezes every dose, folds every unit, protects every negation, and rewrites drugs, labs,
              units and procedures into the Latin forms your notes already use. Same audio in, same
              text out, every single time.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/auth">
                <Button variant="primary" size="lg">
                  Create a clinician account
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#architecture">
                <Button variant="secondary" size="lg">
                  See the pipeline
                </Button>
              </a>
            </div>

            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-border/70 pt-7">
              {[
                { value: String(termCount), label: "clinical terms" },
                { value: hotwordCount, label: "decoder hotwords" },
                { value: "0", label: "generative rewrites" },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="tabnum text-2xl font-semibold text-foreground">{stat.value}</dt>
                  <dd className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
          >
            <LivePreview />
          </motion.div>
        </section>

        <section id="architecture" className="border-y border-border/60 bg-card/30 py-24">
          <div className="container space-y-12">
            <SectionHeading
              kicker="Architecture"
              title="Seven stages, in an order that is a safety property"
              body="The order is not a style choice. Numbers are frozen before terminology runs, so no later rule can ever touch a dose, and the negation guard runs before any substitution so «ندارد» can never be flipped."
            />

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {PIPELINE.map((stage, index) => (
                <motion.div
                  key={stage.name}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  className="panel group p-5 transition-colors hover:border-primary/35"
                >
                  <div className="flex items-center justify-between">
                    <stage.icon className="h-4 w-4 text-primary" />
                    <span className="tabnum text-[10px] text-muted-foreground/70">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mt-4 text-sm font-medium text-foreground">{stage.name}</h3>
                  <p className="mt-1.5 text-xs leading-6 text-muted-foreground">{stage.role}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="safety" className="py-24">
          <div className="container grid gap-14 lg:grid-cols-[0.9fr_1.1fr]">
            <SectionHeading
              kicker="Safety model"
              title="What this product refuses to do"
              body="A wrong dose in a chart is not a UX bug. Every decision below is a refusal we made on purpose, and each one is enforced in code with a regression test."
            />

            <div className="space-y-3">
              {SAFETY.map((item) => (
                <div key={item.title} className="panel p-5">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div>
                      <h3 className="text-sm font-medium text-foreground">{item.title}</h3>
                      <p className="mt-1.5 text-xs leading-6 text-muted-foreground">{item.body}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border/60 bg-card/30 py-24">
          <div className="container grid gap-14 lg:grid-cols-2">
            <div>
              <SectionHeading kicker="Lexicon" title="The product is the data" />
              <p className="mt-4 max-w-lg text-sm leading-7 text-muted-foreground">
                Three safety tiers, and the rule is simple: if the term is always Latin in real
                Iranian notes it is substituted, if it is ambiguous it is flagged, and if it is
                always Persian it is never touched. Symptoms and narrative stay in Persian on
                purpose.
              </p>
              <div className="mt-8 space-y-2">
                {[
                  { tier: "Tier 1", body: "CT scan · MRI · IV · mg · CCU — substituted silently", tone: "ok" as const },
                  { tier: "Tier 2", body: "metformin · HbA1c · MI — substituted and underlined for review", tone: "primary" as const },
                  { tier: "Tier 3", body: "متوپرولول · ضربان قلب · فوری — never substituted, always flagged", tone: "warn" as const },
                ].map((row) => (
                  <div key={row.tier} className="flex items-start gap-3 rounded-md border border-border/70 bg-background/40 p-3">
                    <Badge tone={row.tone}>{row.tier}</Badge>
                    <p className="text-xs leading-6 text-muted-foreground" dir="rtl">
                      {row.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <SectionHeading kicker="Limitations" title="Said up front, not in the small print" />
              <ul className="mt-8 space-y-3">
                {LIMITATIONS.map((item) => (
                  <li key={item} className="flex gap-3 rounded-md border border-border/70 bg-background/40 p-4">
                    <Ban className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <p className="text-xs leading-7 text-muted-foreground">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="py-24">
          <div className="container">
            <div className="panel relative overflow-hidden p-10 text-center sm:p-16">
              <div className="surface-vignette pointer-events-none absolute inset-0" />
              <div className="relative">
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Open the studio and dictate a note
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
                  Start with the built-in rehearsal cases to see the terminology engine work, or point
                  the studio at a local Shenava decoder and use your own voice.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Link to="/auth">
                    <Button variant="primary" size="lg">
                      Create an account
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link to="/auth?mode=signin">
                    <Button variant="secondary" size="lg">
                      I already have one
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="container flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
          <span>Shenava Clinical — offline Persian dictation with deterministic English terminology.</span>
          <span>Not a medical device. Clinical decisions remain with the clinician.</span>
        </div>
      </footer>
    </div>
  );
}
