import { describe, expect, it } from "vitest";
import { buildHotwords, hotwordsAsText } from "./hotwords";
import { REHEARSAL_CASES } from "../stt/rehearsal";
import { processUtterance } from "../processing/pipeline";

describe("hotwords", () => {
  const hotwords = buildHotwords();

  it("includes clinical phrases from the lexicon", () => {
    expect(hotwords).toContain("متفورمین");
    expect(hotwords).toContain("سی تی اسکن");
  });

  it("includes confusable pairs so the decoder can tell them apart", () => {
    expect(hotwords).toContain("متوپرولول");
    expect(hotwords).toContain("متفورمین");
  });

  it("includes user overrides", () => {
    const withCustom = buildHotwords([
      { source: "لیریو", en: "Librio", tier: 1, category: "drug" },
    ]);
    expect(withCustom).toContain("لیریو");
  });

  it("exports one phrase per line", () => {
    const text = hotwordsAsText();
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(hotwords.length);
    expect(lines.every((line) => line.trim().length > 1)).toBe(true);
  });

  it("stays a list a decoder can load without JSON quoting", () => {
    expect(hotwordsAsText()).not.toContain('"');
  });
});

describe("rehearsal cases", () => {
  it("produce output the clinician can check by eye", () => {
    for (const item of REHEARSAL_CASES) {
      const result = processUtterance(item.utterance);
      expect(result.plain.length).toBeGreaterThan(20);
      expect(result.stats.latinTerms).toBeGreaterThan(0);
    }
  });

  it("render the paediatric case as a clinician would write it", () => {
    const item = REHEARSAL_CASES.find((entry) => entry.id === "paediatric");
    const plain = processUtterance(item!.utterance).plain;
    expect(plain).toContain("39 °C");
    expect(plain).toContain("15 kg");
    expect(plain).toContain("Plt 250");
    expect(plain).toContain("Hb 10.2 g/dL");
    expect(plain).toContain("10 mL");
    expect(plain).toContain("CT scan");
  });

  it("never turns a confusable drug into a definite substitution", () => {
    const paediatric = REHEARSAL_CASES.find((item) => item.id === "paediatric");
    expect(paediatric).toBeDefined();
    const result = processUtterance(paediatric!.utterance);
    expect(result.plain).not.toContain("metoprolol");
    expect(result.flags.some((flag) => flag.kind === "ambiguous-term")).toBe(true);
  });

  it("raises a critical flag on an impossible blood pressure", () => {
    const negation = REHEARSAL_CASES.find((item) => item.id === "negation");
    expect(negation).toBeDefined();
    const result = processUtterance(negation!.utterance);
    expect(result.flags.some((flag) => flag.kind === "out-of-range" && flag.severity === "danger")).toBe(
      true,
    );
  });

  it("keeps every negation in the output", () => {
    for (const item of REHEARSAL_CASES) {
      const result = processUtterance(item.utterance);
      for (const flag of result.flags) {
        if (flag.kind === "negation-scope") {
          expect(result.plain).toContain(flag.term);
        }
      }
    }
  });
});
