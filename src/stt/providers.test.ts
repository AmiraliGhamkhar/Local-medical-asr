import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RehearsalProvider, REHEARSAL_CASES } from "./rehearsal";
import { ShenavaProvider } from "./shenava";
import { SttError, type PartialTranscript } from "./provider";

describe("rehearsal provider", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emits partials and then a final for every case", async () => {
    const provider = new RehearsalProvider(REHEARSAL_CASES.slice(0, 1));
    const partials: PartialTranscript[] = [];
    const finals: PartialTranscript[] = [];
    const states: string[] = [];

    await provider.start({
      onPartial: (r) => partials.push(r),
      onFinal: (r) => finals.push(r),
      onStateChange: (s) => states.push(s),
    });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(partials.length).toBeGreaterThan(1);
    expect(partials.every((p) => !p.isFinal)).toBe(true);
    expect(finals).toHaveLength(1);
    expect(finals[0].text).toBe(REHEARSAL_CASES[0].utterance);
    expect(states[0]).toBe("listening");
    expect(states[states.length - 1]).toBe("idle");
  });

  it("grows the partial monotonically, as a real decoder does", async () => {
    const provider = new RehearsalProvider(REHEARSAL_CASES.slice(0, 1));
    const partials: string[] = [];
    await provider.start({ onPartial: (r) => partials.push(r.text) });
    await vi.advanceTimersByTimeAsync(20_000);

    for (let i = 1; i < partials.length; i += 1) {
      expect(partials[i].length).toBeGreaterThan(partials[i - 1].length);
      expect(partials[i].startsWith(partials[i - 1].slice(0, 10))).toBe(true);
    }
  });

  it("announces that it is a rehearsal, not recognition", async () => {
    const provider = new RehearsalProvider(REHEARSAL_CASES.slice(0, 1));
    const notices: string[] = [];
    await provider.start({ onNotice: (m) => notices.push(m) });
    expect(notices[0]).toContain("scripted Persian, not recognition");
  });

  it("stops cleanly and emits nothing afterwards", async () => {
    const provider = new RehearsalProvider(REHEARSAL_CASES.slice(0, 1));
    const finals: PartialTranscript[] = [];
    await provider.start({ onFinal: (r) => finals.push(r) });
    await provider.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(finals).toHaveLength(0);
  });

  it("keeps the audio path a no-op so it never claims to transcribe", async () => {
    const provider = new RehearsalProvider();
    await provider.start({});
    expect(() => provider.send(new Float32Array(160))).not.toThrow();
    expect(() => provider.commit()).not.toThrow();
    await provider.stop();
  });
});

/** Minimal in-process WebSocket so the socket contract can be driven deterministically. */
class FakeSocket {
  static instances: FakeSocket[] = [];
  static OPEN = 1;

  readyState = 1;
  binaryType = "blob";
  sent: Array<string | ArrayBuffer> = [];
  closed = false;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  send(data?: string | ArrayBuffer): void {
    this.sent.push(data ?? "");
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }

