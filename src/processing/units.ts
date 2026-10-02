/**
 * Unit canonicalisation.
 *
 * Runs immediately after number recognition and folds a spoken unit into the
 * protected numeric span, so a dose always leaves this stage as one atomic
 * `500 mg` token that nothing downstream can split.
 */

import type { RichText, Segment } from "./types";
import { joinTokens, segmentTokens, segmentWords, wordTokenIndexes } from "./normalize";
import { LEXICON, CONFUSABLE_GROUPS } from "../data/lexicon";

interface UnitRule {
  canonical: string;
  /** Word sequences, longest first. */
  forms: string[][];
  /** Only attach when the number was in this context. */
  contexts?: NonNullable<Segment["value"]>["context"][];
  /** Only attach when the number is in a range. */
  rangesOnly?: boolean;
}

export const UNIT_RULES: UnitRule[] = [
  { canonical: "mmol/L", forms: [["میلی", "مول", "بر", "لیتر"], ["میلی", "مول", "بر", "لی"]] },
  { canonical: "mg/dL", forms: [["میلی", "گرم", "بر", "دسی", "لیتر"], ["میلی", "گرم", "بر", "دسی", "لی"]] },
  { canonical: "g/dL", forms: [["گرم", "بر", "دسی", "لیتر"], ["گرم", "بر", "دسی", "لی"]] },
  { canonical: "g/dL", forms: [["گرم", "بر", "لیتر", "خون"]] },
  { canonical: "mmHg", forms: [["میلی", "متر", "جیوه"], ["میلی‌متر", "جیوه"], ["میلی", "متر", "مرکب", "جیوه"]], rangesOnly: true },
  { canonical: "mEq/L", forms: [["میلی", "اکی", "والان", "بر", "لیتر"], ["میلی", "اکی", "والان"]] },
  { canonical: "kg/m²", forms: [["کیلوگرم", "بر", "متر", "مربع"], ["کیلو", "بر", "متر", "مربع"]] },
  { canonical: "mL", forms: [["میلی", "لیتر"], ["میلی", "لیتر"], ["سی", "سی"], ["سی", "سی", "یو"], ["سی‌سی"]] },
  { canonical: "mg", forms: [["میلی", "گرم"], ["میلی", "گرام"], ["میلی‌گرم"], ["میلی", "گرم"]] },
  { canonical: "mcg", forms: [["میکروگرم"], ["میکرو", "گرم"], ["میکرو", "گرام"], ["میکرو", "میلی", "گرم"]] },
  { canonical: "mg", forms: [["گرم"], ["گرام"]] },
  { canonical: "kg", forms: [["کیلوگرم"], ["کیلو", "گرم"]] },
  { canonical: "L", forms: [["لیتر"], ["لیتر"]] },
  { canonical: "mm", forms: [["میلی", "متر"], ["میلی‌متر"]] },
  { canonical: "cm", forms: [["سانتی", "متر"], ["سانتی‌متر"]] },
  { canonical: "bpm", forms: [["ضربان", "در", "دقیقه"], ["در", "دقیقه"], ["بار", "در", "دقیقه"]] },
  { canonical: "°C", forms: [["درجه", "سانتی", "گراد"], ["درجه", "سانتی‌گراد"], ["درجه", "سانتیگراد"], ["درجه"]] },
  { canonical: "IU", forms: [["واحد"], ["یو"]] },
];

function matchForm(words: string[], at: number, form: string[]): number {
  for (let offset = 0; offset < form.length; offset += 1) {
    if (words[at + offset] !== form[offset]) return -1;
  }
  return form.length;
}

/**
 * Clinical phrases that start the same way as a spoken unit.
 *
 * «سی سی» is both thirty cubic centimetres and CCU's first two syllables. If
 * a longer term starts at the same position, it wins: substituting a unit where
 * a ward name belongs would corrupt the note.
 */
const PHRASES: string[][] = (() => {
  const sources: string[] = [];
  for (const group of Object.values(LEXICON)) for (const [source] of group) sources.push(source);
  for (const group of CONFUSABLE_GROUPS) sources.push(...group);
  for (const rule of UNIT_RULES) for (const form of rule.forms) sources.push(form.join(" "));
  return sources.map(segmentWords).filter((words) => words.length > 1);
})();

function longestPhraseAt(words: string[], at: number): number {
  let longest = 0;
  for (const phrase of PHRASES) {
    if (matchForm(words, at, phrase) > 0) longest = Math.max(longest, phrase.length);
  }
  return longest;
}

function findUnitAt(words: string[], at: number): { rule: UnitRule; length: number } | null {
  let best: { rule: UnitRule; length: number } | null = null;
  for (const rule of UNIT_RULES) {
    for (const form of rule.forms) {
      const length = matchForm(words, at, form);
      if (length > 0 && (best === null || length > best.length)) {
        best = { rule, length };
      }
    }
  }
  if (!best) return null;
  // A longer clinical phrase starting here outranks a shorter unit form.
  if (longestPhraseAt(words, at) > best.length) return null;
  return best;
}

/**
 * Stage 2: attach a canonical unit to the number that precedes it.
 * The unit is merged into the protected segment, so `پانصد میلی گرم` becomes
 * the single atomic token `500 mg`.
 */
export function attachUnits(rich: RichText): RichText {
  const segments = rich.segments.map((segment) => ({ ...segment }));

  for (let index = 0; index < segments.length - 1; index += 1) {
    const numeric = segments[index];
    const next = segments[index + 1];
    if (numeric.kind !== "protected" || !numeric.value || numeric.value.unit) continue;
    if (next.kind !== "text") continue;

    const words = segmentWords(next.text);
    if (words.length === 0) continue;

    const hit = findUnitAt(words, 0);
    if (!hit) continue;
    if (hit.rule.rangesOnly && numeric.value.context !== "bp") continue;
    if (hit.rule.contexts && !hit.rule.contexts.includes(numeric.value.context ?? "generic")) continue;

    numeric.value.unit = hit.rule.canonical;
    numeric.text = `${numeric.text} ${hit.rule.canonical}`;

    // Cut by token index, not by word count. `میلی‌گرم` matches as two words but
    // occupies three tokens, so slicing the token list by the word count leaves
    // a dangling `گرم` behind and the note reads `500 mg گرم`.
    const tokens = segmentTokens(next.text);
    const wordAt = wordTokenIndexes(tokens);
    const cut = hit.length < wordAt.length ? wordAt[hit.length] : tokens.length;
    next.text = joinTokens(tokens.slice(cut));

    if (next.text.length === 0) {
      segments.splice(index + 1, 1);
    }
  }

  return { segments: segments.filter((s) => s.text.length > 0), flags: rich.flags };
}
