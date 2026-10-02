/**
 * BiDi assembly.
 *
 * Persian notes with English clinical terms pasted into Word, an EHR or a web
 * form are one of the most reliable ways to produce a mangled document: neutral
 * characters get resolved against the wrong paragraph direction and Arabic
 * letters lose their joining. The fix is to fence every Latin run in a
 * Unicode directional isolate, and to let the host application resolve
 * directionality itself rather than pre-reordering characters by hand.
 */

import { FSI, PDI } from "./normalize";

/** Characters that can start an isolated run. */
const LTR_START = "A-Za-z0-9°";
/** Characters that may appear inside an isolated run. */
const LTR_INNER = "A-Za-z0-9+./%×⁻²°⁰¹²³\\-";

/**
 * A run is a Latin/numeric stretch, optionally containing single spaces when
 * both sides are still Latin — which is what keeps `CT scan` and `type 2 DM`
 * as one isolate rather than two.
 */
const LTR_RUN = new RegExp(`[${LTR_START}][${LTR_INNER}]*(?:[ ][${LTR_START}][${LTR_INNER}]*)*`, "g");
const HAS_LATIN = /[A-Za-z]/;
const LEADING_PUNCT = /^[.,;:!?]+/;
const TRAILING_PUNCT = /[.,;:!?]+$/;

/**
 * Wrap maximal Latin/alphanumeric runs in FSI…PDI.
 *
 * Sentence punctuation is deliberately left outside the isolate: a full stop
 * inside an LTR run at the end of an RTL sentence resolves its direction
 * against the wrong paragraph and lands on the wrong side of the line.
 *
 * Pure-digit runs are left alone: they resolve correctly inside Persian text
 * and wrapping them adds invisible noise to every note.
 */
export function isolateLatinRuns(input: string): string {
  let out = "";
  let cursor = 0;

  for (const match of input.matchAll(LTR_RUN)) {
    const start = match.index ?? 0;
    let run = match[0];

    const lead = LEADING_PUNCT.exec(run);
    if (lead) run = run.slice(lead[0].length);
    const tail = TRAILING_PUNCT.exec(run);
    if (tail) run = run.slice(0, run.length - tail[0].length);

    if (!HAS_LATIN.test(run)) continue;

    out += input.slice(cursor, start);
    out += (lead?.[0] ?? "") + FSI + run + PDI + (tail?.[0] ?? "");
    cursor = start + match[0].length;
  }

  return out + input.slice(cursor);
}

/** Remove the isolates so the text can be exported, searched or hashed plainly. */
export function stripIsolates(input: string): string {
  return input.replace(/[⁦-⁩]/g, "");
}

/**
 * Direction of a string as a host application would resolve it with
 * `unicode-bidi: plaintext`: Persian script wins, otherwise Latin.
 */
export function baseDirection(text: string): "rtl" | "ltr" {
  return /[؀-ۿݐ-ݿ]/.test(text) ? "rtl" : "ltr";
}