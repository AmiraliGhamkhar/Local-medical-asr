import { describe, expect, it } from "vitest";
import { processUtterance as run } from "./pipeline";
import { normalizePersian, joinTokens, segmentTokens, segmentWords } from "./normalize";
import { findNumbers, renderNumber } from "./numbers";
import { isolateLatinRuns, stripIsolates } from "./bidi";
import { PhraseTrie } from "./fst";
import { REHEARSAL_CASES } from "../stt/rehearsal";

describe("normalize", () => {
  it("canonicalises Arabic letters to Persian", () => {
    expect(normalizePersian("كتابي")).toBe("کتابی");
  });

  it("maps Persian and Arabic-Indic digits to ASCII", () => {
    expect(normalizePersian("Hb ۱۲ و ٣")).toBe("Hb 12 و 3");
  });

  it("strips harakat and tatweel", () => {
    expect(normalizePersian("مَـسـل")).toBe("مسل");
  });

  it("collapses whitespace and drops bidi control characters", () => {
    expect(normalizePersian("  فشار‏  خون  ")).toBe("فشار خون");
  });

  it("treats ZWNJ as a word boundary", () => {
    expect(segmentWords("میلی‌گرم و بیمار")).toEqual(["میلی", "گرم", "و", "بیمار"]);
  });

  it("keeps ZWNJ tight when tokens are rebuilt", () => {
    // ZWNJ has to be a boundary for matching and a joiner for output: rebuilt
    // as a space it corrupts the word into `می‌ شود`.
    for (const word of ["کم‌خونی", "می‌شود", "ضایعه‌ای", "فشار‌خون"]) {
      expect(joinTokens(segmentTokens(word))).toBe(word);
    }
    expect(joinTokens(segmentTokens("کم‌خونی دارد"))).toBe("کم‌خونی دارد");
  });
});

describe("numbers", () => {
  const value = (text: string) => findNumbers(text).map((m) => renderNumber(m));

  it("parses simple and compound cardinals", () => {
    expect(value("سی و دو")).toEqual(["32"]);
    expect(value("یکصد و پنجاه")).toEqual(["150"]);
    expect(value("هزار و دویست")).toEqual(["1200"]);
  });

  it("parses decimals and fractions", () => {
    expect(value("سی و دو و پنج دهم")).toEqual(["32.5"]);
    expect(value("دو و نیم")).toEqual(["2.5"]);
  });

  it("parses blood-pressure ranges", () => {
    expect(value("یکصد و بیست روی هشتاد")).toEqual(["120/80"]);
  });

  it("parses percentages and approximations", () => {
    expect(value("پنجاه درصد")).toEqual(["50%"]);
    expect(value("حدود سی گرم")).toEqual(["~30"]);
  });

  it("does not treat a bare scale word as a number", () => {
    expect(value("هزار و نفر")).toEqual(["1000"]);
  });

  it("scales a hundreds group, and adds when the scale comes first", () => {
    expect(value("دویست و پنجاه هزار")).toEqual(["250000"]);
    expect(value("هزار و دویست")).toEqual(["1200"]);
    expect(value("شانزده صد")).toEqual(["1600"]);
    expect(value("دو میلیون")).toEqual(["2000000"]);
  });

  it("splits the integer and the numerator of a spoken decimal", () => {
    expect(value("ده و دو دهم")).toEqual(["10.2"]);
  });

  it("never converts 'بر هزار' into a range", () => {
    // `بر` is a preposition, not a range separator.
    expect(value("ده بر هزار")).toEqual(["10"]);
  });
});

describe("units", () => {
  it("folds the unit into the number as one atomic token", () => {
    const result = run("پانصد میلی گرم متفورمین");
    expect(result.plain).toContain("500 mg");
  });

  it("keeps millimetres of mercury for blood-pressure ranges only", () => {
    expect(run("فشار خون یکصد و بیست روی هشتاد میلی متر جیوه").plain).toContain(
      "120/80 mmHg",
    );
    expect(run("حفره چهار میلی متر جیوه").plain).not.toContain("mmHg");
  });

  it("handles millilitres and percentages", () => {
    expect(run("ده سی سی سرم").plain).toContain("10 mL");
    expect(run("سی درصد").plain).toContain("30%");
  });

  it("consumes the whole spoken unit when it is written with ZWNJ", () => {
    // `میلی‌گرم` matches as two words but occupies three tokens, so cutting the
    // token list by the word count used to leave a dangling `گرم` in the note.
    const result = run("بیمار متفورمین پانصد میلی‌گرم مصرف می‌کند");
    expect(result.plain).toContain("metformin 500 mg مصرف");
    expect(result.plain).not.toContain("500 mg گرم");
    expect(result.pieces.map((p) => p.text).join("")).toBe(result.plain);
  });
});

