/**
 * Script normalisation for Persian ASR output.
 *
 * Shenava emits canonical Persian, but dictation can still carry Arabic
 * codepoints, Arabic-Indic digits, tatweel, harakat and stray bidi control
 * characters. Every downstream stage assumes the output of this function, so
 * it is deliberately aggressive — the audit log always keeps the raw string.
 */

export const ZWNJ = "‌";

/** Unicode directional isolates used to fence Latin runs inside Persian text. */
export const FSI = "⁨";
export const PDI = "⁩";

/** Arabic letters that Persian writes differently. */
const LETTER_MAP: Record<string, string> = {
  "ي": "ی",
  "ى": "ی",
  "ك": "ک",
  "ڪ": "ک",
  "ﯼ": "ی",
  "ﮎ": "ی",
  "ﮔ": "ک",
  "ﻙ": "ک",
};

/** Extended Arabic-Indic digits (Persian) and Arabic-Indic digits -> ASCII. */
const DIGIT_MAP: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

/** Arabic punctuation and layout characters -> ASCII or a Persian equivalent. */
const SYMBOL_MAP: Record<string, string> = {
  "٫": ".",
  "٬": ",",
  "٪": "%",
  "؍": ".",
  "٭": "*",
  "؛": "،", // Arabic semicolon -> Persian comma
  "؟": "?", // Arabic question mark
  " ": " ",
  " ": " ",
  "‏": "",
  "‎": "",
  "‪": "",
  "‫": "",
  "‬": "",
  "‭": "",
  "‮": "",
  "": "",
  "‍": "",
  "﻿": "",
  "ـ": "", // tatweel / kashida
  "“": '"',
  "”": '"',
  "‘": "'",
  "’": "'",
};

/** Harakat, tashkeel and Quranic annotation marks: never present in dictation. */
const HARAKAT = /[ً-ٰٟۖ-ࣰ-ࣿ]/g;

function mapChars(input: string, table: Record<string, string>): string {
  let out = "";
  for (const ch of input) {
    const mapped = table[ch];
    out += mapped === undefined ? ch : mapped;
  }
  return out;
}

function tidyZwnj(input: string): string {
  return input
    .replace(new RegExp(`${ZWNJ}{2,}`, "g"), ZWNJ)
    .replace(new RegExp(`${ZWNJ}(?=\\s|$)`, "g"), "")
    .replace(new RegExp(`(?<=\\s|^)${ZWNJ}`, "g"), "");
}

/** Canonicalise Arabic/Persian script, digits, spacing and layout characters. */
export function normalizePersian(input: string): string {
  let out = input.normalize("NFKC");
  out = mapChars(out, LETTER_MAP);
  out = mapChars(out, DIGIT_MAP);
  out = mapChars(out, SYMBOL_MAP);
  out = out.replace(HARAKAT, "");
  out = out.replace(/[ \t]+/g, " ").trim();
  return tidyZwnj(out);
}

/** Remove whitespace before closing punctuation and normalise spacing. */
export function tidySpacing(input: string): string {
  return input
    .replace(/\s+([,.;:!?%)])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .replace(/([,.;:!?])\s*([،؛؟])/g, "$1$2")
    .replace(/ {2,}/g, " ")
    .trim();
}

/**
 * Word separators. ZWNJ is a boundary so `میلی‌گرم` and `میلی گرم` collapse to one key.
 * Built from a character-class body so the "is this token only punctuation?"
 * test stays in sync with the split.
 */
const SEPARATOR_CLASS = "\\s\u200c\u200e\u200f\u060c\u061b\u061f!.,;:()[\\]{}\"'«»/\\\\|+*=%<>\u0640";
const SEPARATOR_RUN = new RegExp(`[${SEPARATOR_CLASS}]+`, "u");
const SEPARATOR_SPLIT = new RegExp(`([${SEPARATOR_CLASS}]+)`, "u");
const ONLY_SEPARATORS = new RegExp(`^[${SEPARATOR_CLASS}]+$`, "u");

/** A token made only of ZWNJ, i.e. an intra-word joiner rather than a break. */
const ZWNJ_ONLY = new RegExp(`^${ZWNJ}+$`, "u");

/** Punctuation that binds to the word before it. ZWNJ binds to both sides. */
const TIGHT_BEFORE = new Set([".", ",", ";", ":", "!", "?", ")", "]", "}", "»", "%", ZWNJ]);

/** Punctuation that binds to the word after it. */
const TIGHT_AFTER = new Set(["(", "[", "{", "«", "$"]);

/**
 * Split into "words" for phrase matching. Punctuation is treated as a
 * separator and discarded; use `segmentTokens` when it must survive.
 */
export function segmentWords(input: string): string[] {
  return input.split(SEPARATOR_RUN).filter(Boolean);
}

/**
 * Split into words while keeping punctuation as its own token, so a stage that
 * rebuilds a sentence from tokens does not silently delete every full stop.
 */
export function segmentTokens(input: string): string[] {
  const raw = input.split(SEPARATOR_SPLIT);
  return raw.filter((token) => token.length > 0 && !/^\s+$/u.test(token));
}

/**
 * Map word indexes onto token indexes.
 *
 * Word and token indexes are not interchangeable: word indexes drop
 * punctuation and ZWNJ, token indexes keep them. A stage that slices a token
 * list by word count has to translate through this map, or the offset lands in
 * the middle of a word and part of a spoken unit is left behind
 * (`میلی‌گرم` becomes `500 mg گرم`).
 */
export function wordTokenIndexes(tokens: string[]): number[] {
  const indexes: number[] = [];
  tokens.forEach((token, index) => {
    if (!isSeparatorToken(token)) indexes.push(index);
  });
  return indexes;
}

/**
 * True only when the token consists purely of punctuation.
 *
 * This must not be a substring test: a multi-word replacement such as
 * `CT scan` contains a space, and mistaking it for a separator silently
 * removes the space in front of it.
 */
export function isSeparatorToken(token: string): boolean {
  return ONLY_SEPARATORS.test(token);
}

/** Re-join tokens, keeping punctuation attached the way Persian typography wants it. */
export function joinTokens(tokens: string[]): string {
  let out = "";
  let previous = "";

  for (const token of tokens) {
    // ZWNJ joins the two words either side of it. Handled before the separator
    // branch, because as a separator it would rejoin as `می‌ شود` and split a
    // word that the lexicon treats as one.
    if (ZWNJ_ONLY.test(token)) {
      if (out !== "") {
        out = out.replace(/\s+$/, "") + ZWNJ;
        previous = ZWNJ;
      }
      continue;
    }

    if (isSeparatorToken(token)) {
      if (TIGHT_AFTER.has(token)) continue;
      out = out.replace(/\s+$/, "") + token;
      previous = token;
      continue;
    }
    const needsSpace = out !== "" && !TIGHT_BEFORE.has(previous) && !TIGHT_AFTER.has(previous);
    out += needsSpace ? ` ${token}` : token;
    previous = token;
  }

  return tidySpacing(out);
}
