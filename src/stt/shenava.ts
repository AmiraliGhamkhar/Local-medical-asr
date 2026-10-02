/**
 * Shenava-Koochik tract streaming client.
 *
 * The decoder runs on the clinician's own machine or on a server inside the
 * hospital network: `shenava-asr-server`, a single Rust binary with no ONNX
 * Runtime, no Python and no outbound network. This client speaks to it over a
 * plain websocket and hands the decoded Persian straight to the deterministic
 * pipeline.
 *
 * Because the acoustic model is Persian-only, medical terms are expected to be
 * spoken in Persian. The decoder is biased toward clinical vocabulary with a
 * hotword list, and the terminology stage then renders them as English. What
 * it will not do is hear a clinician speak English — see the limitations panel
 * in the studio, because pretending otherwise would be the first lie this
 * product tells.
 */

import { toInt16 } from "../audio/mic";
import { SttError, type PartialTranscript, type SttEvents, type SttProvider } from "./provider";

export interface ShenavaOptions {
  /** e.g. ws://127.0.0.1:3000/stream */
  url: string;
  /** Optional shared secret, sent as `Authorization: Bearer`. */
  token?: string;
  /** Milliseconds between keepalive pings. */
  keepAliveMs?: number;
}

interface SocketFrame {
  text?: string;
  is_final?: boolean;
  isFinal?: boolean;
  offset_ms?: number;
  offsetMs?: number;
  confidence?: number;
  type?: string;
  error?: string;
}

export class ShenavaProvider implements SttProvider {
  readonly name = "Shenava Koochik (tract)";
  private readonly options: ShenavaOptions;
  private socket: WebSocket | null = null;
  private events: SttEvents = {};
  private offsetMs = 0;
  private keepAlive: ReturnType<typeof setInterval> | null = null;

  constructor(options: ShenavaOptions) {
    this.options = options;
  }

  async start(events: SttEvents): Promise<void> {
    this.events = events;
    this.events.onStateChange?.("connecting");

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let socket: WebSocket;
      try {
        socket = new WebSocket(this.options.url);
      } catch {
        reject(new SttError("Could not open the decoder socket.", "unreachable", true));
        return;
      }
      socket.binaryType = "arraybuffer";

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.close();
        reject(new SttError("The decoder did not respond in time.", "network", true));
      }, 8000);

      socket.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.socket = socket;
        if (this.options.token) {
          socket.send(JSON.stringify({ type: "auth", token: this.options.token }));
        }
        this.events.onStateChange?.("listening");
        resolve();
      };

      socket.onerror = () => {
        const error = new SttError("Cannot reach the Shenava decoder.", "unreachable", true);
        // While still connecting, an error must settle the promise. Letting it
        // fall through to the event handler instead leaves the caller waiting
        // on the connect timeout with the UI stuck on "connecting".
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
          return;
        }
        this.events.onError?.(error);
      };

      socket.onmessage = (event) => this.handleMessage(event);
      socket.onclose = () => {
        this.stopKeepAlive();
        this.events.onStateChange?.("idle");
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new SttError("The decoder closed the connection.", "network", true));
        }
      };
    });

    this.startKeepAlive();
  }

  send(pcm: Float32Array): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(toInt16(pcm).buffer as ArrayBuffer);
  }

  commit(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: "flush" }));
  }

  async stop(): Promise<void> {
    this.stopKeepAlive();
    const socket = this.socket;
    this.socket = null;
    if (!socket || socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      socket.onclose = () => resolve();
      socket.close();
      setTimeout(resolve, 500);
    });
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAlive = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: "ping" }));
      }
    }, this.options.keepAliveMs ?? 15_000);
  }

  private stopKeepAlive(): void {
    if (this.keepAlive !== null) clearInterval(this.keepAlive);
    this.keepAlive = null;
  }

  private handleMessage(event: MessageEvent): void {
    if (typeof event.data !== "string") return;
    let frame: SocketFrame;
    try {
      frame = JSON.parse(event.data) as SocketFrame;
    } catch {
      return;
    }

    if (frame.type === "ping") {
      this.socket?.send(JSON.stringify({ type: "pong" }));
      return;
    }
    if (frame.error) {
      this.events.onError?.(new SttError(frame.error, "model-missing", false));
      return;
    }
    if (typeof frame.text !== "string") return;

    const isFinal = frame.is_final ?? frame.isFinal ?? false;
    const offsetMs = frame.offset_ms ?? frame.offsetMs ?? this.offsetMs;
    const result: PartialTranscript = {
      text: frame.text,
      offsetMs,
      isFinal,
      confidence: frame.confidence,
    };

    if (isFinal) {
      this.offsetMs = 0;
      this.events.onFinal?.(result);
    } else {
      this.offsetMs = offsetMs;
      this.events.onPartial?.(result);
    }
  }
}
