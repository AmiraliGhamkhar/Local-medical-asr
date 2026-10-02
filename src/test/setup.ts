import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/**
 * jsdom implements neither of these, and the studio needs them to start:
 * the Web Audio context the microphone capture constructs, and the media
 * device query used when listing input devices.
 */
class FakeAudioContext {
  sampleRate = 48_000;
  state = "running";
  destination = {} as AudioNode;
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
  createMediaStreamSource = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
  createGain = vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }));
  createScriptProcessor = vi.fn(() => ({
    onaudioprocess: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
}

vi.stubGlobal("AudioContext", FakeAudioContext);
vi.stubGlobal("mediaDevices", {
  getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
  enumerateDevices: vi.fn(async () => []),
});

/**
 * jsdom implements neither of these, and framer-motion's viewport animations
 * and the responsive utilities both require them. The browser provides both;
 * this only closes the gap in the test environment.
 */
class FakeIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

if (!window.matchMedia) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}