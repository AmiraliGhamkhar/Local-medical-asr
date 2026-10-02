/**
 * Spoken-Persian number recognition.
 *
 * Recognised numbers are immediately lifted into `protected` segments so that
 * no later stage — no matter how confident it is — can rewrite a dose, a
 * blood-pressure reading or a lab value. A number bug here is a drug-dose bug.
 *
 * The parser also has to survive Persian orthography colliding with clinical
 * vocabulary: `سی تی` ("CT") and `دیابت تایپ دو` both contain number words.
 * A guard list built from the terminology lexicon suppresses any number whose
 * span overlaps a known clinical phrase.
 */

import type { RichText, Segment } from "./types";
import { joinTokens, segmentTokens, segmentWords, wordTokenIndexes } from "./normalize";
import { LEXICON, CONFUSABLE_GROUPS, VOICE_COMMANDS } from "../data/lexicon";
import { UNIT_RULES } from "./units";

const DIGITS: Record<string, number> = {
  "صفر": 0, "یک": 1, "دو": 2, "سه": 3, "چهار": 4, "پنج": 5, "شش": 6, "هفت": 7,
  "هشت": 8, "نه": 9, "یه": 1, "اول": 1, "دوم": 2, "سوم": 3,
};

const TEENS: Record<string, number> = {
  "ده": 10, "یازده": 11, "دوازده": 12, "سیزده": 13, "چهارده": 14, "پانزده": 15,
  "شانزده": 16, "هفده": 17, "هجده": 18, "نوزده": 19,
};

const TENS: Record<string, number> = {
  "بیست": 20, "سی": 30, "چهل": 40, "پنجاه": 50, "شصت": 60,
  "هفتاد": 70, "هشتاد": 80, "نود": 90,
};

/**
 * Hundreds combine additively inside a group but scale a preceding digit:
 * «سیصد» is 300 on its own, while «شانزده صد» is 16 × 100.
 */
const HUNDREDS: Record<string, number> = {
  "صد": 100, "یکصد": 100,
  "دویست": 200, "سیصد": 300, "چهارصد": 400, "پانصد": 500, "ششصد": 600,
  "هفتصد": 700, "هشتصد": 800, "هستصد": 800, "نهصد": 900,
};

/** Multipliers scale the whole group in front of them: «دویست و پنجاه هزار» is 250000. */
const MULTIPLIERS: Record<string, number> = {
  "هزار": 1_000,
  "میلیون": 1_000_000,
  "میلیارد": 1_000_000_000,
};

const DECIMALS: Record<string, number> = {
  "دهم": 0.1, "صدم": 0.01, "هزارم": 0.001,
};

const FRACTIONS: Record<string, number> = {
  "نیم": 0.5, "ربع": 0.25, "ثلث": 1 / 3,
};

/** Range connector for blood-pressure readings. `بر` is deliberately excluded. */
const RANGE_SEPARATOR = "روی";
const PERCENT_WORD = "درصد";
const APPROX_WORD = "حدود";
const AND = "و";
const MAX_NUMBER_WORDS = 14;

export interface NumberMatch {
  /** Word span [start, end) that produced the value. */
  start: number;
  end: number;
  raw: string;
  value: number;
  /** Present when the match was `A روی B` (a blood-pressure reading). */
  range?: [number, number];
  approximate: boolean;
  percent: boolean;
}

function isNumberish(word: string): boolean {
  return (
    word in DIGITS || word in TEENS || word in TENS || word in HUNDREDS || word in MULTIPLIERS ||
    word in DECIMALS || word in FRACTIONS
  );
}

function startsNumber(words: string[], from: number): boolean {
  const word = words[from];
  return word !== undefined && isNumberish(word) && barrierAt(words, from) === 0;
}

interface Accumulator {
  value: number;
  consumed: number;
}

/**
 * Read a Persian number starting at `from`, stopping before `stop`.
 * Returns null when the span does not begin a number.
 */