describe("terminology", () => {
  it("substitutes tier 1 and tier 2 terms into English", () => {
    const result = run("بیمار کاندید سی تی اسکن با کنتراست است");
    expect(result.plain).toContain("CT scan");
  });

  it("leaves narrative Persian untouched", () => {
    const result = run("بیمار از سرفه و تنگی نفس شکایت دارد");
    expect(result.plain).toContain("سرفه");
    expect(result.plain).toContain("تنگی نفس");
  });

  it("refuses to substitute acoustically confusable drug names", () => {
    const result = run("متوپرولول تجویز شد");
    expect(result.plain).toContain("متوپرولول");
    expect(result.plain).not.toContain("metoprolol");
    expect(result.flags.some((f) => f.kind === "ambiguous-term")).toBe(true);
  });

  it("never matches a term inside another word", () => {
    // `آی وی` (IV) must not fire on a longer word that contains the sequence.
    const result = run("آی ویزومتری کردم");
    expect(result.plain).toContain("آی ویزومتری");
  });

  it("does not read the number word inside a clinical phrase as a number", () => {
    // `سی` is also "thirty"; `سی تی` must stay a term, not become "30 تی".
    expect(run("سی تی انجام شد").plain).toContain("CT");
    expect(run("دیابت تایپ دو دارد").plain).toContain("type 2 DM");
  });

  it("prefers the longest phrase", () => {
    const result = run("سی تی اسکن با کنتراست");
    expect(result.plain).toContain("CT scan");
    expect(result.plain).not.toMatch(/\bCT\b.*اسکن/);
  });

  it("renders multi-line input exactly as the copied text", () => {
    // The note the clinician reads is built from pieces and the text inserted
    // into the chart comes from `plain`; the two must never disagree.
    const result = run("بیمار مراجعه کرد.\n\nدما بالاست.\n");
    expect(result.pieces.map((p) => p.text).join("")).toBe(result.plain);
  });
});

describe("negation", () => {
  it("freezes negation cues and reports their scope", () => {
    const result = run("سرفه ندارد اما تب دارد");
    expect(result.plain).toContain("ندارد");
    expect(result.flags.some((f) => f.kind === "negation-scope")).toBe(true);
  });

  it("does not treat the positive half of a negated verb as a negation", () => {
    // `دیده` means "seen". Flagging it marks every normal finding as a
    // negation, which trains the clinician to ignore the real ones.
    const seen = run("ضایعه‌ای دیده شد");
    expect(seen.flags.some((f) => f.kind === "negation-scope")).toBe(false);
    expect(seen.plain).toContain("ضایعه‌ای دیده شد");

    const notSeen = run("ضایعه‌ای دیده نشد");
    expect(notSeen.flags.some((f) => f.kind === "negation-scope")).toBe(true);
  });

  it("does not let terminology rewrite across a negation cue", () => {
    const result = run("بیمار فشار خون ندارد");
    expect(result.plain).toContain("ندارد");
  });

  it("preserves word order exactly", () => {
    // A note whose clauses were rearranged would be worse than no negation
    // handling at all, so ordering is asserted directly.
    expect(run("مایع سرم ده سی سی ساعتی تجویز شد و آنتی بیوتیک تجویز نشد").plain).toBe(
      "مایع سرم 10 mL ساعتی تجویز شد و آنتی بیوتیک تجویز نشد.",
    );
    expect(run("سرفه ندارد اما تب دارد").plain).toBe("سرفه ندارد اما تب دارد.");
  });
});

describe("punctuation", () => {
  it("honours a spoken command only at the end of an utterance", () => {
    expect(run("گزارش آماده است نقطه").plain).toContain(".");
    expect(run("نقطه درد دارد").plain).toContain("نقطه درد");
  });

  it("closes an utterance with a full stop", () => {
    expect(run("بیمار پایدار است").plain.endsWith(".")).toBe(true);
  });
});

