/**
 * Streaming speech-to-text providers.
 *
 * The interface is deliberately identical to the one the desktop client used
 * against a cloud vendor, because that indirection is the only reason swapping
 * the acoustic model does not touch a line of the rest of the system.
 */

export interface PartialTranscript {
  text: string;
  /** Audio position in the utterance this text covers, in milliseconds. */
  offsetMs: number;
  isFinal: boolean;
  confidence?: number;
}

export interface SttEvents {
  onPartial?: (result: PartialTranscript) => void;
  onFinal?: (result: PartialTranscript) => void;
  onError?: (error: SttError) => void;
  /** Informational message that is not a failure, e.g. a rehearsal notice. */
  onNotice?: (message: string) => void;
  onStateChange?: (state: SttState) => void;
}

export type SttState = "idle" | "connecting" | "listening" | "error";

export type SttErrorCategory =
  | "network"
  | "model-missing"
  | "audio-rejected"
  | "unreachable"
  | "unknown";

export class SttError extends Error {
  readonly category: SttErrorCategory;
  readonly retryable: boolean;

  constructor(message: string, category: SttErrorCategory, retryable: boolean) {
    super(message);
    this.name = "SttError";
    this.category = category;
    this.retryable = retryable;
  }
}

export interface SttProvider {
  readonly name: string;
  start(events: SttEvents): Promise<void>;
  /** Send one utterance worth of 16 kHz mono float samples. */
  send(pcm: Float32Array): void;
  /** Ask the decoder to commit whatever it has buffered. */
  commit(): void;
  stop(): Promise<void>;
}
