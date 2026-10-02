/**
 * Negation protection.
 *
 * A flipped negation is the second most dangerous medical-dictation bug after a
 * wrong dose, so negation cues are frozen before terminology substitution runs
 * and their scope is reported to the clinician. Persian verbal negation is
 * mostly prefix morphology, so cue detection is morphologically aware rather
 * than a flat word list.
 */

import type { RichText, SafetyFlag, Segment } from "./types";
import { joinTokens, segmentTokens } from "./normalize";

/**
 * Closed-class negation cues; matched as whole words.
 *
 * Only negated forms belong here. `دیده` and `مشاهده` mean "seen" and are the
 * ordinary positive half of «دیده نشد» / «مشاهده نشد», so listing them flags
 * every normal finding as a negation and teaches the clinician to ignore the
 * flag; the `ندیده` / `نمشاهده` forms below cover the real cue.
 */
const CUES = new Set([
  "ندارد", "نداشت", "نداشته", "ندارند", "نداریم", "ندارید",
  "نیست", "نیستند", "نیستیم", "نبود", "نبوده", "نشد", "نشده", "نکرد", "نکرده", "نکردند",
  "نخورد", "نخوردن", "نخورده", "نگرفت", "نگرفته", "ندید", "ندیده", "ندیدم", "نمشاهده",
  "ممنوع", "ممنوعست", "بدون", "فاقد", "منفی", "نفی", "سلب", "عدم",
  "نه", "خیر",
]);

/** Morphological prefixes: a token beginning with one of these is a negation. */
const PREFIXES = ["نمی", "ندار", "نبود", "نشد", "نکرد", "نگرفت", "نخورد", "نیست"];

/** English cues: only reachable when a term substitution produced Latin text. */
const ENGLISH_CUES = new Set([
  "no", "not", "denies", "deny", "denied", "negative", "without", "free",
  "absent", "none", "never", "neither", "nor", "rule",
]);

const SCOPE_TOKENS = 6;
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Tokens that end a clause. Negation never reaches past one: in
 * «بیمار سرفه ندارد. کاندید CT scan» the ندارد has nothing to do with the CT,
 * and telling the clinician otherwise is worse than saying nothing.
 */
const CLAUSE_BREAK = /[.!?؟۔;؛\n،]/u;

function isCue(word: string): boolean {
  const lower = word.toLowerCase();
  if (CUES.has(word) || ENGLISH_CUES.has(lower)) return true;
  return PREFIXES.some((prefix) => word.startsWith(prefix) && word.length > prefix.length + 1);
}

/**
 * Stage 3: freeze negation cues and record the tokens they scope over.
 *
 * Word order is preserved exactly. A note whose clauses were silently
 * rearranged would be worse than one with no negation handling at all, so the
 * surrounding text is flushed in place rather than collected and re-emitted.
 */
export function protectNegations(rich: RichText): RichText {
  const segments: Segment[] = [];
  const flags: SafetyFlag[] = [...rich.flags];

  for (const segment of rich.segments) {
    if (segment.kind !== "text") {
      segments.push(segment);
      continue;
    }

    const tokens = segmentTokens(segment.text);
    if (tokens.length === 0) continue;

    const wordIndexes: number[] = [];
    tokens.forEach((token, index) => {
      if (WORD_CHAR.test(token)) wordIndexes.push(index);
    });

    // A negation's scope is the clause it sits in: the words before it (Persian
    // negation is postposed — «سرفه ندارد») and the words after it, never past
    // the clause break.
    const clauseStart = (index: number): number => {
      let start = index;
      while (start > 0 && !CLAUSE_BREAK.test(tokens[start - 1])) start -= 1;
      return start;
    };
    const clauseEnd = (index: number): number => {
      let end = index + 1;
      while (end < tokens.length && !CLAUSE_BREAK.test(tokens[end])) end += 1;
      return end;
    };

    const out: Segment[] = [];
    let buffer: string[] = [];

    const flush = () => {
      if (buffer.length > 0) {
        out.push({ kind: "text", text: joinTokens(buffer) });
        buffer = [];
      }
    };

    tokens.forEach((token, index) => {
      if (!isCue(token)) {
        buffer.push(token);
        return;
      }

      flush();
      const start = clauseStart(index);
      const end = clauseEnd(index);
      const before = wordIndexes.filter((i) => i >= start && i < index).slice(-SCOPE_TOKENS);
      const after = wordIndexes
        .filter((i) => i > index && i < end)
        .slice(0, SCOPE_TOKENS);
      const scope = [...before, ...after].map((i) => tokens[i]).join(" ").trim();

      out.push({ kind: "protected", label: "negation", trigger: token, text: token });
      flags.push({
        kind: "negation-scope",
        severity: "info",
        term: token,
        detail:
          scope.length > 0
            ? `«${token}» applies to: ${scope}`
            : `«${token}» — verify the scope in the note`,
      });
    });

    flush();
    segments.push(...out);
  }

  return { segments: segments.filter((s) => s.text.length > 0), flags };
}
