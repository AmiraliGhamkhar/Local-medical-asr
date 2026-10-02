/**
 * The deterministic clinical text pipeline.
 *
 * Stage order is a safety property, not a style choice:
 *
 *   0  normalise      canonicalise script, digits, whitespace
 *   1  numbers        freeze every spoken number
 *   2  units          fold the unit into the number it belongs to
 *   3  negation       freeze negation cues and record their scope
 *   4  terminology    Persian -> English, tiered, only on free text
 *   5  punctuation    spoken commands, then close the utterance
 *   6  plausibility   flag physiologically impossible values
 *   7  bidi           fence Latin runs, produce copy/paste-ready text
 *
 * No model, no sampling, no temperature. The same audio always yields the
 * same text, and every span a stage touched is recoverable from the audit
 * record built here.
 */

import { normalizePersian, tidySpacing } from "./normalize";
import { protectNumbers } from "./numbers";
import { attachUnits } from "./units";
import { protectNegations } from "./negation";
import { applyTerminology, type CustomTerm } from "./terminology";
import { applyPunctuation } from "./punctuation";
import { checkPlausibility } from "./safety";
import { isolateLatinRuns, stripIsolates } from "./bidi";
import type { Piece, ProcessedUtterance, RichText, Segment } from "./types";

export interface PipelineOptions {
  extraTerms?: CustomTerm[];
  /** Append a full stop when the speaker stops talking. */
  closeUtterance?: boolean;
}

function buildPieces(rich: RichText, flags: ProcessedUtterance["flags"]): Piece[] {
  const pieces: Piece[] = [];
  const reviewTerms = new Set(
    flags.filter((f) => f.kind === "review-term").map((f) => f.term.split(" → ")[1] ?? ""),
  );

  const pushText = (text: string) => {
    // Spacing inside a segment is normalised exactly the way `assemble` and
    // `tidySpacing` normalise it downstream. Without this a multi-line segment
    // renders its newlines in the note while the copied text has none, and the
    // clinician sees something different from what lands in the chart.
    const parts = tidySpacing(text.replace(/\s+/g, " ")).split(" ").filter(Boolean);
    parts.forEach((part, index) => {
      if (index > 0) pieces.push({ text: " ", kind: "space" });
      const isLatin = /[A-Za-z0-9]/.test(part) && !/[؀-ۿ]/.test(part);
      pieces.push({
        text: part,
        kind: isLatin ? "latin" : "persian",
        mark: isLatin && reviewTerms.has(part) ? "review" : undefined,
        severity: isLatin && reviewTerms.has(part) ? "info" : undefined,
      });
    });
  };

  // Segments are emitted without the whitespace that separated them, so the
  // word before and after an inserted run would be welded together («آقای45ساله»).
  // `assemble` re-inserts a single space at each boundary; the pieces have to
  // do the same or the rendered note does not match the copied one.
  const separate = (next: string) => {
    const previous = pieces[pieces.length - 1];
    if (!previous) return;
    if (/\s$/.test(previous.text)) return;
    // Punctuation attaches to the word before it; the assembled string is run
    // through the same rule, so the pieces have to agree or the rendered note
    // reads «ندارد .» where the copied one reads «ندارد.».
    if (/^[,.;:!?%)\]»،؛؟]/.test(next)) return;
    pieces.push({ text: " ", kind: "space" });
  };

  for (const segment of rich.segments) {
    if (segment.text.length === 0) continue;
    separate(segment.text);
    if (segment.kind === "protected" && segment.value) {
      const [, unit] = segment.text.split(" ");
      pieces.push({
        text: segment.text,
        kind: "number",
        mark: segment.value.unit ? `unit: ${unit}` : undefined,
        severity: segment.value.unit ? "info" : undefined,
      });
      continue;
    }
    if (segment.kind === "protected") {
      pieces.push({ text: segment.text, kind: "persian" });
      continue;
    }
    pushText(segment.text);
  }

  // A leading or trailing separator would render as a gap the copied text does
  // not have; the assembler trims, so the pieces must too.
  while (pieces.length > 0 && pieces[0].kind === "space") pieces.shift();
  while (pieces.length > 0 && pieces[pieces.length - 1].kind === "space") pieces.pop();

  return mergeAdjacent(pieces);
}

function mergeAdjacent(pieces: Piece[]): Piece[] {
  const out: Piece[] = [];
  for (const piece of pieces) {
    const last = out[out.length - 1];
    if (last && last.kind === piece.kind && last.mark === piece.mark && last.severity === piece.severity) {
      last.text += piece.text;
    } else {
      out.push({ ...piece });
    }
  }
  return out;
}

function assemble(segments: Segment[]): string {
  return segments
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function processUtterance(raw: string, options: PipelineOptions = {}): ProcessedUtterance {
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const normalized = normalizePersian(raw);

  let rich: RichText = protectNumbers(normalized);
  rich = attachUnits(rich);
  rich = protectNegations(rich);
  rich = applyTerminology(rich, { extraTerms: options.extraTerms });
  rich = applyPunctuation(rich, { closeUtterance: options.closeUtterance ?? true });
  rich = checkPlausibility(rich);

  const spaced = tidySpacing(assemble(rich.segments));
  const logical = isolateLatinRuns(spaced);
  const plain = tidySpacing(stripIsolates(logical));

  const pieces = buildPieces(rich, rich.flags);
  const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

  return {
    raw,
    normalized,
    logical,
    plain,
    pieces,
    flags: rich.flags,
    stats: {
      latinTerms: pieces.filter((p) => p.kind === "latin").length,
      numbers: pieces.filter((p) => p.kind === "number").length,
      flags: rich.flags.length,
      pipelineMs: Math.round((endedAt - startedAt) * 100) / 100,
    },
  };
}

export type { CustomTerm } from "./terminology";
export * from "./types";