  /** Simulate a frame arriving from the decoder. */
  emit(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

describe("shenava provider", () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeSocket as unknown as typeof WebSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("connects and reports the listening state", async () => {
    const provider = new ShenavaProvider({ url: "ws://127.0.0.1:3000/stream" });
    const states: string[] = [];
    const promise = provider.start({ onStateChange: (s) => states.push(s) });
    FakeSocket.instances[0].onopen?.();
    await promise;

    expect(states).toEqual(["connecting", "listening"]);
    expect(FakeSocket.instances[0].url).toBe("ws://127.0.0.1:3000/stream");
  });

  it("sends audio as raw little-endian 16-bit PCM", async () => {
    const provider = new ShenavaProvider({ url: "ws://x/stream" });
    const promise = provider.start({});
    FakeSocket.instances[0].onopen?.();
    await promise;

    provider.send(new Float32Array([0, 1, -1]));
    const frame = FakeSocket.instances[0].sent[0] as ArrayBuffer;
    expect(frame).toBeInstanceOf(ArrayBuffer);
    expect(frame.byteLength).toBe(6);
    expect(new Int16Array(frame)[1]).toBe(32767);
  });

  it("routes partial and final frames to the right callbacks", async () => {
    const provider = new ShenavaProvider({ url: "ws://x/stream" });
    const partials: PartialTranscript[] = [];
    const finals: PartialTranscript[] = [];
    const promise = provider.start({
      onPartial: (r) => partials.push(r),
      onFinal: (r) => finals.push(r),
    });
    const socket = FakeSocket.instances[0];
    socket.onopen?.();
    await promise;

    socket.emit({ text: "بیمار", is_final: false });
    socket.emit({ text: "بیمار پایدار", is_final: true });

    expect(partials).toEqual([{ text: "بیمار", offsetMs: 0, isFinal: false, confidence: undefined }]);
    expect(finals).toHaveLength(1);
    expect(finals[0].text).toBe("بیمار پایدار");
  });

  it("asks the decoder to flush on commit", async () => {
    const provider = new ShenavaProvider({ url: "ws://x/stream" });
    const promise = provider.start({});
    FakeSocket.instances[0].onopen?.();
    await promise;
    provider.commit();
    expect(FakeSocket.instances[0].sent).toContain(JSON.stringify({ type: "flush" }));
  });

  it("sends a session token when one is configured", async () => {
    const provider = new ShenavaProvider({ url: "ws://x/stream", token: "secret" });
    const promise = provider.start({});
    FakeSocket.instances[0].onopen?.();
    await promise;
    expect(FakeSocket.instances[0].sent).toContain(JSON.stringify({ type: "auth", token: "secret" }));
  });

  it("answers a server ping", async () => {
    const provider = new ShenavaProvider({ url: "ws://x/stream" });
    const promise = provider.start({});
    const socket = FakeSocket.instances[0];
    socket.onopen?.();
    await promise;
    socket.emit({ type: "ping" });
    expect(socket.sent).toContain(JSON.stringify({ type: "pong" }));
  });

  it("surfaces a decoder error as a non-retryable model error", async () => {
    const provider = new ShenavaProvider({ url: "ws://x/stream" });
    const errors: SttError[] = [];
    const promise = provider.start({ onError: (e) => errors.push(e) });
    const socket = FakeSocket.instances[0];
    socket.onopen?.();
    await promise;

    socket.emit({ error: "model.int4.onnx not found" });
    expect(errors[0].category).toBe("model-missing");
    expect(errors[0].retryable).toBe(false);
  });

  it("fails to start when the decoder is unreachable", async () => {
    const provider = new ShenavaProvider({ url: "ws://127.0.0.1:9/stream" });
    const promise = provider.start({});
    FakeSocket.instances[0].onerror?.();
    await expect(promise).rejects.toThrow(SttError);
  });

  it("ignores malformed frames rather than throwing", async () => {
    const provider = new ShenavaProvider({ url: "ws://x/stream" });
    const partials: PartialTranscript[] = [];
    const promise = provider.start({ onPartial: (r) => partials.push(r) });
    const socket = FakeSocket.instances[0];
    socket.onopen?.();
    await promise;

    socket.onmessage?.({ data: "not json" });
    socket.emit({ noText: true });
    expect(partials).toHaveLength(0);
  });

  it("stops the keepalive when stopped", async () => {
    vi.useFakeTimers();
    const provider = new ShenavaProvider({ url: "ws://x/stream", keepAliveMs: 100 });
    const promise = provider.start({});
    FakeSocket.instances[0].onopen?.();
    await promise;

    const before = FakeSocket.instances[0].sent.length;
    await vi.advanceTimersByTimeAsync(250);
    expect(FakeSocket.instances[0].sent.length).toBeGreaterThan(before);

    await provider.stop();
    const afterStop = FakeSocket.instances[0].sent.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(FakeSocket.instances[0].sent.length).toBe(afterStop);
  });
});