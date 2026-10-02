import { Fragment } from "react";
import { motion } from "framer-motion";
import type { Piece } from "../../processing/types";

const MARK_CLASS: Record<string, string> = {
  info: "flag-low",
  warn: "flag-low",
  danger: "flag-critical",
};

/**
 * Renders a processed utterance span by span.
 *
 * Latin runs carry Unicode directional isolates, and the container resolves
 * direction with `unicode-bidi: plaintext`, so the browser lays the mixed
 * Persian/English text out the same way a chart will.
 */
export function TranscriptView({
  pieces,
  animate = true,
  testId,
}: {
  pieces: Piece[];
  animate?: boolean;
  /** Marks the rendered note so tests can assert on the text as a whole. */
  testId?: string;
}) {
  const content = pieces.map((piece, index) => {
    // Whitespace must be passed as an expression: JSX drops whitespace-only
// children, which would weld every word to the next one in the rendered note.
if (piece.kind === "space") return <Fragment key={index}>{piece.text}</Fragment>;
    return (
      <span
        key={index}
        className={piece.mark ? MARK_CLASS[piece.severity ?? "info"] : undefined}
        title={piece.mark}
      >
        {piece.text}
      </span>
    );
  });

  if (!animate) {
    return (
      <p dir="rtl" data-testid={testId} className="bidi-surface text-[15px] leading-9 text-foreground">
        {content}
      </p>
    );
  }

  return (
    <motion.p
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      dir="rtl"
      data-testid={testId}
      className="bidi-surface text-[15px] leading-9 text-foreground"
    >
      {content}
    </motion.p>
  );
}

/** The untouched acoustic output, for side-by-side review. */
export function RawView({ text }: { text: string }) {
  return (
    <p dir="rtl" className="bidi-surface text-sm leading-8 text-muted-foreground">
      {text}
    </p>
  );
}
