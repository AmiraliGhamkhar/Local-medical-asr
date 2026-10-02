/**
 * Shared types for the deterministic Persian clinical text pipeline.
 *
 * The pipeline never lets a later stage rewrite an earlier stage's output.
 * Anything a machine must get exactly right (numbers, doses, units, negations)
 * is lifted into a `protected` segment immediately after it is recognised, and
 * every downstream stage skips protected segments.
 */

export type SegmentKind = "text" | "protected";

export interface NumericValue {
  /** Parsed numeric value, null when the span was non-numeric (e.g. an abbreviation). */
  number: number | null;
  /** Raw spoken form that produced this number. */
  raw: string;
  /** Canonical unit, if one was attached by the units stage. */
  unit?: string;
  /** Inferred clinical context, used by the safety checker. */
  context?: "bp" | "hr" | "spo2" | "temp" | "dose" | "lab" | "percent" | "generic";
}

export interface Segment {
  kind: SegmentKind;
  text: string;
  /** Why this span is protected — surfaced in the audit view. */
  label?: string;
  value?: NumericValue;
  /** Phrase that triggered a protection, e.g. the negation cue word. */
  trigger?: string;
}

export type MarkSeverity = "info" | "warn" | "danger";

export interface Piece {
  text: string;
  kind: "persian" | "latin" | "number" | "punct" | "space";
  /** Short human-readable note rendered as an inline underline. */
  mark?: string;
  severity?: MarkSeverity;
}

export type SafetyKind =
  | "review-term"
  | "ambiguous-term"
  | "out-of-range"
  | "unparsed"
  | "negation-scope";

export interface SafetyFlag {
  kind: SafetyKind;
  severity: MarkSeverity;
  /** What we heard / produced. */
  term: string;
  /** What the clinician should do about it. */
  detail: string;
  value?: number;
  unit?: string;
}

export interface RichText {
  segments: Segment[];
  flags: SafetyFlag[];
}

export interface ProcessedUtterance {
  /** Raw ASR string exactly as the acoustic model produced it. */
  raw: string;
  /** After Unicode/script normalisation. */
  normalized: string;
  /** Canonical reading order, LTR runs wrapped in Unicode isolates. Copy/paste ready. */
  logical: string;
  /** `logical` with isolates removed — for plain-text export, search and hashing. */
  plain: string;
  pieces: Piece[];
  flags: SafetyFlag[];
  stats: {
    latinTerms: number;
    numbers: number;
    flags: number;
    pipelineMs: number;
  };
}