describe("bidi", () => {
  it("isolates Latin runs and round-trips to plain text", () => {
    const isolated = isolateLatinRuns("metformin مصرف شود");
    expect(isolated).toContain("⁨metformin⁩");
    expect(stripIsolates(isolated)).toBe("metformin مصرف شود");
  });

  it("leaves pure digit runs alone", () => {
    expect(isolateLatinRuns("۱۲ عدد")).not.toContain("⁨");
  });

  it("keeps a multi-word term in a single isolate", () => {
    const isolated = isolateLatinRuns("کاندید CT scan با کنتراست");
    expect(isolated).toContain("⁨CT scan⁩");
    expect(isolated).not.toContain("⁨CT⁩");
  });

  it("leaves sentence punctuation outside the isolate", () => {
    // A full stop inside an LTR run at the end of an RTL sentence resolves
    // against the wrong paragraph direction and lands on the wrong side.
    const isolated = isolateLatinRuns("BP 120/80 mmHg.");
    expect(isolated).toBe("⁨BP 120/80 mmHg⁩.");
  });

  it("isolates a term and its dose as one run", () => {
    // After substitution the dose and the drug name are adjacent Latin, and
    // fencing them together keeps the dose glued to the right drug.
    const result = run("متفورمین پانصد میلی گرم");
    expect(result.logical).toContain("⁨metformin 500 mg⁩");
  });
});

describe("punctuation preservation", () => {
  it("keeps full stops that sit between two untouched words", () => {
    // The substitution happens later in the sentence than the full stop.
    const result = run("وزن کودک پانزده کیلوگرم است. آزمایش خون پلاکت دویست هزار را نشان می دهد.");
    expect(result.plain).toContain("است. آزمایش");
    expect(result.plain).toContain("می دهد.");
  });

  it("never doubles a sentence terminator", () => {
    for (const text of ["تجویز شد.", "بیمار پایدار است.", "گزارش آماده است؟"]) {
      const plain = run(text).plain;
      expect(plain).not.toMatch(/[.؟]{2,}/);
    }
  });
});

describe("number parsing versus clinical phrases", () => {
  it("does not read a number word inside a term as a number", () => {
    // `سی` is both thirty and the first syllable of CT; `سی` in `ای وان سی`
    // must not swallow the following lab value.
    const result = run("هموگلوبین ای وان سی هفت و نیم درصد");
    expect(result.plain).toContain("HbA1c");
    expect(result.plain).toContain("7.5%");
  });

  it("still reads a number that merely follows a term", () => {
    const result = run("ده سی سی سرم");
    expect(result.plain).toContain("10 mL");
  });
});

describe("phrase trie", () => {
  it("prefers the longest match and never overlaps", () => {
    const trie = new PhraseTrie<string>([
      [["a"], "short"],
      [["a", "b"], "long"],
    ]);
    const scanned = trie.scan(["a", "b", "c"]);
    expect(scanned[0].value).toBe("long");
    expect(scanned[1].value).toBeUndefined();
  });
});

describe("safety", () => {
  it("flags a physiologically impossible blood pressure", () => {
    const result = run("فشار خون شانزده صد روی نود");
    expect(result.flags.some((f) => f.kind === "out-of-range")).toBe(true);
  });

  it("does not flag a normal reading", () => {
    const result = run("فشار خون یکصد و بیست روی هشتاد");
    expect(result.flags.some((f) => f.kind === "out-of-range")).toBe(false);
  });
});

describe("end to end", () => {
  it("produces the clinical note we promise", () => {
    const result = run(
      "بیمار آقای چهل و پنج ساله با فشار خون یکصد و پنجاه روی نود میلی متر جیوه و دیابت تایپ دو تحت درمان با متفورمین پانصد میلی گرم، کاندید سی تی اسکن با کنتراست می باشد",
    );
    expect(result.plain).toContain("45");
    expect(result.plain).toContain("BP 150/90 mmHg");
    expect(result.plain).toContain("type 2 DM");
    expect(result.plain).toContain("metformin 500 mg");
    expect(result.plain).toContain("CT scan");
    // Narrative stays Persian.
    expect(result.plain).toContain("بیمار آقای");
  });

  it("is deterministic", () => {
    const text = "دو قرص متفورمین پانصد میلی گرم روزانه مصرف شود";
    expect(run(text).plain).toBe(run(text).plain);
  });
});

