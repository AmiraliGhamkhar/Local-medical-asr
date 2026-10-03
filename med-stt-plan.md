# Real-Time Persian-English Medical STT Platform

## Research, Architecture, and Execution Plan

**Status:** architecture plan, grounded in the current repository state
**Repo:** `shenava-med-stt` (`Local-medical-asr`)
**Last updated:** 2026-10-03, at commit `aba228a`

This document is the "plan of what we want to do". It covers the model research,
the backbone decision, streaming, code-switching, normalization, medical
terminology, Laya integration, and the self-hosted topology — followed by a
phased execution plan with explicit kill criteria, and an honest account of what
already exists in this repository versus what remains.

---

## 1. Executive summary

Iranian clinicians do not speak one language. They speak Farsi syntax wrapped
around English drug names, English procedure names, Latin abbreviations, and
numbers read aloud in Persian. Any system that assumes a single language fails
on real dictation.

The three models supplied, plus one reference repository, cover roughly 70% of
the requirement. The remaining 30% is the hard part, and it decides whether this
is a usable clinical tool or a demo.

| Asset | What it actually is | What it is **not** | Verdict |
|---|---|---|---|
| [`Reza2kn/Shenava-Koochik-v1.0-sherpa-onnx`](https://huggingface.co/Reza2kn/Shenava-Koochik-v1.0-sherpa-onnx) | Offline FastConformer-CTC, 114M params, 16 kHz mono, Persian-only. WER 7.5% on visualears, 10.6% on FLEURS-fa. Ships a Python Persian ITN helper. | Not streaming. Not bilingual. SentencePiece BPE-1024 trained on Persian text, so English medical terms ("metformin", "HbA1c", "CT") are out-of-vocabulary and decode as Persian character salad. | **Use as the Persian acoustic backbone.** Needs a streaming export and a vocabulary that contains English medical subwords. |
| [`superwhisper/s1-mini`](https://huggingface.co/superwhisper/s1-mini) | 0.6B Qwen3-derived inverse-text-normalization LM. English-only. Trained for text cleanup: punctuation, disfluency removal, written-form conversion. | Not an ASR. Not multilingual. Does zero useful work on Persian text. | **Use for English segments only**, after language segmentation. Requires a Persian counterpart that does not exist yet. |
| [`NandhaKishorM/laya`](https://github.com/NandhaKishorM/laya) | 0.2B-class non-autoregressive System-1 decision engine. Single forward pass, ~33 ms, typed choice/score/yes-no, 100+ languages. | Not an ASR. Not a normalizer. Cannot generate or rewrite text. | **Wrong tool for the front of the pipe, right tool for the back.** Use for clinical routing, red-flag detection, and confidence. |
| [`AmiraliGhamkhar/deepgram-fa-speech`](https://github.com/AmiraliGhamkhar/deepgram-fa-speech) | Windows desktop dictation: mic to Deepgram Nova to deterministic Persian FST normalization to Win32 text injection. Provider abstraction, DPAPI secrets, bounded audio queue, injection backend, audit rigour. | Not self-contained ASR. Depends on a commercial cloud API. | **Copy the architecture verbatim. Replace the engine.** The provider abstraction, injection layer, and security model are the highest-value part of this project. |

### The central problem, stated plainly

Published measurements of Persian-English code-switched speech recognition
put even the strongest commercial systems in the high teens to twenties of
word error rate, and heavy intra-word morphological blending ("CT-scan kardam",
"metformin-ro") pushes it higher. On Persian medical speech with dense
code-switching, large multilingual models degrade badly.

**None of the three supplied models is a code-switching ASR.** Shipped verbatim,
a clinician would see garbage on every English drug name. In a medical context
that is not a UX bug, it is a liability event.

So the plan is: Shenava as the Persian acoustic backbone, upgraded to streaming
and fine-tuned on code-switched medical speech; an English acoustic path beside
it; a code-switch-aware recombination layer; a bilingual normalization stack
(s1-mini for English, a purpose-built Persian ITN and punctuation path for
Farsi); a deterministic medical terminology layer for every safety-critical
span; Laya for post-ASR clinical classification; and the production patterns from
deepgram-fa-speech around the whole thing.

### What is already built in this repository

The deterministic half of the plan is implemented, tested, and merged. See
[Section 12](#12-current-state-what-exists-vs-what-remains) for the precise
boundary.

---

## 2. Hard requirements

A missing item here is not a backlog item, it is a reason the product does not
ship.

1. **Real-time streaming.** Under 300 ms from end-of-utterance to text on
   screen. Press-button-wait-five-seconds is dictation transcription, not
   real-time dictation.
2. **Persian-English code-switching** at word and sub-word level inside a single
   utterance. Intra-word morphological blending must resolve.
3. **Medical vocabulary safety net.** Drug names, doses, units, lab values,
   anatomy, and procedures recognized deterministically. A confusion between
   metformin and metoprolol is a dosing error.
4. **Number and unit fidelity.** Spoken Persian numerals, English numerals,
   decimals, ranges ("one twenty over eighty"), units (mg, mL, g/dL, mmol/L),
   dates, times.
5. **Negation preservation.** "ندارد", "نیست", "no", "denies", "without" must
   never be flipped. This is the single highest-severity failure class in
   clinical NLP, because a flipped negation turns a negative finding into a
   positive one.
6. **Self-hosted. No third-party cloud in the live path.** Patient audio must
   not leave the clinician's machine or a hospital-controlled server. No
   Deepgram, no OpenAI, no ElevenLabs at runtime.
7. **RTL/BiDi correctness.** Injected text must render Persian RTL with embedded
   English terms LTR in Word, web forms, and hospital EHR fields.
8. **Desktop-app rigour.** Termination hotkey, single instance, background
   overlay, OS-native secret storage, instrumented audio queue, reconnect logic.
9. **Audit trail.** The clinician must be able to see raw ASR output next to
   normalized output. Most jurisdictions expect this for medical dictation.
10. **Determinism for safety-critical spans.** Numbers, units, and drug names go
    through rule-based transducers, never through a generative model. This is why
    deepgram-fa-speech forbids LLMs in the transcription path, and the medical
    case is stronger still.

---

## 3. Asset deep-dive

### 3.1 Shenava-Koochik-v1.0

**Architecture.** FastConformer CTC, 114M params, 17 layers, `d_model` 512, 8x
subsampling (~80 ms per encoder step), NeMo log-mel with 80 bins, 16 kHz mono.

**Tokenizer.** `ve_tok_v4` SentencePiece BPE-1024, 1025 tokens including the CTC
blank. This is the entire code-switching bottleneck: the vocabulary was built
from Persian text, so Latin medical terms have no units and get byte-encoded
into Persian characters.

**Streaming.** The linked Hugging Face repository is the **offline** export.
Real-time requires either the tract-streaming export
(`Reza2kn/Shenava-Koochik-v1.0-tract-streaming`, cache-aware CTC) or the
`shenava-asr-server` Rust sidecar with `mode=streaming`, which additionally
gives a native Rust CTC beam decoder with hotword support. sherpa-onnx added
Shenava models, but the published bundle is explicitly the offline graph.

**Preprocessing trap.** NeMo log-mel features do **not** use per-feature
normalization. sherpa-onnx's default normalization must be disabled
(`normalize_type` left empty). Violating this produces audio-shaped garbage, and
it is the most common reason a working offline model "breaks" when moved to a
streaming setup.

**ITN.** The bundled `persian_itn.py` handles spoken Persian numbers to digits.
It is a Python script, not a transducer, and it does not cover dates, units,
currency, time, or mixed-language numerals.

### 3.2 s1-mini

Fine-tuned from Qwen3-0.6B, BF16, 596M unique params. English-only: the control
line in training explicitly specified English. Output contract is rigid — system
prompt plus `[Styling: ...] [Structure: ...] [Context: ...]` control line plus
transcript in, cleaned text out.

Two failure modes to design around:

- `enable_thinking` **must** be set to `False`, or output is empty.
- It hallucinates if the prompt deviates from the trained shape.

0.6B fits CPU comfortably; GGUF Q4_K_M is 462 MB; llama.cpp, vLLM, and SGLang all
work.

**How to use it.** Feed only the English segments produced by language
segmentation. Never send it Persian. For clinical text add
`[Styling: formal] [Structure: prose] [Context: general]` and keep
`max_new_tokens` tight at roughly 1.3x input plus 32.

**What it will not do out of the box.** "blood pressure one twenty over eighty"
becoming "120/80" is not guaranteed, and no amount of prompting makes a
generative model an acceptable place to compute a blood pressure reading. Put a
deterministic pre-normalization FST in front of it that protects known medical
patterns, and let it handle only prose cleanup.

### 3.3 Laya

Non-autoregressive classifier. One forward pass, ~33 ms, over 100+ languages
with script-detection routing. Supports typed schemas (choice, score, noul) and
fine-tuning with RLCD; the project reports accuracy lifts from 0.36 to 0.77 on
typed decisions after fine-tuning.

This is not a speech or text-generation component. It is the safety and
intelligence layer that runs after text exists.

Load the **multilingual** checkpoint with `max_len` 8192 and let the router pick;
English-only chunks can also be routed to the English checkpoint. Fine-tune on
clinical notes once there is data; the base model is a starting point.

### 3.4 deepgram-fa-speech (reference architecture)

**Copy verbatim:**

- The `STTProvider` abstract interface. This is what lets the acoustic backend
  be swapped without touching the pipeline. In this repository it is
  `src/stt/provider.ts`.
- Host-based secret minting, for deployments where a hospital LAN server holds
  the GPU model and clients fetch short-lived session tokens.
- OS-native secret storage: DPAPI on Windows, Keychain on macOS, libsecret on
  Linux.
- Bounded, instrumented audio queue with explicit drain, reconnect policy with
  exponential backoff, and an error taxonomy.
- Deterministic processing order: normalize, protect numbers, FST terminology,
  BiDi, inject.
- `InjectionBackend` abstraction with delta-backspacing so only the changed tail
  of a partial hypothesis is retyped, not the whole sentence. This is the
  difference between a productivity tool and a demo window.
- Floating overlay, single-instance mutex, standalone build, and build-time
  secret scanning that refuses to start if a key is in a config file.

**Discard:**

- Deepgram as the backend.
- The assumption of a single language in the stream.
- The absolutism of "no model in the path". For clinical use we do want a
  Laya-class model for confidence routing and section detection. What we must
  not do is let a generative model rewrite dosage numbers.

---

## 4. Backbone selection

This is the hardest technical decision in the project. Four realistic options,
ranked honestly.

### Option A: Shenava streaming, fine-tuned on code-switched medical speech

**For:** Best open Persian acoustic model (7.5% WER on general Persian). Open
weights, Apache 2.0. 114M params runs on edge hardware. A Rust streaming server
already exists.

**Against:** The tokenizer is Persian-only. English medical terms will be
byte-encoded into Persian characters. Without fine-tuning, code-switched WER on
English terms will be catastrophic, plausibly 30% or worse.

**Required work:**

- Extend the SentencePiece vocabulary with Latin characters and common medical
  subwords. Re-train BPE, or augment the vocabulary with an English medical
  token list.
- Fine-tune FastConformer CTC on a code-switched Persian-English medical corpus.
  Data sources, in order of value:
  1. Record a 10 to 20 hour gold set from real clinicians. Slow, needs ethics
     approval, non-negotiable before production.
  2. Existing Persian academic medical speech corpora, where obtainable through
     research collaboration.
  3. Synthesized code-switched speech from written CS medical notes using a
     Persian-capable TTS. Cheap, scalable, and a reasonable bootstrap.
  4. CommonVoice-fa concatenated with English medical speech subsets, to
     establish the mixed-language acoustic prior.
- Re-export to ONNX for sherpa-onnx online NeMoCTC, or use the tract streaming
  graph.
- Enable hotword biasing in the CTC beam decoder so drug names are favoured at
  decode time rather than repaired afterwards.

**Expected result:** 15 to 20% WER on medical code-switching after fine-tuning.
Better than reported large-model baselines, not yet clinical-grade alone. Which
is precisely why the safety net in Section 7 is not optional.

### Option B: Whisper large-v3 or distil-large-v3 with VAD chunking

**For:** Natively multilingual, handles code-switching out of the box, strong
English. faster-whisper (CTranslate2) runs large-v3 at roughly 2x realtime on a
mid-tier GPU. sherpa-onnx supports Whisper.

**Against:** Whisper is structurally non-streaming, with 30-second windows.
"Real-time" Whisper is chunked VAD plus buffering, which adds 1 to 3 seconds of
latency — noticeable in dictation. Persian WER is reasonable on clean speech but
degrades on English terms in Persian-accented speech. Large-v3 at ~1.5 GB
quantized forces a GPU.

**Verdict:** Strong fallback. Valuable as an **offline re-transcribe pass** over
completed utterances, where latency does not matter and accuracy does.

### Option C: SenseVoice-L via FunASR

**For:** Supports 50+ languages, very fast, non-autoregressive, does language ID
and audio-event detection, has an OpenAI-realtime-compatible server, ONNX
runnable, Apache 2.0.

**Against:** Persian quality is not clearly isolated in public benchmarks, and
fa-en code-switching is unproven. Newer, with a smaller Persian ecosystem.

**Verdict:** Benchmark in Week 1 alongside Shenava. If it lands under 15% WER on
the medical code-switch eval set with no fine-tuning, it becomes a much cheaper
backbone than Option A.

### Option D: Two-model routing — recommended production architecture

Run a small streaming Persian model for instant partial hypotheses. At
endpoint, re-score the full utterance with a larger bilingual model. Route
English-heavy segments through an English specialist based on language ID.

**For:** Low-latency partials plus high-accuracy finals. This is the standard
shape for every production multilingual realtime system.

**Against:** More engineering, and recombination is fiddly. An off-by-one at
word boundaries produces doubled or skipped words, which is exactly the failure
a clinician will notice and blame on the tool.

**This is the recommendation.** Concretely: Shenava-Rizeh-class streaming for
partials, fine-tuned Shenava-Koochik or distil-large-v3 for utterance-final
rescoring, and a language-ID gate to dispatch English-heavy segments to a
streaming Zipformer or Paraformer English model, recombined at word level using
timing alignment.

### Supporting components

**Language ID.** sherpa-onnx ships spoken language identification models. Use one
as the routing gate. Minimum class set: `fa`, `en`, `fa-en-mixed`, silence,
noise. Threshold the mixed class to trigger the two-model path.

**VAD.** Silero VAD via sherpa-onnx. Not optional. Required to avoid burning
compute on silence, to drive endpoint detection for utterance-final rescoring,
and to power push-to-talk and hands-free modes.

Configure it for dictation, not for telephony: a long trailing-silence threshold
(clinicians pause mid-sentence to think), a minimum utterance length so a cough
or a closing door does not trigger the pipeline, and no maximum-utterance cut-off
in dictation mode because clinicians legitimately talk for minutes.

---

## 5. Real-time streaming

### 5.1 Latency budget

| Stage | Budget | Notes |
|---|---|---|
| Mic capture and resampling | 5 ms | 48 or 44.1 kHz to 16 kHz mono |
| VAD framing | 5 ms | 30 ms frames, 300 ms lookahead |
| Partial hypothesis update | 40 ms | Small streaming model, per frame |
| Overlay render | 16 ms | One frame at 60 fps |
| **Partial-to-screen total** | **~70 ms** | Feels instant |
| Endpoint detection | 1.2 s trailing silence | Dictation-tuned, not telephony |
| Utterance-final rescore | 200 to 400 ms | Runs while the user is still pausing |
| Deterministic pipeline | < 5 ms | Already measured, see Section 12 |
| **End-of-speech-to-final-text** | **~1.6 s** | Within the 300 ms *processing* budget once speech has ended |

The 300 ms requirement in Section 2 is measured from end-of-utterance to final
text, excluding the trailing silence that defines where the utterance ends.
Reporting it that way would be dishonest; the table above separates the two.

### 5.2 Endpointing rules

- **Interim pause, 1.2 s of trailing silence.** Continue listening, do not
  finalize. This is the "thinking" pause.
- **Utterance final, 2.4 s of trailing silence.** Finalize, rescore, inject.
- **Explicit push-to-talk release.** Finalize immediately, regardless of VAD.
- **No max-utterance cut-off in dictation mode.**

### 5.3 Injection

Delta-backspacing: compare the new hypothesis to the previously injected text,
find the common prefix, emit backspaces for the divergent tail, then type the new
tail. Re-injecting the whole sentence on every partial is visibly wrong and
makes the tool unusable in a shared clinical workstation.

For the finalized text, prefer clipboard paste over keystroke synthesis. It is
faster, immune to keyboard layout and IME interference, and preserves the BiDi
isolates exactly.

---

## 6. Code-switching processing

The hard part is not detecting that two languages are present. It is
recombining them without corrupting either.

### 6.1 Why naive reassembly fails

- Acoustic language boundaries do not match semantic boundaries. A Persian verb
  ending attaches to an English noun: "metformin خورد" must not become
  "metforminخورد", and equally must not become "metformin خورد" if the clinician
  said "متفورمین خورد" and the model split the token.
- Persian uses Arabic-script joining behaviour that Latin insertions break.
- Target applications differ. Word, browser textareas, and hospital EHR
  templates each treat bidirectional marks differently, and none of them can be
  assumed.

### 6.2 Approach

1. **Segment by timing, not by character.** Use the language-ID gate output and
   the streaming model's per-token timestamps to produce language-tagged spans.
2. **Re-span at boundaries.** Merge spans that straddle a boundary, then re-split
   on whitespace and morphological attachment. A span that is majority-Persian
   with a Latin prefix keeps them glued; a standalone Latin token gets padded.
3. **Normalize each span independently.** Persian spans through the Persian ITN
   path, English spans through s1-mini. Never send Persian to s1-mini.
4. **Reassemble with Unicode isolates.** Use `FSI`/`PDI` and `LRI`/`RLI` rather
   than raw `RLM`/`LRM` characters. Isolates are scoped, so they cannot leak into
   adjacent text the way legacy marks do. This is a concrete improvement over the
   raw marks used in the reference repository's bidi handling.
5. **Verify the invariant.** For every utterance, stripping the isolates must
   yield exactly the plain reading-order text, and that text must equal what was
   inserted into the chart. This is asserted in the test suite for every case,
   not just spot-checked.

### 6.3 Terminology consistency

A Persian doctor saying "متفورمین" and an English reference list saying
"metformin" must converge on one canonical spelling. That is the job of Section 7,
and it is why reassembly happens before terminology substitution.

---

## 7. Text normalization

### 7.1 Persian ITN — the piece that has to be written from scratch

s1-mini covers English. There is no drop-in open Persian equivalent.

**Option 1: extend an existing WFST toolkit.** NeMo-text-processing and
WeTextProcessing both ship transducer grammars for many languages, and Persian is
**not** among them (NeMo ships EN, DE, ES, FR, HU, IT, NL, PT, RU, SV, vi, zh,
AR, HI). Persian cardinal, ordinal, decimal, date, time, money, measure, and
whitelist grammars must be written. One to two weeks for someone who knows
Pynini. This is the deterministic option, and determinism is the requirement.

**Option 2: train a small Persian punctuation and ITN model.** ~100M params over
punctuated Persian news and book text plus synthetic spoken-to-written pairs.
ParsBERT-v2 based, non-generative, and well-precedented in the Persian academic
literature.

**Recommendation: a hybrid.** Deterministic transducer grammars for everything
that carries clinical meaning, numbers, units, dates, and ranges. A small
punctuation model, or rules, for prosody only. Generative models never touch
numeric spans.

### 7.2 Number protection

Before any model runs, numeric spans are lifted into protected segments and
replaced by sentinels. The model sees prose. The sentinels are restored
afterwards, untouched. This is the mechanism that makes it safe to put an
s1-mini-class model anywhere in the path, and it is implemented in this
repository as `protectNumbers` in the pipeline.

Recognition rules must cover:

- Spoken Persian cardinals, including the compound forms (`سی و دو` = 32,
  `صد و پنجاه` = 150)
- Persian decimal separator and digit zero
- English numerals that survive the ASR pass
- Ranges: "one twenty over eighty" and "سی روی چهل" to `120/80` and `30/40`
- Units, decimals, percentages, and ordinals

**Known gap, recorded deliberately.** ASCII digit input (`160/80`) currently
passes through without unit folding or plausibility checking, so
`فشار خون 1600 روی 90` produces no flag. Real ASR frequently emits digits rather
than spelled-out numerals, so this is a genuine robustness hole. Adding a
second number grammar carries its own risk of misparsing values, and the
existing corpus is all spelled-out Persian, so it needs its own change and its
own gold pairs rather than a patch.

### 7.3 Negation fidelity

Negation is protected on three axes:

1. **Cue detection.** Persian negation is overwhelmingly postposed: the `ن`/`م`
   prefix attaches to the verb ("نمی‌خورد", "ندارد", "نیست"), and preposed forms
   exist but are the minority. A forward-only scan misses the common case.
2. **Scope.** Negation must not leak across a clause boundary. A `ندارد` at the
   end of one sentence does not negate the next sentence. Scope is computed
   within clause bounds defined by `. ! ? ؟ ۔ ; ؛ newline ،`.
3. **Protection.** Once scope is computed, the whole negated span is frozen
   against downstream stages.

English negations ("no", "denies", "without", "negative for", "no evidence of")
are preserved verbatim. A full Persian morphological analyzer (Hazm or
PerStanza) is the right tool for detecting negation scope reliably; the current
implementation is rule-based over clause bounds, which is correct for the cases
it covers and will over-fire on unlisted morphological forms.

A hard-won detail: `دیده` and `مشاهده` mean "seen" and are **not** negation cues.
Listing them as cues made every normal finding ("a defect was seen") raise a
negation flag, which trains the clinician to dismiss the flag that is supposed to
catch `ندیده`. Flag noise in a safety system is worse than no flag.

### 7.4 Punctuation

Partial hypotheses get no punctuation; they are visibly provisional. Final text
gets Persian punctuation from the rules or model in Section 7.1. s1-mini handles
English punctuation in English segments.

### 7.5 Pipeline order

The order is load-bearing and not interchangeable:

```
normalize → protectNumbers → attachUnits → protectNegations
          → applyTerminology → applyPunctuation → checkPlausibility
          → assemble (BiDi) → tidySpacing → isolateLatinRuns
          → stripIsolates → buildPieces
```

Each stage may only read what earlier stages produced. A later stage never
rewrites an earlier stage's output for a protected span. This is what makes the
pipeline testable stage by stage and auditable flag by flag.

---

## 8. Medical terminology

### 8.1 A bidirectional, safety-tiered lexicon

Built in this repository as `src/data/lexicon.ts`. Tiers are the whole point.

**Tier 1 — safe to rewrite automatically.** Unambiguous canonical mappings:
`متفورمین` → `metformin`, `آتورواستاتین` → `atorvastatin`, `آسپرین` → `ASA`.
Applied silently.

**Tier 2 — apply, but flag for review.** Mappings that are standard but where a
clinician's phrasing may be deliberate. Applied, with an inline mark and a
review flag.

**Tier 3 — never guess.** Clinically ambiguous near-homophones. `متوپرولول`
(metoprolol) is flagged as ambiguous rather than auto-resolved, because the
difference between metoprolol, metformin, and metoclopramide is a dosing
decision. **Never guess here.** This tier is why the system can be trusted at
all: an ASR that mangles a drug name must not then confidently substitute a
different drug name.

### 8.2 Coverage

- **Drugs**: generic and brand names common in Iran, with dose forms
- **Labs**: CBC, HbA1c, FBS, BUN, Cr, Na, K, LDL, HDL, TG, TSH, T4, WBC, RBC, Hb,
  Hct, Plt, with Persian transliterations
- **Vitals**: BP, HR, Temp, RR, SpO2 with Persian spoken forms
- **Units**: mg, mL, cc, g, mcg, mEq, mmol/L, mg/dL, mmHg, bpm, %
- **Procedures and imaging**: CT, MRI, X-ray, echocardiography, endoscopy,
  colonoscopy
- **Anatomy and conditions**: STEMI, NSTEMI, AFib, COPD, asthma, diabetes,
  hypertension, MI, CVA

A note on scope discipline found during implementation: `آزمایش ادرار` maps to
`UA` (urinalysis) and `کشت ادرار` maps to `UC` (urine culture). An earlier
version rewrote these to the English words "urinalysis" and "urine culture",
which is a narration rewrite, not a normalization. The stated policy is that the
pipeline does not rewrite narrative, and the lexicon now follows its own policy.

### 8.3 Lexicon maintenance

The tiers and mappings are data, not code, so they must be editable without a
release. Custom terms are stored per user in Convex (`customTerms`), which lets
a department add its own formulary and hospital abbreviations without touching
the shared lexicon. That table is already implemented and tenant-isolated.

### 8.4 Hotword biasing — prevention, not repair

The lexicon above fixes terms after recognition. Decoder hotword biasing boosts
the probability of known medical terms *during* beam search, so the wrong word is
never proposed. Shenava's Rust beam decoder supports word-guide hotwords.

These are complements and both are needed. Biasing reduces the error rate; the
deterministic tier system guarantees that when an error survives, it is flagged
rather than silently rewritten.

---

## 9. Laya integration

Laya runs after text exists. Its 33 ms single-forward-pass latency makes it
usable inline, per utterance, without becoming a bottleneck.

Ordered by clinical value:

1. **Code-switch boundary classification.** For each detected boundary, decide
   what it is: English drug name, English measurement, a general English word
   that should be preserved as-is, or a Persian word the acoustic model
   misrecognized as English. This directly feeds the reassembly logic in
   Section 6 and is the highest-value use of the model.
2. **Section routing.** Label the utterance HPI, ROS, physical exam, assessment,
   plan, or prescription, for auto-structuring into EHR fields.
3. **Red-flag detection.** Escalate the UI when the clinician says something
   suggesting an emergency: "chest pain radiating to jaw", "anaphylaxis".
4. **Negation scope confidence.** Given "سرفه ندارد", report confidence that
   `ندارد` negates `سرفه`, as a cross-check on the rule-based scope in
   Section 7.3.
5. **Plausibility.** Given a BP, glucose, or HbA1c, decide whether the value is
   physiologically possible or is more likely an ASR misrecognition.

Items 4 and 5 cross-check existing deterministic logic. That redundancy is
intentional: the rules are auditable and fast, and the model catches what rules
miss. Disagreement between the two is itself a strong review signal.

**Fine-tuning.** Train on clinical notes once data exists. Expect the same lift
the project reports for its own typed decisions. Do not deploy base-model
classifications into a clinical alerting path without domain fine-tuning first.

**Boundary.** Laya does not generate or rewrite text, by design. It never edits
a note. If a future change makes it able to, that change breaks requirement 10.

---

## 10. Self-hosted architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ CLIENT (desktop, Nuitka or Electron standalone build)                │
│                                                                      │
│  Mic / loopback ──► Silero VAD (sherpa-onnx, local) ──► endpointing │
│         │                                                            │
│         ▼                                                            │
│  Bounded, instrumented audio queue (drop-oldest on overflow)         │
│         │                                                            │
│         ▼                                                            │
│  Language-ID gate ──► fa-heavy ──► Shenava streaming                │
│                       en-heavy ──► streaming Zipformer-en           │
│                       mixed ────► both, aligned at word boundaries   │
│         │                                                            │
│         ├─► Overlay UI (greyed partial text, ~70 ms)                │
│         │                                                            │
│  [endpoint] ──► Utterance-final rescore (larger bilingual model)     │
│         │                                                            │
│         ▼                                                            │
│  Language-segmented transcript                                       │
│    ├── Persian segments ──► Persian ITN + punctuation               │
│    └── English segments ──► s1-mini (formal/general)                │
│         │                     both with numeric/negation guards      │
│         ▼                                                            │
│  Code-switch reassembly (timing-aligned, FSI/RLI/PDI isolates)       │
│         ▼                                                            │
│  Medical terminology layer (tiered, deterministic)                   │
│         ▼                                                            │
│  Plausibility + Laya classification (section, red flag, confidence) │
│         ▼                                                            │
│  Final text + inline metadata (flags, low-confidence spans)          │
│         ▼                                                            │
│  Injection backend (Win32 SendInput / macOS AX / clipboard paste)    │
│         ▼                                                            │
│  Floating overlay · termination hotkey · audit log panel            │
└──────────────────────────────────────────────────────────────────────┘
                    │ optional, for GPU deployments
                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│ SELF-HOSTED HOST (hospital LAN server)                               │
│  FastAPI + HTTPS                                                     │
│    POST /v1/session   mints a short-lived JWT (shared-secret auth)   │
│    WS   /v1/stream    accepts audio chunks, returns partial + final   │
│  Holds the GPU-bound models when the client is CPU-only             │
│  Rate limited per client                                             │
│  No outbound calls to third-party APIs                               │
└──────────────────────────────────────────────────────────────────────┘
```

**The host exists for one reason:** some clinician workstations cannot hold a
GPU. Everything else runs on the client so that dictation keeps working when the
LAN does not. The host is an accelerator, not a dependency.

**Security model**, inherited from the reference repository:

- Short-lived session tokens, never a long-lived API key on the client
- OS-native secret storage: DPAPI, Keychain, libsecret
- Refuse to start if a key is found in a config file
- Build-time source scan for key patterns
- Single-instance mutex
- Audio in memory only; persist text, never audio, unless the clinician
  explicitly records a session

**Data minimisation, already reflected in the Convex schema:** no audio and no
raw patient identifiers are stored. An utterance keeps what the acoustic model
produced, what normalization made of it, and what the clinician accepted. That
is what an audit trail needs, and it is what a data-minimisation policy can
survive.

---

## 11. Repository layout

The TypeScript implementation in this repository:

```
src/
├── audio/          mic capture, resampling, VAD, PCM encoding
├── stt/            STTProvider interface, rehearsal provider, Shenava client
├── processing/     the deterministic pipeline, stage by stage
│   ├── normalize.ts        Unicode, digits, ZWNJ
│   ├── numbers.ts          spoken Persian numerals, protection sentinels
│   ├── units.ts            unit canonicalization and attachment
│   ├── negation.ts         cue detection and clause-bounded scope
│   ├── terminology.ts      tiered lexicon rewriting
│   ├── punctuation.ts      final-pass punctuation
│   ├── safety.ts           physiological plausibility ranges
│   ├── bidi.ts             isolate wrapping, logical/plain views
│   ├── fst.ts              longest-match rewriter
│   └── pipeline.ts         stage order, assembly, piece building
├── data/           the tiered clinical lexicon
├── components/     studio UI: transcript, chart target, audit, lexicon manager
├── convex/         schema, auth, sessions, custom terms, utterances
├── lib/            Convex client, auth context, hotword export, dictation hook
└── pages/          landing, auth, studio
```

Planned additions, following the reference repository's structure:

```
stt/
├── whisper_provider.ts      faster-whisper / sherpa-onnx rescorer
├── english_provider.ts      streaming English specialist
├── two_pass_provider.ts     partial + utterance-final
├── cs_router.ts             language-ID gate and dispatch
└── reconnect.ts             backoff and error taxonomy
intelligence/
└── laya_router.ts           section, red flag, confidence, plausibility
host/
├── app.py, models.py, core.py, Dockerfile, requirements.txt
training/
├── shenava_finetune.py, synthesize_cs.py, punct_train.py, laya_finetune.py
scripts/
├── download_models.py, eval_wer.py, build_windows.ps1
eval/
├── medical_cs_eval/         held-out gold set
└── benchmarks.md            WER per category per configuration
```

---

## 12. Current state: what exists vs. what remains

Being explicit, because the plan and the repository are not the same thing.

### Implemented and verified

The **deterministic text pipeline** is complete and tested end to end: all seven
stages, the protection mechanism, BiDi assembly with isolates, piece building,
and tiered terminology. Verified by 130 automated tests, with the Convex
backend covered by 14 integration tests against a live local deployment.

Specific defects found and fixed during verification, all of which were real
clinical-safety issues rather than cosmetic ones:

- A ZWNJ-spoken unit (`میلی‌گرم`) matched as two words but occupied three
  tokens, so the code cut the token list by word count and left a dangling
  `گرم` behind. `متفورمین پانصد میلی‌گرم` rendered as `metformin 500 mg گرم`: a
  corrupted dose. Fixed by cutting on token index.
- ZWNJ was treated as an ordinary separator when rebuilding text, so `می‌شود`
  became `می‌ شود` and `کم‌خونی` became `کم خونی`. ZWNJ must be a boundary for
  matching and a joiner for output.
- `دیده` and `مشاهده` were listed as negation cues, so ordinary findings raised
  negation flags.
- Multi-line input broke the read/copy invariant: the rendered note and the text
  inserted into the chart differed by their whitespace. A clinician would read
  one thing and sign another.
- The chart target re-appended the same utterance indefinitely, and the transcript
  view silently dropped whitespace between pieces.

Also implemented: the audio capture and resampling path, an RMS VAD, the
`STTProvider` interface with a labelled rehearsal provider, a Shenava websocket
client, the full Convex backend (registration, PBKDF2 password hashing, bearer
tokens, sessions, custom terms, committed utterances with a raw/normalized/final
audit triple), and the studio UI.

### Not implemented

Honest inventory of what the plan above calls for and the repository does not
yet contain:

- **Live Shenava recognition.** The websocket protocol is unit-tested (PCM
  framing, ping, token header, commit, error path, malformed frames). The Rust
  sidecar is not in this environment. Recognition accuracy is unmeasured.
- **Silero VAD.** The current implementation is RMS energy based. It works and
  is tested, but it will trigger on breath and desk noise in a clinical room.
- **Language-ID routing and the two-pass provider.** Partials come from a single
  provider; there is no English specialist and no utterance-final rescore.
- **Acoustic code-switching.** Shenava is Persian-only. English appearing in the
  transcript is handled by terminology substitution over Persian narration, not
  by recognizing English speech. **The mixed-language acoustic capability does
  not exist.**
- **s1-mini integration.** Not wired.
- **Laya integration.** Not wired. The plausibility checks that exist are
  deterministic range checks, not model-based classification.
- **Persian punctuation model.** Punctuation is rule-based.
- **Injection backends.** The chart target in the studio is the injection
  mechanism for the web build. There is no Win32 SendInput or macOS Accessibility
  backend.
- **Desktop shell.** No overlay window, no hotkey, no single-instance mutex.
- **Host tier.** No FastAPI host, no session-token minting.
- **Fine-tuning and evaluation harness.** No gold eval set, no WER numbers.

### Unverified claims in this document

Everything in "Not implemented" is an architectural position, not a
measurement. The performance targets in Section 5.1 are budgets derived from
component characteristics, not benchmarks. The 15 to 20% WER estimate in
Section 4 is a projection. **No WER number for this system exists yet.**

---

## 13. Phased execution plan

### Phase 0: Foundation and evaluation (Weeks 1 to 2)

**Do not trust any assumption in this document. Measure it first.**

- Build a held-out medical code-switch gold set: 500 utterances. Two or three
  clinicians dictate 50 sample notes each spanning HPI, exam, assessment and
  plan, transcribed and time-aligned by hand. WER on random Persian YouTube
  audio means nothing.
- Build a 5000-utterance synthetic code-switch stress set using a
  Persian-capable TTS over written code-switched medical notes.
- Benchmark on both: Shenava-Koochik offline (baseline), Shenava on
  English-only medical terms (expect failure, quantify it), Whisper large-v3,
  distil-large-v3, and SenseVoice-L if Persian quality is competitive.
- **Report WER per category**: Persian function words, Persian content words,
  English drug names, English general vocabulary, numbers, units, negations. A
  single aggregate number hides exactly the failure that matters.
- Stand up the tract streaming server and measure streaming latency and partial
  hypothesis stability.
- Verify the sherpa-onnx online NeMoCTC export path end to end, and document
  which export path we are committing to.

**Kill criterion.** If Shenava cannot reach under 25% WER on English drug names
even with hotword biasing, abandon Option A for the code-switched acoustic path
and move it to Whisper or SenseVoice.

**Deliverable:** `eval/benchmarks.md` with hard numbers. No more "I think this
model works."

### Phase 1: Streaming core, single language (Weeks 3 to 5)

Goal: microphone to injected text, Persian only, no medical guardrails yet.
Find the audio, UI, and injection bugs on non-medical dictation.

- Implement the `STTProvider` interface against the streaming backend chosen in
  Phase 0
- Silero VAD with dictation-tuned endpointing
- Audio capture, resample to 16 kHz mono, bounded queue with drain
- Injection backends for Windows, macOS, and Linux, with a dry-run mode
- Floating start/stop control and overlay showing partial and final text
- Single-instance mutex, termination hotkey, model hot-reload

### Phase 2: Bilingual routing and two-pass rescoring (Weeks 6 to 7)

- Integrate spoken language ID and build the router
- Add the streaming English specialist
- Two-pass provider: lightweight partials, larger utterance-final rescore
- Word-level timing alignment between partial and final, so injection updates
  are stable diffs rather than full re-injections
- Code-switch reassembly with BiDi isolates

### Phase 3: Bilingual normalization and medical safety (Weeks 8 to 10)

The phase that decides whether this is shippable.

- Write Persian transducer ITN grammars: cardinal, ordinal, decimal, fraction,
  date, time, units, currency, ranges
- Train or integrate a Persian punctuation model
- Extend the lexicon to full tiered coverage and hotword export
- Wire the existing deterministic pipeline to the streaming path
- Differential test: the rehearsal corpus must produce identical output whether
  the input came from the rehearsal provider or a live one

### Phase 4: Clinical intelligence (Weeks 11 to 12)

- Integrate Laya: boundary classification, section routing, red flags,
  negation cross-check, plausibility cross-check
- Fine-tune on clinical notes
- Alerting UI with dismissal-to-teach feedback

### Phase 5: Desktop hardening and distribution (Weeks 13 to 16)

- Floating overlay, hotkeys, single instance, secret storage, reconnect policy
- Standalone builds for Windows, macOS, and Linux
- The optional self-hosted host with session-token minting
- Load, soak, and disconnect testing

**Beta gate:** no section-4 or section-5 critical error in 500 consecutive
clinical utterances from at least three clinicians, and under 15% WER on the
held-out medical code-switch set.

---

## 14. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Shenava cannot recognize code-switched speech without a fine-tune | High | Phase 0 measures this before anything is built. Kill criterion defined. Fallback is Option D with a Whisper rescorer. |
| No Persian code-switch training data exists at reachable cost | High | Synthetic TTS bootstraps; the clinician-recorded gold set is non-negotiable and needs ethics approval started early. |
| The tier-3 ambiguous list is incomplete | **Critical** | An unmapped ambiguous drug name is silently accepted. Needs review by a clinical pharmacist, and needs a policy for unrecognized near-homophones. |
| English medical terms are out-of-vocabulary | High | Vocabulary augmentation plus hotword biasing. Quantified in Phase 0. |
| Latency budget is optimistic | Medium | Measured in Phase 0, not assumed. Streaming models vary enormously in per-frame cost. |
| A generative model corrupts a number | **Critical** | Numeric protection with sentinels, verified by test. The invariant is that no generative stage ever sees a numeric span. |
| Rule-based negation misses a morphological form | High | Clause-bounded scope, Laya cross-check in Phase 4, and the flag is shown to the clinician rather than silently applied. |
| No accuracy measurement on real clinical audio | High | The Phase 0 gold set exists precisely to close this. Until then every number in this document is a projection. |

---

## 15. Summary

Shenava is the right Persian backbone and a wrong code-switching solution.
s1-mini normalizes English text and is useless on Persian. Laya is a fast
classifier and belongs after the transcript, not before it. The reference
repository's architecture is worth copying in full; only its engine is wrong.

The parts that make this a medical product rather than a transcription demo are
all deterministic: numeric protection, unit canonicalization, clause-bounded
negation scope, and a three-tier terminology lexicon whose top tier refuses to
guess. Those parts are built and tested in this repository today.

The parts that make it good — real streaming, a bilingual acoustic path,
language-ID routing, utterance-final rescoring, and measured accuracy — have not
been started. The first thing to build is not any of them. It is the evaluation
harness, because every architectural decision above is currently a hypothesis,
and the cost of finding out a hypothesis is wrong after writing the software is
much higher than finding out now.