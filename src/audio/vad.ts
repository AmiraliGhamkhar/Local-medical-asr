/**
 * Voice activity detection.
 *
 * Dictation is not conversation. A clinician pauses mid-sentence to think, to
 * look at a chart, or to dictate a number they are still calculating, so the
 * endpoint has to err long rather than short — cutting a sentence in half is
 * far more annoying than merging two. These thresholds are tuned for that, and
 * every one of them is overridable from the studio.
 */

export interface VadOptions {
  /** dBFS above which a frame counts as speech. */
  onsetDb: number;
  /** dBFS below which a frame counts as silence. */
  offsetDb: number;
  /** Consecutive speech frames required to open an utterance. */
  onsetFrames: number;
  /** Silence duration that closes an utterance. */
  trailingSilenceMs: number;
  /** Utterances shorter than this are discarded as coughs and door clicks. */
  minUtteranceMs: number;
  /** Hard cap so a stuck VAD cannot stream forever. */
  maxUtteranceMs: number;
  /** Audio kept before speech onset so the first phoneme is not clipped. */
  preRollMs: number;
  sampleRate: number;
}

export const DEFAULT_VAD: VadOptions = {
  onsetDb: -34,
  offsetDb: -42,
  onsetFrames: 3,
  trailingSilenceMs: 1400,
  minUtteranceMs: 350,
  maxUtteranceMs: 30_000,
  preRollMs: 300,
  sampleRate: 16_000,
};

export type VadEvent =
  | { type: "speech-start" }
  | { type: "speech-end"; reason: "trailing-silence" | "max-duration"; durationMs: number };

export class EnergyVad {
  private readonly options: VadOptions;
  private frameMs: number;
  private loudRun = 0;
  private quietRun = 0;
  private speech = false;
  private speechFrames = 0;
  /** Every frame since onset, including trailing silence. Caps utterance length. */
  private utteranceFrames = 0;

  constructor(options: Partial<VadOptions> = {}) {
    this.options = { ...DEFAULT_VAD, ...options };
    this.frameMs = 20;
  }

  get isSpeech(): boolean {
    return this.speech;
  }

  get speakingMs(): number {
    return this.speechFrames * this.frameMs;
  }

  reset(): void {
    this.loudRun = 0;
    this.quietRun = 0;
    this.speech = false;
    this.speechFrames = 0;
    this.utteranceFrames = 0;
  }

  /** Feed one frame of mono samples; returns an event when the state changes. */
  push(frame: Float32Array, sampleRate: number): VadEvent | null {
    this.frameMs = (frame.length / sampleRate) * 1000;
    const db = toDb(rms(frame));
    const quietFrames = Math.ceil(this.options.trailingSilenceMs / this.frameMs);

    if (!this.speech) {
      this.loudRun = db > this.options.onsetDb ? this.loudRun + 1 : 0;
      if (this.loudRun >= this.options.onsetFrames) {
        this.speech = true;
        this.quietRun = 0;
        // The onset frame is voice: the clinician did make a sound.
        this.speechFrames += 1;
        this.utteranceFrames += 1;
        return { type: "speech-start" };
      }
      return null;
    }

    this.utteranceFrames += 1;
    if (db >= this.options.offsetDb) {
      this.speechFrames += 1;
      this.quietRun = 0;
    } else {
      this.quietRun += 1;
    }

    const voiceMs = this.speechFrames * this.frameMs;
    const utteranceMs = this.utteranceFrames * this.frameMs;

    if (this.quietRun >= quietFrames) {
      this.reset();
      // Judge the minimum on voice, not on the pause that ended the
      // utterance: a cough followed by a long silence is still a cough, and
      // sending it to the decoder costs a false transcript.
      if (voiceMs < this.options.minUtteranceMs) return null;
      return { type: "speech-end", reason: "trailing-silence", durationMs: voiceMs };
    }
    if (utteranceMs >= this.options.maxUtteranceMs) {
      this.reset();
      return { type: "speech-end", reason: "max-duration", durationMs: voiceMs };
    }
    return null;
  }

  /** Frame size in samples that matches the current frame duration. */
  frameSize(sampleRate: number): number {
    return Math.round((this.frameMs / 1000) * sampleRate);
  }
}

function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i += 1) sum += frame[i] * frame[i];
  return Math.sqrt(sum / Math.max(1, frame.length));
}

function toDb(value: number): number {
  if (value <= 1e-8) return -120;
  return 20 * Math.log10(value);
}
