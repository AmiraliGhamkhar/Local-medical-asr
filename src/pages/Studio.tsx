import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertCircle,
  Cpu,
  Download,
  Info,
  Loader2,
  LogOut,
  Mic,
  MicOff,
  Play,
  Square,
  Waves,
} from "lucide-react";
import { Badge, Field, Input, Panel, PanelHeader } from "../components/ui/panel";
import { Button } from "../components/ui/button";
import { ChartTarget } from "../components/studio/ChartTarget";
import { FlagsPanel } from "../components/studio/AuditPanel";
import { AuditTrail, type AuditRow } from "../components/studio/AuditTrail";
import { LexiconManager } from "../components/studio/LexiconManager";
import { TranscriptView } from "../components/studio/TranscriptView";
import { useAuth } from "../lib/auth";
import { useMutation, useQuery } from "../lib/convex";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { DEFAULT_SETTINGS, useDictation, type DictationSettings, type Engine } from "../lib/useDictation";
import { buildHotwords, hotwordsAsText } from "../lib/hotwords";
import type { ProcessedUtterance } from "../processing/types";
import type { CustomTerm } from "../processing/pipeline";

type Tab = "dictation" | "terminology" | "audit" | "engine";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "dictation", label: "Dictation" },
  { id: "terminology", label: "Terminology" },
  { id: "audit", label: "Audit trail" },
  { id: "engine", label: "Engine & limits" },
];

