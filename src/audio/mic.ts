/**
 * Microphone capture and segmentation.
 *
 * The browser hands us whatever the device produces — 44.1 kHz, 48 kHz, stereo
 * — and the acoustic model wants 16 kHz mono float. We resample once, here,
 * rather than shipping a mismatched stream to the decoder.
 *
 * Audio never leaves this module in any other form: it is converted to PCM for
 * the websocket and dropped. Nothing is buffered to disk, uploaded, or
 * persisted anywhere.
 */

import { EnergyVad, type VadOptions } from "./vad";

export const TARGET_SAMPLE_RATE = 16_000;

export interface MicOptions extends Partial<VadOptions> {
  deviceId?: string;
  onLevel?: (db: number) => void;
  onSpeechStart?: () => void;
  /** Called with the complete utterance, including pre-roll. */
  onUtterance: (pcm: Float32Array, durationMs: number) => void;
  /** Called with every frame so the caller can stream partials live. */
  onFrame?: (pcm: Float32Array, speaking: boolean) => void;
}

export class MicrophoneCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private readonly vad: EnergyVad;
  private readonly options: MicOptions;
  private utterance: Float32Array[] = [];
  private preRoll: Float32Array[] = [];
  private preRollSamples = 0;
  private downsampleRatio = 1;
  private running = false;
  private tailSinceSpeech = 0;

  constructor(options: MicOptions) {
    this.options = options;
    this.vad = new EnergyVad(options);
  }

  get isRunning(): boolean {
    return this.running;
  }

  async start(): Promise<void> {
    if (this.running) return;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(this.options.deviceId ? { deviceId: this.options.deviceId } : {}),
      },
    });

    this.context = new AudioContext();
    await this.context.resume();
    this.source = this.context.createMediaStreamSource(this.stream);
    this.downsampleRatio = this.context.sampleRate / TARGET_SAMPLE_RATE;

    const frameSize = this.vad.frameSize(TARGET_SAMPLE_RATE);
    this.processor = this.context.createScriptProcessor(frameSize * 4, 1, 1);
    this.preRollSamples = Math.round(((this.options.preRollMs ?? 300) / 1000) * TARGET_SAMPLE_RATE);

    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const resampled = this.resample(input);
      this.handleFrame(resampled);
    };

    this.source.connect(this.processor);
    // ScriptProcessor only runs while connected to a destination; a zero gain
    // node keeps it alive without echoing the microphone back to the speakers.
    const sink = this.context.createGain();
    sink.gain.value = 0;
    this.processor.connect(sink);
    sink.connect(this.context.destination);

    this.running = true;
  }

  stop(): void {
    this.running = false;
    this.processor?.disconnect();
    this.processor = null;
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close();
    this.context = null;
    this.vad.reset();
    this.utterance = [];
    this.preRoll = [];
  }

  /** Flush whatever has been captured, e.g. when the clinician presses stop. */
  flush(): void {
    if (this.utterance.length > 0) this.emit();
  }

  private handleFrame(frame: Float32Array): void {
    const event = this.vad.push(frame, TARGET_SAMPLE_RATE);
    this.options.onLevel?.(measureDb(frame));

    if (event?.type === "speech-start") {
      this.utterance = [...this.preRoll];
      this.preRoll = [];
      this.tailSinceSpeech = 0;
      this.options.onSpeechStart?.();
    }

    if (event?.type === "speech-end") {
      this.emit();
      this.preRoll = [];
      this.tailSinceSpeech = 0;
    } else if (this.vad.isSpeech) {
      this.utterance.push(frame);
      this.tailSinceSpeech = 0;
    } else {
      this.tailSinceSpeech += 1;
      this.remember(frame);
    }

    this.options.onFrame?.(frame, this.vad.isSpeech);
  }

  private remember(frame: Float32Array): void {
    this.preRoll.push(frame);
    let total = this.preRollSamples;
    while (total > this.preRollSamples && this.preRoll.length > 1) {
      total -= this.preRoll[0].length;
      this.preRoll.shift();
    }
  }

  private emit(): void {
    if (this.utterance.length === 0) return;
    const pcm = concat(this.utterance);
    this.utterance = [];
    const durationMs = (pcm.length / TARGET_SAMPLE_RATE) * 1000;
    this.options.onUtterance(pcm, durationMs);
  }

  private resample(input: Float32Array): Float32Array {
    if (Math.abs(this.downsampleRatio - 1) < 1e-6) return input;
    const outLength = Math.max(1, Math.floor(input.length / this.downsampleRatio));
    const out = new Float32Array(outLength);
    for (let i = 0; i < outLength; i += 1) {
      const position = i * this.downsampleRatio;
      const low = Math.floor(position);
      const high = Math.min(input.length - 1, low + 1);
      const t = position - low;
      out[i] = input[low] * (1 - t) + input[high] * t;
    }
    return out;
  }
}

function concat(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function measureDb(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i += 1) sum += frame[i] * frame[i];
  const value = Math.sqrt(sum / Math.max(1, frame.length));
  return value <= 1e-8 ? -120 : 20 * Math.log10(value);
}

/** Float32 mono in [-1, 1] to little-endian Int16 PCM for the streaming socket. */
export function toInt16(pcm: Float32Array): Int16Array {
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, pcm[i]));
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return out;
}
