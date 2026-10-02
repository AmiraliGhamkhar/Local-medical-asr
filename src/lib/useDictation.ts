import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MicrophoneCapture } from "../audio/mic";
import type { VadOptions } from "../audio/vad";
import { RehearsalProvider, REHEARSAL_CASES } from "../stt/rehearsal";
import { ShenavaProvider } from "../stt/shenava";
import type { PartialTranscript, SttError, SttProvider, SttState } from "../stt/provider";
import { processUtterance, type CustomTerm } from "../processing/pipeline";
import type { ProcessedUtterance, SafetyFlag } from "../processing/types";

export type Engine = "rehearsal" | "shenava";

export interface CommittedUtterance {
  id: string;
  at: number;
  processed: ProcessedUtterance;
}

export interface DictationSettings {
  /** Trailing silence before an utterance is committed. */
  trailingSilenceMs: number;
  /** Close each committed utterance with a full stop. */
  closeUtterance: boolean;
  /** Append the processed text to the chart target automatically. */
  autoInsert: boolean;
  /** Record every committed utterance to the audit trail. */
  auditTrail: boolean;
  decoderUrl: string;
  decoderToken: string;
}

export const DEFAULT_SETTINGS: DictationSettings = {
  trailingSilenceMs: 1400,
  closeUtterance: true,
  autoInsert: false,
  auditTrail: true,
  decoderUrl: "ws://127.0.0.1:3000/stream",
  decoderToken: "",
};

interface Options {
  engine: Engine;
  settings: DictationSettings;
  extraTerms: CustomTerm[];
  onCommit?: (processed: ProcessedUtterance) => void;
}

export interface DictationState {
  state: SttState;
  listening: boolean;
  partial: string;
  levelDb: number;
  committed: CommittedUtterance[];
  flags: SafetyFlag[];
  notice: string | null;
  error: string | null;
  latencyMs: number | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
  resetEngine: () => void;
  note: string;
}

let counter = 0;

export function useDictation({ engine, settings, extraTerms, onCommit }: Options): DictationState {
  const [state, setState] = useState<SttState>("idle");
  const [partial, setPartial] = useState("");
  const [levelDb, setLevelDb] = useState(-120);
  const [committed, setCommitted] = useState<CommittedUtterance[]>([]);
  const [flags, setFlags] = useState<SafetyFlag[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const providerRef = useRef<SttProvider | null>(null);
  const micRef = useRef<MicrophoneCapture | null>(null);
  const engineRef = useRef(engine);
  const termsRef = useRef(extraTerms);
  const settingsRef = useRef(settings);
  const onCommitRef = useRef(onCommit);

  engineRef.current = engine;
  termsRef.current = extraTerms;
  settingsRef.current = settings;
  onCommitRef.current = onCommit;

  const vadOptions = useMemo<Partial<VadOptions>>(
    () => ({ trailingSilenceMs: settings.trailingSilenceMs }),
    [settings.trailingSilenceMs],
  );

  const handleFinal = useCallback((result: PartialTranscript) => {
    const startedAt = performance.now();
    const processed = processUtterance(result.text, {
      extraTerms: termsRef.current,
      closeUtterance: settingsRef.current.closeUtterance,
    });
    setPartial("");
    setLatencyMs(Math.round(performance.now() - startedAt));
    setCommitted((previous) => [
      { id: `u${(counter += 1)}`, at: Date.now(), processed },
      ...previous,
    ]);
    setFlags((previous) => [...processed.flags, ...previous].slice(0, 80));
    setNote((previous) => joinNote(previous, processed.plain));
    onCommitRef.current?.(processed);
  }, []);

  const buildProvider = useCallback((): SttProvider => {
    if (engineRef.current === "shenava") {
      return new ShenavaProvider({
        url: settingsRef.current.decoderUrl,
        token: settingsRef.current.decoderToken || undefined,
      });
    }
    const rehearsal = new RehearsalProvider(REHEARSAL_CASES);
    rehearsal.setQueue(REHEARSAL_CASES);
    return rehearsal;
  }, []);

  const start = useCallback(async () => {
    if (providerRef.current) return;
    setError(null);
    setNotice(null);
    setCommitted([]);
    setFlags([]);
    setNote("");

    const provider = buildProvider();
    providerRef.current = provider;

    try {
      await provider.start({
        onStateChange: setState,
        onPartial: (result) => setPartial(result.text),
        onFinal: handleFinal,
        onNotice: setNotice,
        onError: (err: SttError) => setError(err.message),
      });
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Could not start the decoder.");
      providerRef.current = null;
      return;
    }

    if (engineRef.current === "shenava") {
      const mic = new MicrophoneCapture({
        ...vadOptions,
        onLevel: setLevelDb,
        onUtterance: (pcm) => {
          providerRef.current?.send(pcm);
          providerRef.current?.commit();
        },
      });
      micRef.current = mic;
      try {
        await mic.start();
      } catch {
        setError("Microphone access was denied. Allow it in your browser settings to dictate.");
        await provider.stop();
        providerRef.current = null;
        micRef.current = null;
        setState("idle");
        return;
      }
    }

    setState("listening");
  }, [buildProvider, handleFinal, vadOptions]);

  const stop = useCallback(async () => {
    micRef.current?.flush();
    micRef.current?.stop();
    micRef.current = null;
    await providerRef.current?.stop();
    providerRef.current = null;
    setState("idle");
    setPartial("");
  }, []);

  const clear = useCallback(() => {
    setCommitted([]);
    setNote("");
    setFlags([]);
    setLatencyMs(null);
  }, []);

  const resetEngine = useCallback(() => {
    void stop();
  }, [stop]);

  useEffect(() => () => {
    micRef.current?.stop();
    void providerRef.current?.stop();
  }, []);

  return {
    state,
    listening: state === "listening",
    partial,
    levelDb,
    committed,
    flags,
    notice,
    error,
    latencyMs,
    start,
    stop,
    clear,
    resetEngine,
    note,
  };
}

function joinNote(existing: string, addition: string): string {
  if (!existing.trim()) return addition;
  const needsSpace = !/[\s\n]$/.test(existing) && !/^[\s\n.,،؛]/.test(addition);
  return `${existing}${needsSpace ? " " : ""}${addition}`;
}