function readNumber(words: string[], from: number, stop = words.length): Accumulator | null {
  let total = 0;
  let current = 0;
  let seen = false;
  let consumed = 0;

  for (let i = from; i < stop && consumed < MAX_NUMBER_WORDS; i += 1) {
    if (i > from && barrierAt(words, i) > 0) break;
    const word = words[i];

    if (word === AND) {
      const next = words[i + 1];
      if (next === undefined || i + 1 >= stop) break;
      const continues =
        DECIMALS[next] !== undefined || FRACTIONS[next] !== undefined ||
        DIGITS[next] !== undefined || TENS[next] !== undefined ||
        TEENS[next] !== undefined || HUNDREDS[next] !== undefined ||
        MULTIPLIERS[next] !== undefined;
      if (!continues) break;
      consumed += 1;
      continue;
    }

    if (word in HUNDREDS) {
      // «شانزده صد» scales the digits in front of it; otherwise it adds.
      current = current > 0 && current < 100 ? current * HUNDREDS[word] : current + HUNDREDS[word];
      seen = true;
      consumed += 1;
      continue;
    }

    if (word in MULTIPLIERS) {
      total += (current === 0 ? 1 : current) * MULTIPLIERS[word];
      current = 0;
      seen = true;
      consumed += 1;
      continue;
    }

    // Denominators and named fractions are resolved by the caller, which needs
    // to know where the integer part stopped.
    if (DECIMALS[word] !== undefined || FRACTIONS[word] !== undefined) break;

    if (TEENS[word] !== undefined) {
      current += TEENS[word];
    } else if (TENS[word] !== undefined) {
      current += TENS[word];
    } else if (DIGITS[word] !== undefined) {
      current += DIGITS[word];
    } else {
      break;
    }
    seen = true;
    consumed += 1;
  }

  if (!seen || consumed === 0) return null;
  return { value: total + current, consumed };
}

/**
 * Resolve a denominator word such as `دهم`.
 *
 * `سی و دو و پنج دهم` is 32.5, not 3.7: the words after the last `و` are the
 * numerator and everything before it is the integer part. With no such split
 * (`سی و دو دهم`) the whole span is the numerator.
 */
function resolveDecimal(words: string[], from: number, stop: number, denom: number): number | null {
  let lastAnd = -1;
  for (let i = from; i < stop; i += 1) {
    if (words[i] === AND) lastAnd = i;
  }

  if (lastAnd > from) {
    const head = readNumber(words, from, lastAnd);
    const tail = readNumber(words, lastAnd + 1, stop);
    if (head && tail) return head.value + tail.value * denom;
  }

  const whole = readNumber(words, from, stop);
  return whole ? whole.value * denom : null;
}

function format(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 1e6) / 1e6);
}

export function renderNumber(match: NumberMatch): string {
  const prefix = match.approximate ? "~" : "";
  if (match.range) return `${prefix}${match.range[0]}/${match.range[1]}`;
  return `${prefix}${format(match.value)}${match.percent ? "%" : ""}`;
}

/** Clinical phrases and spoken unit names that begin with a number word. */
function buildBarriers(): string[][] {
  const sources: string[] = [];
  for (const group of Object.values(LEXICON)) {
    for (const [source] of group) sources.push(source);
  }
  for (const group of CONFUSABLE_GROUPS) sources.push(...group);
  for (const rule of UNIT_RULES) for (const form of rule.forms) sources.push(form.join(" "));
  sources.push(...Object.keys(VOICE_COMMANDS));

  return sources
    .map(segmentWords)
    .filter((words) => words.length > 1 && isNumberish(words[0]));
}

const BARRIERS: string[][] = buildBarriers();

function barrierAt(words: string[], index: number): number {
  let longest = 0;
  for (const barrier of BARRIERS) {
    if (index + barrier.length > words.length) continue;
    let hit = true;
    for (let offset = 0; offset < barrier.length; offset += 1) {
      if (words[index + offset] !== barrier[offset]) {
        hit = false;
        break;
      }
    }
    if (hit) longest = Math.max(longest, barrier.length);
  }
  return longest;
}

/** Clinical phrases that contain a number word and must not be parsed as one. */
function buildGuards(): string[][] {
  const sources: string[] = [];
  for (const group of Object.values(LEXICON)) {
    for (const [source] of group) sources.push(source);
  }
  for (const group of CONFUSABLE_GROUPS) sources.push(...group);

  return sources
    .map(segmentWords)
    .filter((words) => words.length > 0 && words.some(isNumberish));
}

const GUARDS: string[][] = buildGuards();

/** `N بر هزار` is a rate, not a product: the trailing scale word is not a number. */
const RATE_PREFIXES = new Set(["بر", "در", "از", "هر"]);

/** Word spans covered by a clinical phrase that must not be read as a number. */
let GUARD_SPANS: Array<[number, number]> = [];

