/**
 * Hotword list generation.
 *
 * The decoder can be biased toward clinical vocabulary, which fixes a term at
 * acoustic time instead of patching it afterwards. The list is derived from the
 * same lexicon the terminology stage uses, so the two can never drift apart.
 */

import { lexiconPhrases, CONFUSABLE_GROUPS } from "../data/lexicon";
import type { CustomTerm } from "../processing/pipeline";

/**
 * Phrases the decoder should listen for.
 *
 * Confusable groups are included deliberately: biasing toward both
 * `متفورمین` and `متوپرولول` is what lets the acoustic model tell them apart
 * instead of collapsing them onto one another.
 */
export function buildHotwords(extraTerms: CustomTerm[] = []): string[] {
  const phrases = new Set<string>(lexiconPhrases());
  for (const group of CONFUSABLE_GROUPS) for (const phrase of group) phrases.add(phrase);
  for (const term of extraTerms) phrases.add(term.source);

  return [...phrases]
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 1)
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
}

export function hotwordsAsText(extraTerms: CustomTerm[] = []): string {
  return `${buildHotwords(extraTerms).join("\n")}\n`;
}
