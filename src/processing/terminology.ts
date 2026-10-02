/**
 * Stage 4: clinical terminology substitution.
 *
 * Tier 1 terms are rewritten silently. Tier 2 clinical terms (drugs, labs,
 * diagnoses) are rewritten but underlined so the clinician can eyeball them.
 * Tier 3 terms are never rewritten — they are acoustically or semantically
 * ambiguous, and a wrong silent rewrite here is a patient-safety incident.
 */

import { PhraseTrie } from "./fst";
import { joinTokens, segmentTokens, segmentWords, wordTokenIndexes } from "./normalize";
import { LEXICON, type Term } from "../data/lexicon";
import type { RichText, SafetyFlag, Segment } from "./types";

export interface CustomTerm {
  source: string;
  en: string;
  tier: 1 | 2 | 3;
  category: Term["category"];
}

function buildTrie(extra: CustomTerm[]): PhraseTrie<Term> {
  const entries: Array<[string[], Term]> = [];

  for (const group of Object.values(LEXICON)) {
    for (const [source, term] of group) {
      entries.push([segmentWords(source), term]);
    }
  }

  for (const term of extra) {
    entries.push([
      segmentWords(term.source),
      { en: term.en, tier: term.tier, category: term.category, note: "Added by the user." },
    ]);
  }

  // Shortest phrases first: if two entries share a key, the longer, more
  // specific one should win, so drop entries fully shadowed by another.
  const byKey = new Map<string, Term>();
  const keyed: Array<[string[], Term]> = [];
  for (const [words, term] of entries) {
    const key = words.join(" ");
    const existing = byKey.get(key);
    if (existing) {
      // Prefer the lower tier number (more trusted), then the shorter English form.
      if (term.tier < existing.tier) byKey.set(key, term);
      continue;
    }
    byKey.set(key, term);
    keyed.push([words, term]);
  }

  return new PhraseTrie<Term>(keyed);
}

export interface TerminologyOptions {
  extraTerms?: CustomTerm[];
}

export function applyTerminology(rich: RichText, options: TerminologyOptions = {}): RichText {
  const trie = buildTrie(options.extraTerms ?? []);
  const flags: SafetyFlag[] = [...rich.flags];
  const segments: Segment[] = [];

  for (const segment of rich.segments) {
    if (segment.kind !== "text") {
      segments.push(segment);
      continue;
    }

    const words = segmentWords(segment.text);
    if (words.length === 0) continue;

    const tokens = segmentTokens(segment.text);
    // Map each word index to its token index so punctuation and ZWNJ sitting
    // between two matched chunks survive the rebuild instead of being dropped.
    const tokenIndexOfWord = wordTokenIndexes(tokens);
    const tokenAt = (wordIndex: number) =>
      wordIndex < tokenIndexOfWord.length ? tokenIndexOfWord[wordIndex] : tokens.length;

    const scanned = trie.scan(words);
    const emitted: string[] = [];
    let changed = false;
    let cursor = 0;

    for (const chunk of scanned) {
      // Punctuation sitting before this chunk is emitted for every chunk, not
      // just replaced ones, otherwise a full stop between two untouched words
      // disappears on the next substitution anywhere in the sentence.
      emitted.push(...tokens.slice(cursor, tokenAt(chunk.start)));
      cursor = tokenAt(chunk.start);

      if (chunk.value === undefined) {
        emitted.push(...chunk.words);
        // Advance by the chunk's own tokens only, so punctuation that follows
        // it is still available as `leading` for the next chunk.
        cursor = tokenAt(chunk.start) + chunk.words.length;
        continue;
      }

      cursor = tokenAt(chunk.end);
      const term = chunk.value;
      const source = chunk.words.join(" ");

      if (term.tier === 3) {
        emitted.push(source);
        flags.push({
          kind: "ambiguous-term",
          severity: "warn",
          term: source,
          detail: term.note
            ? `«${source}» left in Persian — ${term.note}`
            : `«${source}» is ambiguous and was not substituted.`,
        });
        continue;
      }

      changed = true;
      emitted.push(term.en);

      if (term.tier === 2) {
        flags.push({
          kind: "review-term",
          severity: "info",
          term: `${source} → ${term.en}`,
          detail: `${term.category} substitution — confirm it matches what was said.`,
        });
      }
    }

    if (!changed) {
      segments.push(segment);
      continue;
    }

    emitted.push(...tokens.slice(cursor));
    segments.push({ kind: "text", text: joinTokens(emitted) });
  }

  return { segments: segments.filter((s) => s.text.length > 0), flags };
}