function indexGuards(words: string[]): void {
  GUARD_SPANS = [];
  for (const guard of GUARDS) {
    for (let start = 0; start + guard.length <= words.length; start += 1) {
      let hit = true;
      for (let offset = 0; offset < guard.length; offset += 1) {
        if (words[start + offset] !== guard[offset]) {
          hit = false;
          break;
        }
      }
      if (hit) GUARD_SPANS.push([start, start + guard.length]);
    }
  }
}

/**
 * A number may not begin inside a clinical phrase.
 *
 * `سی` is both "thirty" and the first syllable of `سی تی` ("CT"), so a number
 * that starts on it and runs past the phrase swallows words that belong to a
 * term: `هموگلوبین ای وان سی هفت و نیم` must not parse as "30 seven and a half".
 * `ده سی سی` is unaffected, because that number starts outside the phrase.
 */
function startsInsideGuard(start: number): boolean {
  return GUARD_SPANS.some(([from, to]) => from <= start && start < to);
}

/** Find every spoken number in a normalised Persian string. */
export function findNumbers(text: string): NumberMatch[] {
  const words = segmentWords(text);
  indexGuards(words);
  const matches: NumberMatch[] = [];
  let i = 0;

  while (i < words.length) {
    const barrier = barrierAt(words, i);
    if (barrier > 0) {
      i += barrier;
      continue;
    }
    const approximate = words[i] === APPROX_WORD;
    const cursor = approximate ? i + 1 : i;
    if (!startsNumber(words, cursor)) {
      i += 1;
      continue;
    }

    const first = readNumber(words, cursor);
    if (!first) {
      i += 1;
      continue;
    }

    let end = cursor + first.consumed;
    let value = first.value;
    const stopWord = words[end];

    // `سی و دو و پنج دهم` -> 32.5
    if (stopWord !== undefined && DECIMALS[stopWord] !== undefined) {
      const resolved = resolveDecimal(words, cursor, end, DECIMALS[stopWord]);
      if (resolved === null) {
        i += 1;
        continue;
      }
      value = resolved;
      end += 1;
    } else if (stopWord !== undefined && FRACTIONS[stopWord] !== undefined) {
      // `دو و نیم` -> 2.5
      value = first.value + FRACTIONS[stopWord];
      end += 1;
    }

    let range: [number, number] | undefined;
    if (words[end] === RANGE_SEPARATOR) {
      const second = readNumber(words, end + 1);
      if (second && second.value < 1000) {
        range = [Math.round(value), Math.round(second.value)];
        end = end + 1 + second.consumed;
        // A trailing connective belongs to the sentence, not to the reading:
        // «نود و سی سی یو» is 90 and a ward, not 90 and a number.
        while (end > cursor && words[end - 1] === AND) end -= 1;
      }
    }

    let percent = false;
    if (words[end] === PERCENT_WORD) {
      percent = true;
      end += 1;
    }

    if (startsInsideGuard(i)) {
      i += 1;
      continue;
    }

    if (end - i === 1 && words[i] in MULTIPLIERS && i > 0 && RATE_PREFIXES.has(words[i - 1])) {
      i += 1;
      continue;
    }

    matches.push({
      start: i,
      end,
      raw: words.slice(i, end).join(" "),
      value: range ? range[0] : value,
      range,
      approximate,
      percent,
    });
    i = end;
  }

  return matches;
}

/** Stage 1: lift spoken numbers into protected segments. */export function protectNumbers(input: string): RichText {
  const words = segmentWords(input);
  const tokens = segmentTokens(input);

  // Word and token indexes are not interchangeable, so spans are translated
  // explicitly rather than sliced straight across.
  const tokenIndexOfWord = wordTokenIndexes(tokens);
  const tokenAt = (wordIndex: number) =>
    wordIndex < tokenIndexOfWord.length ? tokenIndexOfWord[wordIndex] : tokens.length;

  const matches = findNumbers(input);
  const segments: Segment[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.start < cursor) continue;
    if (match.start > cursor) {
      segments.push({ kind: "text", text: joinTokens(tokens.slice(tokenAt(cursor), tokenAt(match.start))) });
    }
    segments.push({
      kind: "protected",
      label: match.range ? "blood-pressure range" : "number",
      trigger: match.raw,
      text: renderNumber(match),
      value: {
        number: match.value,
        raw: match.raw,
        context: match.range ? "bp" : match.percent ? "percent" : "generic",
      },
    });
    cursor = match.end;
  }

  if (cursor < words.length) {
    segments.push({ kind: "text", text: joinTokens(tokens.slice(tokenAt(cursor))) });
  }

  return { segments: segments.filter((s) => s.text.length > 0), flags: [] };
}
