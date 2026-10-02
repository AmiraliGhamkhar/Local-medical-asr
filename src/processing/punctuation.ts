/**
 * Stage 5: punctuation.
 *
 * Fully deterministic. A spoken command is honoured only when it is the last
 * word of the utterance, because "نقطه" is also the first half of ordinary
 * clinical phrases ("نقطه درد", "نقطه فلکس") and a mid-sentence rewrite would
 * silently corrupt the note.
 */

import { VOICE_COMMANDS } from "../data/lexicon";
import { isSeparatorToken, joinTokens, segmentTokens, tidySpacing } from "./normalize";
import type { RichText, Segment } from "./types";

const COMMAND_MAX_WORDS = 2;
const TERMINATORS = new Set([".", ",", ":", "?", "!", "،", ";", "\n", "؟"]);

export function applyPunctuation(rich: RichText, options: { closeUtterance: boolean }): RichText {
  const segments: Segment[] = [];

  for (const segment of rich.segments) {
    if (segment.kind !== "text") {
      segments.push(segment);
      continue;
    }

    const tokens = segmentTokens(segment.text);
    if (tokens.length === 0) continue;

    // Trailing punctuation already in the source is preserved, not re-derived.
    let tail = 0;
    while (tail < tokens.length && isSeparatorToken(tokens[tokens.length - 1 - tail])) tail += 1;

    const body = tokens.slice(0, tokens.length - tail);
    const trailing = tokens.slice(tokens.length - tail);

    let command: { command: string; length: number } | null = null;
    for (let length = Math.min(COMMAND_MAX_WORDS, body.length); length >= 1; length -= 1) {
      const candidate = body
        .slice(body.length - length)
        .filter((token) => !isSeparatorToken(token))
        .join(" ");
      const value = VOICE_COMMANDS[candidate];
      if (value !== undefined) {
        command = { command: value, length };
        break;
      }
    }

    if (!command) {
      segments.push(segment);
      continue;
    }

    const kept = body.slice(0, Math.max(0, body.length - command.length));
    if (kept.length > 0) {
      segments.push({ kind: "text", text: joinTokens(kept) });
    }
    segments.push({
      kind: "protected",
      label: "voice command",
      trigger: joinTokens(kept),
      text: command.command,
    });
    if (trailing.length > 0) {
      segments.push({ kind: "text", text: trailing.join("") });
    }
  }

  const out: RichText = { segments: segments.filter((s) => s.text.length > 0), flags: rich.flags };
  if (!options.closeUtterance) return out;

  const last = out.segments[out.segments.length - 1];
  if (!last) return out;

  const trimmed = last.text.trim();
  if (trimmed.length === 0) return out;
  // Already closed by the speaker or by an earlier stage: do not double it.
  if (TERMINATORS.has(trimmed.slice(-1))) return out;

  last.text = tidySpacing(`${last.text} .`);
  return out;
}