export default function Studio() {
  const { token, user, signOut, online } = useAuth();
  const [tab, setTab] = useState<Tab>("dictation");
  const [engine, setEngine] = useState<Engine>("rehearsal");
  const [settings, setSettings] = useState<DictationSettings>(DEFAULT_SETTINGS);
  const [chart, setChart] = useState("");
  const [latest, setLatest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Every Convex query is skipped when the backend is unreachable, so a dead
  // deployment pauses the shared features instead of blanking the studio.
  const queryArgs = token && online ? { token } : "skip";

  const customTerms = useQuery(api.terms.listTerms, queryArgs);
  const auditRows = useQuery(api.utterances.listUtterances, queryArgs);
  const summary = useQuery(api.utterances.auditSummary, queryArgs);
  const recordUtterance = useMutation(api.utterances.recordUtterance);
  const addTerm = useMutation(api.terms.addTerm);
  const removeTerm = useMutation(api.terms.removeTerm);
  const clearUtterances = useMutation(api.utterances.clearUtterances);
  const startSession = useMutation(api.session.startSession);

  const extraTerms = useMemo<CustomTerm[]>(
    () =>
      (customTerms ?? []).map((row) => ({
        source: row.source,
        en: row.en,
        tier: row.tier,
        category: row.category as CustomTerm["category"],
      })),
    [customTerms],
  );

  const onCommit = useCallback(
    (processed: ProcessedUtterance) => {
      if (settings.autoInsert) setChart((previous) => appendTo(previous, processed.plain));
      if (!settings.auditTrail || !token || !online) return;
      void recordUtterance({
        token,
        raw: processed.raw,
        normalized: processed.normalized,
        final: processed.plain,
        flags: processed.flags.map((flag) => ({
          kind: flag.kind,
          severity: flag.severity,
          term: flag.term,
          detail: flag.detail,
          value: flag.value,
          unit: flag.unit,
        })),
        pipelineMs: processed.stats.pipelineMs,
      }).catch(() => undefined);
    },
    [recordUtterance, settings.auditTrail, settings.autoInsert, token, online],
  );

  const dictation = useDictation({ engine, settings, extraTerms, onCommit });
  const toggleRef = useRef<() => void>(() => undefined);
  const clearRef = useRef<() => void>(() => undefined);
  toggleRef.current = () => void toggle();
  clearRef.current = dictation.clear;

  // F6 toggles dictation and F8 clears the session, so a clinician never has to
  // look away from the chart they are filling in.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "F6") {
        event.preventDefault();
        toggleRef.current();
      }
      if (event.key === "F8") {
        event.preventDefault();
        clearRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (dictation.committed[0]) setLatest(dictation.committed[0].processed.plain);
  }, [dictation.committed]);

  // Switching engines must not leave a decoder from the previous one running.
  useEffect(() => {
    dictation.resetEngine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  async function toggle() {
    if (dictation.listening) {
      await dictation.stop();
      return;
    }
    setBusy(true);
    setLatest(null);
    if (token && online) {
      void startSession({ token, title: "Studio dictation", engine }).catch(() => undefined);
    }
    await dictation.start();
    setBusy(false);
  }

  async function handleAddTerm(source: string, en: string, tier: 1 | 2 | 3, category: string) {
    if (!token || !online) throw new Error("Custom terms need the backend. It is currently unreachable.");
    setBusy(true);
    try {
      await addTerm({ token, source, en, tier, category });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveTerm(id: Id<"customTerms">) {
    if (!token || !online) return;
    setBusy(true);
    try {
      await removeTerm({ token, id });
    } finally {
      setBusy(false);
    }
  }

  async function handleClearAudit() {
    if (!token || !online) return;
    setBusy(true);
    try {
      await clearUtterances({ token });
    } finally {
      setBusy(false);
    }
  }

  const level = Math.max(0, Math.min(1, (dictation.levelDb + 70) / 70));
  const rows: AuditRow[] = (auditRows ?? []) as AuditRow[];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md border border-primary/40 bg-primary/10">
              <Waves className="h-4 w-4 text-primary" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Studio</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {engine === "rehearsal" ? "Rehearsal source" : "Shenava tract streaming"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {summary ? (
              <div className="hidden items-center gap-2 md:flex">
                <Badge tone="neutral">{summary.utterances} utterances</Badge>
                {summary.dangerous > 0 ? (
                  <Badge tone="danger">{summary.dangerous} critical</Badge>
                ) : (
                  <Badge tone="ok">no critical flags</Badge>
                )}
              </div>
            ) : null}
            <span className="hidden text-xs text-muted-foreground sm:block">{user?.name}</span>
            <Button size="sm" variant="ghost" onClick={() => void signOut()}>
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="container grid gap-6 py-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          {!online ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-xs leading-6 text-warn">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                The backend is unreachable, so accounts, the shared audit trail and your custom terms are
                paused. Dictation, the terminology engine and the safety checks all keep working — they run
                entirely in this browser.
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                  tab === item.id
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              {tab === "dictation" ? (
                <>
                  <Panel>
                    <PanelHeader
                      title="Live dictation"
                      hint={
                        engine === "rehearsal"
                          ? "Replaying scripted Persian through the exact same pipeline the microphone uses. Use it to learn the output, not to judge accuracy."
                          : "Streaming from the Shenava tract decoder. Speak medical terms in Persian; the terminology stage renders them in English."
                      }
                      action={
                        <div className="flex items-center gap-2">
                          <Badge tone={dictation.listening ? "ok" : "neutral"}>
                            {dictation.listening ? "listening" : "idle"}
                          </Badge>
                          {dictation.latencyMs !== null ? (
                            <span className="tabnum text-[11px] text-muted-foreground">
                              {dictation.latencyMs} ms
                            </span>
                          ) : null}
                        </div>
                      }
                    />

                    <div className="space-y-5 p-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          variant={dictation.listening ? "danger" : "primary"}
                          onClick={() => void toggle()}
                          disabled={busy}
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : dictation.listening ? (
                            <Square className="h-4 w-4" />
                          ) : engine === "rehearsal" ? (
                            <Play className="h-4 w-4" />
                          ) : (
                            <Mic className="h-4 w-4" />
                          )}
                          {dictation.listening
                            ? "Stop"
                            : engine === "rehearsal"
                              ? "Run rehearsal"
                              : "Start dictation"}
                        </Button>

                        <span className="hidden items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground md:flex">
                          <kbd className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono">F6</kbd>
                          toggle
                          <kbd className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono">F8</kbd>
                          clear
                        </span>

                        <Button variant="ghost" onClick={dictation.clear} disabled={dictation.committed.length === 0}>
                          <MicOff className="h-4 w-4" />
                          Clear session
                        </Button>

                        <div className="ms-auto flex items-center gap-3">
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">level</span>
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-primary transition-[width] duration-100"
                              style={{ width: `${Math.round(level * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <AnimatePresence>
                        {dictation.notice ? (
                          <motion.p
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/[0.07] px-3 py-2 text-[11px] leading-6 text-primary"
                          >
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {dictation.notice}
                          </motion.p>
                        ) : null}
                        {dictation.error ? (
                          <motion.p
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            role="alert"
                            className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] leading-6 text-danger"
                          >
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {dictation.error}
                          </motion.p>
                        ) : null}
                      </AnimatePresence>

                      <div className="rounded-md border border-border/70 bg-background/50 p-4">
                        <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                          partial hypothesis
                        </p>
                        <p
                          dir="rtl"
                          className="bidi-surface min-h-[3.5rem] text-sm leading-8 text-muted-foreground"
                        >
                          {dictation.partial || (
                            <span className="text-muted-foreground/60">
                              {dictation.listening ? "…" : "Start to see the live hypothesis."}
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="space-y-3">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          committed this session
                        </p>
                        {dictation.committed.length === 0 ? (
                          <p className="py-6 text-center text-xs leading-6 text-muted-foreground">
                            Nothing committed yet. Each finished utterance lands here after the full
                            rule pipeline has run.
                          </p>
                        ) : (
                          dictation.committed.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-md border border-border/70 bg-background/40 p-4"
                            >
                              <TranscriptView pieces={item.processed.pieces} testId="committed-note" />
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                                <span className="tabnum">
                                  {item.processed.stats.latinTerms} Latin terms
                                </span>
                                <span className="tabnum">· {item.processed.stats.numbers} numbers</span>
                                <span className="tabnum">· {item.processed.stats.pipelineMs} ms</span>
                                {item.processed.stats.flags > 0 ? (
                                  <Badge tone="warn">{item.processed.stats.flags} flags</Badge>
                                ) : null}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </Panel>

                  <FlagsPanel flags={dictation.flags} />
                </>
              ) : null}

              {tab === "terminology" ? (
                <LexiconManager
                  rows={customTerms ?? []}
                  onAdd={handleAddTerm}
                  onRemove={handleRemoveTerm}
                  busy={busy}
                />
              ) : null}

              {tab === "audit" ? (
                <AuditTrail rows={rows} onClear={() => void handleClearAudit()} clearing={busy} />
              ) : null}

              {tab === "engine" ? (
                <EnginePanel
                  engine={engine}
                  onEngineChange={setEngine}
                  settings={settings}
                  onSettingsChange={setSettings}
                  extraTerms={extraTerms}
                />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>

        <aside className="space-y-6">
          <ChartTarget
            value={chart}
            onChange={setChart}
            lastFinal={settings.autoInsert ? null : latest}
            onInsert={(text) => setChart((previous) => appendTo(previous, text))}
          />

          <Panel>
            <PanelHeader title="Session" hint="Audio never leaves this machine and is never written to disk." />
            <div className="space-y-3 p-5 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Engine</span>
                <span className="flex items-center gap-2 text-foreground">
                  <Cpu className="h-3.5 w-3.5 text-primary" />
                  {engine === "rehearsal" ? "Rehearsal" : "Shenava tract"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Committed</span>
                <span className="tabnum text-foreground">{dictation.committed.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Custom terms</span>
                <span className="tabnum text-foreground">{customTerms?.length ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Audit entries</span>
                <span className="tabnum text-foreground">{rows.length}</span>
              </div>
              <Link
                to="/"
                className="block pt-1 text-center text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Back to overview
              </Link>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function EnginePanel({
  engine,
  onEngineChange,
  settings,
  onSettingsChange,
  extraTerms,
}: {
  engine: Engine;
  onEngineChange: (engine: Engine) => void;
  settings: DictationSettings;
  onSettingsChange: (settings: DictationSettings) => void;
  extraTerms: CustomTerm[];
}) {
  const hotwordCount = buildHotwords(extraTerms).length;

  function downloadHotwords() {
    const blob = new Blob([hotwordsAsText(extraTerms)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hotwords_medical.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader
          title="Decoder"
          hint="Shenava Koochik runs as a single Rust binary on your machine or on a server inside the hospital network. No cloud, no key, no telemetry."
        />
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/70 bg-background/40 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">Decoder hotwords</p>
              <p className="mt-1 text-[11px] leading-6 text-muted-foreground">
                {hotwordCount} clinical phrases, derived from the same lexicon the terminology stage
                uses. Load them into the decoder to bias recognition toward medical vocabulary before
                the rules ever run.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={downloadHotwords}>
              <Download className="h-3.5 w-3.5" />
              Download hotwords_medical.txt
            </Button>
          </div>

          <Field label="Source" hint="Rehearsal replays scripted Persian so you can evaluate the rules. The live decoder needs a reachable Shenava server.">
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  { id: "rehearsal" as const, title: "Rehearsal source", body: "Scripted cases, full pipeline" },
                  { id: "shenava" as const, title: "Shenava tract", body: "Live microphone streaming" },
                ]
              ).map((option) => (
                <button
                  key={option.id}
                  onClick={() => onEngineChange(option.id)}
                  className={`rounded-md border p-4 text-start transition-colors ${
                    engine === option.id
                      ? "border-primary/50 bg-primary/[0.08]"
                      : "border-border bg-background/40 hover:border-border/80"
                  }`}
                >
                  <div className="text-sm font-medium text-foreground">{option.title}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{option.body}</div>
                </button>
              ))}
            </div>
          </Field>

          {engine === "shenava" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Websocket endpoint" htmlFor="decoder-url">
                <Input
                  id="decoder-url"
                  dir="ltr"
                  value={settings.decoderUrl}
                  onChange={(e) => onSettingsChange({ ...settings, decoderUrl: e.target.value })}
                />
              </Field>
              <Field label="Session token" hint="Optional. Sent as an Authorization header." htmlFor="decoder-token">
                <Input
                  id="decoder-token"
                  type="password"
                  dir="ltr"
                  value={settings.decoderToken}
                  onChange={(e) => onSettingsChange({ ...settings, decoderToken: e.target.value })}
                  placeholder="not required for a local decoder"
                />
              </Field>
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Endpointing and output"
          hint="Dictation is not conversation. A clinician pauses mid-sentence, so the endpoint errs long rather than cutting a thought in half."
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field
            label={`Trailing silence — ${(settings.trailingSilenceMs / 1000).toFixed(1)} s`}
            htmlFor="trailing"
          >
            <input
              id="trailing"
              type="range"
              min={600}
              max={3000}
              step={100}
              value={settings.trailingSilenceMs}
              onChange={(e) => onSettingsChange({ ...settings, trailingSilenceMs: Number(e.target.value) })}
              className="w-full accent-[hsl(var(--primary))]"
            />
          </Field>

          {(
            [
              { key: "closeUtterance" as const, label: "Close each utterance with a full stop" },
              { key: "autoInsert" as const, label: "Insert into the chart target automatically" },
              { key: "auditTrail" as const, label: "Record every utterance in the audit trail" },
            ]
          ).map((toggle) => (
            <label key={toggle.key} className="flex items-center gap-3 text-xs text-foreground">
              <input
                type="checkbox"
                checked={settings[toggle.key]}
                onChange={(e) => onSettingsChange({ ...settings, [toggle.key]: e.target.checked })}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              {toggle.label}
            </label>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="What this engine will not do"
          hint="Stated here so nobody has to discover it mid-consultation."
        />
        <ul className="space-y-2 p-5 text-xs leading-7 text-muted-foreground">
          <li className="flex gap-2">
            <Activity className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" />
            Shenava is Persian-only. Speak «سی تی اسکن», not «CT scan» — English clauses are outside
            the acoustic model entirely.
          </li>
          <li className="flex gap-2">
            <Activity className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" />
            Symptoms and narrative stay in Persian by design. Only terms that real notes write in
            Latin script are converted.
          </li>
          <li className="flex gap-2">
            <Activity className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" />
            Spoken dosage schedules stay in Persian. «دو بار در روز» is not rewritten to BID, because
            that is a semantic change, not a term substitution.
          </li>
          <li className="flex gap-2">
            <Activity className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" />
            «بر هزار» is a rate, not a range, and is never collapsed into a fraction.
          </li>
        </ul>
      </Panel>
    </div>
  );
}

export function appendTo(existing: string, addition: string): string {
  if (!existing.trim()) return addition;
  const needsSpace = !/[\s\n]$/.test(existing) && !/^[\s\n.,،؛]/.test(addition);
  return `${existing}${needsSpace ? " " : ""}${addition}`;
}
