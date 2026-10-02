import { describe, expect, it } from "vitest";
import { EnergyVad, DEFAULT_VAD, type VadEvent } from "./vad";
import { toInt16, TARGET_SAMPLE_RATE } from "./mic";

const FRAME_MS = 20;
const SAMPLES_PER_FRAME = (TARGET_SAMPLE_RATE * FRAME_MS) / 1000;

function frame(amplitude: number, samples = SAMPLES_PER_FRAME): Float32Array {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) out[i] = amplitude * Math.sin((i / samples) * Math.PI * 8);
  return out;
}

function silence(samples = SAMPLES_PER_FRAME): Float32Array {
  return new Float32Array(samples);
}

/** Feed a scripted sequence of loud/quiet frames and collect VAD events. */
function run(sequence: Array<"speech" | "quiet">): VadEvent[] {
  const vad = new EnergyVad(DEFAULT_VAD);
  const events: VadEvent[] = [];
  for (const kind of sequence) {
    const event = vad.push(kind === "speech" ? frame(0.3) : silence(), TARGET_SAMPLE_RATE);
    if (event) events.push(event);
  }
  return events;
}

describe("voice activity detection", () => {
  it("stays silent on pure noise floor", () => {
    expect(run(Array(200).fill("quiet"))).toEqual([]);
  });

  it("opens an utterance after enough consecutive speech frames", () => {
    const events = run([...Array(10).fill("speech")]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("speech-start");
  });

  it("does not open on a single loud frame", () => {
    // A cough or a dropped object must not start an utterance.
    const events = run(["speech", ...Array(20).fill("quiet")]);
    expect(events).toEqual([]);
  });

  it("closes an utterance after the trailing-silence window", () => {
    const speech = Math.round((DEFAULT_VAD.trailingSilenceMs / FRAME_MS) * 2);
    const events = run([...Array(50).fill("speech"), ...Array(speech).fill("quiet")]);

    expect(events.map((e) => e.type)).toEqual(["speech-start", "speech-end"]);
    const end = events[1];
    expect(end?.type === "speech-end" && end.reason).toBe("trailing-silence");
  });

  it("discards an utterance shorter than the minimum", () => {
    const quiet = Math.round((DEFAULT_VAD.trailingSilenceMs / FRAME_MS) * 2);
    const events = run([...Array(4).fill("speech"), ...Array(quiet).fill("quiet")]);
    expect(events.some((e) => e.type === "speech-end")).toBe(false);
  });

  it("emits a second utterance when the clinician starts speaking again", () => {
    const quiet = Math.round((DEFAULT_VAD.trailingSilenceMs / FRAME_MS) + 5);
    const events = run([
      ...Array(40).fill("speech"),
      ...Array(quiet).fill("quiet"),
      ...Array(40).fill("speech"),
    ]);
    expect(events.filter((e) => e.type === "speech-start")).toHaveLength(2);
  });

  it("forces an endpoint at the maximum utterance length", () => {
    const frames = Math.ceil(DEFAULT_VAD.maxUtteranceMs / FRAME_MS) + 5;
    const events = run(Array(frames).fill("speech"));
    const end = events.find((e) => e.type === "speech-end");
    expect(end?.type === "speech-end" && end.reason).toBe("max-duration");
  });

  it("honours a longer trailing silence than conversation default", () => {
    // Dictation pauses mid-sentence; a conversation-tuned VAD would cut here.
    const vad = new EnergyVad({ ...DEFAULT_VAD, trailingSilenceMs: 2400 });
    let closed = false;
    for (let i = 0; i < 100; i += 1) {
      const loud = i < 40;
      const event = vad.push(loud ? frame(0.3) : silence(), TARGET_SAMPLE_RATE);
      if (event?.type === "speech-end") closed = true;
    }
    expect(closed).toBe(false);
  });

  it("reports speaking state and resets cleanly", () => {
    const vad = new EnergyVad(DEFAULT_VAD);
    vad.push(frame(0.3), TARGET_SAMPLE_RATE);
    vad.push(frame(0.3), TARGET_SAMPLE_RATE);
    vad.push(frame(0.3), TARGET_SAMPLE_RATE);
    expect(vad.isSpeech).toBe(true);
    expect(vad.speakingMs).toBeGreaterThan(0);
    vad.reset();
    expect(vad.isSpeech).toBe(false);
  });
});

describe("PCM conversion", () => {
  it("maps full scale to the 16-bit range", () => {
    const pcm = toInt16(new Float32Array([0, 1, -1, 0.5]));
    expect(pcm[0]).toBe(0);
    expect(pcm[1]).toBe(32767);
    expect(pcm[2]).toBe(-32768);
    expect(pcm[3]).toBe(16383);
  });

  it("clamps anything outside [-1, 1]", () => {
    const pcm = toInt16(new Float32Array([2, -2]));
    expect(pcm[0]).toBe(32767);
    expect(pcm[1]).toBe(-32768);
  });

  it("produces the same length as the input", () => {
    const input = new Float32Array(320);
    expect(toInt16(input)).toHaveLength(320);
  });
});

describe("resampling contract", () => {
  it("targets 16 kHz mono", () => {
    expect(TARGET_SAMPLE_RATE).toBe(16_000);
  });

  it("derives a frame size from the configured duration", () => {
    const vad = new EnergyVad({ ...DEFAULT_VAD, sampleRate: TARGET_SAMPLE_RATE });
    expect(vad.frameSize(TARGET_SAMPLE_RATE)).toBe(SAMPLES_PER_FRAME);
  });
});