/**
 * The rehearsal corpus is the product's acceptance test: these are the
 * sentences the engine is claimed to handle, asserted end to end so a
 * regression in any stage shows up here rather than in front of a clinician.
 */
describe("rehearsal corpus", () => {
  it("handles the hypertension follow-up", () => {
    const case_ = REHEARSAL_CASES.find((c) => c.id === "hypertension")!;
    const result = run(case_.utterance, { closeUtterance: true });

    expect(result.plain).toContain("45");
    expect(result.plain).toContain("BP 150/90 mmHg");
    expect(result.plain).toContain("type 2 DM");
    expect(result.plain).toContain("metformin 500 mg");
    expect(result.plain).toContain("atorvastatin 20 mg");
    expect(result.plain).toContain("CT scan");
    expect(result.plain).toContain("CCU");

    // Negations survive verbatim and are never dropped or reworded.
    expect(result.plain).toContain("سردرد ندارد");
    expect(result.plain).toContain("سرفه ندارد");
    const negations = result.flags.filter((f) => f.kind === "negation-scope");
    expect(negations.length).toBeGreaterThanOrEqual(2);
    // A drug substitution is tier 2: substituted, and raised for review.
    expect(result.flags.some((f) => f.kind === "review-term" && f.term.includes("metformin"))).toBe(true);
  });

  it("handles the paediatric intake and refuses to guess a confusable drug", () => {
    const case_ = REHEARSAL_CASES.find((c) => c.id === "paediatric")!;
    const result = run(case_.utterance, { closeUtterance: true });

    expect(result.plain).toContain("39 °C");
    expect(result.plain).toContain("15 kg");
    expect(result.plain).toContain("Plt 250000");
    expect(result.plain).toContain("Hb 10.2 g/dL");
    expect(result.plain).toContain("10 mL");

    // متوپرولول is tier 3: never substituted, always flagged.
    const ambiguous = result.flags.find((f) => f.kind === "ambiguous-term");
    expect(ambiguous?.term).toBe("متوپرولول");
    expect(result.plain).toContain("متوپرولول");
    expect(result.plain).not.toContain("metoprolol");
  });

  it("handles the negation-heavy review and catches the impossible reading", () => {
    const case_ = REHEARSAL_CASES.find((c) => c.id === "negation")!;
    const result = run(case_.utterance, { closeUtterance: true });

    expect(result.plain).toContain("BP 1600/90");
    expect(result.plain).toContain("HbA1c 7.5%");
    expect(result.plain).toContain("ECG");
    expect(result.plain).toContain("مصرف نمی کند");
    expect(result.plain).toContain("ندارد");

    const outOfRange = result.flags.find((f) => f.kind === "out-of-range");
    expect(outOfRange?.severity).toBe("danger");
    expect(outOfRange?.term).toBe("1600/90");
  });

  it("never lets a negation reach across a sentence boundary", () => {
    const result = run("بیمار سرفه ندارد. کاندید سی تی اسکن با کنتراست می باشد.");
    const scopes = result.flags
      .filter((f) => f.kind === "negation-scope")
      .map((f) => f.detail);
    expect(scopes).toHaveLength(1);
    expect(scopes[0]).toContain("بیمار سرفه");
    expect(scopes[0]).not.toContain("کاندید");
  });

  it("scopes a Persian negation over what precedes it", () => {
    const result = run("بیمار سرفه ندارد.");
    const scope = result.flags.find((f) => f.kind === "negation-scope");
    expect(scope?.detail).toContain("بیمار سرفه");
  });

  it("renders the same text it copies: pieces reassemble to plain exactly", () => {
    for (const case_ of REHEARSAL_CASES) {
      const result = run(case_.utterance, { closeUtterance: true });
      // The chart shows the pieces; the clipboard and the audit trail show
      // `plain`. If these diverge, what the clinician reads is not what the
      // chart receives.
      expect(result.pieces.map((p) => p.text).join("")).toBe(result.plain);
    }
  });
});
