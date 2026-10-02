/**
 * Rehearsal source.
 *
 * The terminology engine, the number rules and the audit view are the part of
 * this product that is genuinely finished, and none of them need a microphone
 * to be evaluated. This provider replays scripted Persian dictation through the
 * identical interface the Shenava socket uses, with realistic partial-then-
 * final behaviour, so the whole path can be exercised and regression-tested on
 * a machine that has no model loaded.
 *
 * It is a rehearsal tool, clearly labelled as such in the UI. It never
 * pretends to be recognition.
 */

import type { PartialTranscript, SttEvents, SttProvider } from "./provider";

export interface RehearsalCase {
  id: string;
  title: string;
  note: string;
  /** What the clinician dictated, in Persian, exactly as the model would emit it. */
  utterance: string;
}

export const REHEARSAL_CASES: RehearsalCase[] = [
  {
    id: "hypertension",
    title: "Hypertension follow-up",
    note: "Numbers, ranges, units and a drug dose in one breath.",
    utterance:
      "بیمار آقای چهل و پنج ساله با سابقه فشار خون یکصد و پنجاه روی نود میلی متر جیوه و دیابت تایپ دو تحت درمان با متفورمین پانصد میلی گرم و آتروواستاتین بیست میلی گرم مراجعه کرده است. فشار خون کنترل نشده و سردرد ندارد. بیمار سرفه ندارد. کاندید سی تی اسکن با کنتراست می باشد. سابقه ام آی و سی سی یو در سال گذشته دارد.",
  },
  {
    id: "paediatric",
    title: "Paediatric intake",
    note: "Weight-based dosing, lab units, and a confusable drug name that must not be guessed.",
    utterance:
      "کودک سه ساله با تب سی و نه درجه و استفراغ مکرر مراجعه کرده است. وزن کودک پانزده کیلوگرم است. آزمایش خون پلاکت دویست و پنجاه هزار و هموگلوبین ده و دو دهم گرم بر دسی لیتر را نشان می دهد. مایع سرم ده سی سی ساعتی تجویز شد و آنتی بیوتیک تجویز نشد. پس از سی تی اسکن مغز تشخیص گاستروانتریت حاد تایید شد. متوپرولول در سابقه خانوادگی ذکر شده است.",
  },
  {
    id: "negation",
    title: "Negation-heavy review",
    note: "Several negations plus an out-of-range value that must be caught.",
    utterance:
      "خانم سی و دو ساله بدون سابقه بیماری قلبی. فشار خون شانزده صد روی نود و سی سی یو فاقد سابقه دیابت. آزمایش ادرار طبیعی است. هموگلوبین ای وان سی هفت و نیم درصد. بیمار دارویی مصرف نمی کند و سابقه حساسیت دارویی ندارد. نوار قلب نرمال است.",
  },
];

export class RehearsalProvider implements SttProvider {
  readonly name = "Rehearsal (scripted)";
  private events: SttEvents = {};
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private queue: RehearsalCase[] = [];
  private index = 0;
  private onCaseComplete?: (id: string) => void;

  constructor(cases: RehearsalCase[] = REHEARSAL_CASES) {
    this.queue = cases;
  }

  setQueue(cases: RehearsalCase[]): void {
    this.queue = cases;
    this.index = 0;
  }

  onCaseFinished(handler: (id: string) => void): void {
    this.onCaseComplete = handler;
  }

  async start(events: SttEvents): Promise<void> {
    this.events = events;
    this.running = true;
    this.events.onStateChange?.("listening");
    this.next();
  }

  /** The rehearsal source has no audio path; audio is simply discarded. */
  send(_pcm: Float32Array): void {
    // Intentionally empty: the caller drives this source by case, not by audio.
  }

  commit(): void {
    // Nothing is buffered.
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.events.onStateChange?.("idle");
  }

  /** Replay the next scripted case, or finish when the queue is empty. */
  private next(): void {
    if (!this.running) return;
    if (this.index >= this.queue.length) {
      this.running = false;
      this.events.onStateChange?.("idle");
      return;
    }

    const current = this.queue[this.index];
    this.index += 1;
    const words = current.utterance.split(/\s+/);
    let spoken = 0;

    const step = () => {
      if (!this.running) return;
      spoken = Math.min(words.length, spoken + 3);
      const text = words.slice(0, spoken).join(" ");
      const result: PartialTranscript = { text, offsetMs: spoken * 180, isFinal: false };
      this.events.onPartial?.(result);

      if (spoken >= words.length) {
        this.timer = setTimeout(() => {
          if (!this.running) return;
          this.events.onFinal?.({ text: current.utterance, offsetMs: words.length * 180, isFinal: true });
          this.onCaseComplete?.(current.id);
          this.timer = setTimeout(() => this.next(), 700);
        }, 450);
        return;
      }
      this.timer = setTimeout(step, 220);
    };

    this.events.onNotice?.(`Rehearsal: ${current.title} — scripted Persian, not recognition.`);
    step();
  }
}
