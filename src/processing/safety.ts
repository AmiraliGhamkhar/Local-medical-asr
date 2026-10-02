/**
 * Physiological plausibility checks.
 *
 * This is not a diagnosis system and does not claim to be. It is a cheap,
 * deterministic tripwire: a blood pressure of 1600/90 or a heart rate of 6 is
 * almost always an ASR error, not a patient, and the clinician should see it
 * before it reaches the chart. Every flag is advisory and none of them
 * rewrites the transcript.
 */

import type { RichText, SafetyFlag, Segment } from "./types";

interface RangeRule {
  label: string;
  min: number;
  max: number;
  unit?: string;
}

const BP_SYSTOLIC: RangeRule = { label: "systolic BP", min: 70, max: 260, unit: "mmHg" };
const BP_DIASTOLIC: RangeRule = { label: "diastolic BP", min: 40, max: 160, unit: "mmHg" };
const HEART_RATE: RangeRule = { label: "heart rate", min: 30, max: 220, unit: "bpm" };
const TEMPERATURE: RangeRule = { label: "temperature", min: 30, max: 43, unit: "°C" };
const SPO2: RangeRule = { label: "SpO2", min: 70, max: 100, unit: "%" };
const ORAL_DOSE: RangeRule = { label: "oral dose", min: 0.01, max: 10_000, unit: "mg" };
const INFUSION_RATE: RangeRule = { label: "infusion rate", min: 1, max: 2000, unit: "mL" };

/**
 * Local context that upgrades a bare number to a vital sign.
 *
 * Triggers are deliberately specific. A bare «خون» appears in «آزمایش خون»
 * and would otherwise turn every haemoglobin value into an impossible blood
 * pressure, which is exactly the kind of false alarm that trains a clinician to
 * ignore the flag.
 */
const VITALS_TRIGGERS: Array<[string, RangeRule]> = [
  ["فشار خون", BP_SYSTOLIC],
  ["فشار", BP_SYSTOLIC],
  ["systolic", BP_SYSTOLIC],
  ["سیستولیک", BP_SYSTOLIC],
  ["نبض", HEART_RATE],
  ["ضربان", HEART_RATE],
  ["اشباع", SPO2],
  ["spO2", SPO2],
];

/** Units that mean a laboratory value, which is never checked against vital ranges. */
const LAB_UNITS = new Set(["g/dL", "mg/dL", "mmol/L", "%"]);

function nearestContextWords(segments: Segment[], index: number, window: number): string {
  const parts: string[] = [];
  for (let i = index - 1; i >= 0 && parts.length < window; i -= 1) {
    if (segments[i].kind === "text") parts.unshift(...segments[i].text.split(" "));
  }
  return parts.join(" ");
}

function ruleForContext(context: string | undefined, unit: string | undefined): RangeRule | undefined {
  if (context === "bp") return BP_SYSTOLIC;
  if (unit === "°C") return TEMPERATURE;
  if (unit === "bpm") return HEART_RATE;
  if (unit === "mg") return ORAL_DOSE;
  if (unit === "mL") return INFUSION_RATE;
  if (unit && LAB_UNITS.has(unit)) return undefined;

  for (const [trigger, rule] of VITALS_TRIGGERS) {
    if (context?.toLowerCase().includes(trigger.toLowerCase())) return rule;
  }
  return undefined;
}

export function checkPlausibility(rich: RichText): RichText {
  const flags: SafetyFlag[] = [...rich.flags];

  rich.segments.forEach((segment, index) => {
    if (segment.kind !== "protected" || !segment.value) return;
    const value = segment.value;
    if (value.number === null) return;

    if (value.context === "bp") {
      const [systolic, diastolic] = renderRange(segment.text);
      if (systolic !== null && (systolic < BP_SYSTOLIC.min || systolic > BP_SYSTOLIC.max)) {
        flags.push(outOfRange(BP_SYSTOLIC, systolic, segment.text));
      }
      if (diastolic !== null && (diastolic < BP_DIASTOLIC.min || diastolic > BP_DIASTOLIC.max)) {
        flags.push(outOfRange(BP_DIASTOLIC, diastolic, segment.text));
      }
      return;
    }

    const context = `${value.raw} ${nearestContextWords(rich.segments, index, 4)}`;
    const rule = ruleForContext(context, value.unit);
    if (!rule) return;
    if (value.number < rule.min || value.number > rule.max) {
      flags.push(outOfRange(rule, value.number, segment.text));
    }
  });

  return { segments: rich.segments, flags };
}

function renderRange(text: string): [number | null, number | null] {
  const match = /^~?(\d+)\/(\d+)/.exec(text);
  if (!match) return [null, null];
  return [Number(match[1]), Number(match[2])];
}

function outOfRange(rule: RangeRule, value: number, rendered: string): SafetyFlag {
  return {
    kind: "out-of-range",
    severity: "danger",
    term: rendered,
    value,
    unit: rule.unit,
    detail: `${rule.label} ${value}${rule.unit ? ` ${rule.unit}` : ""} is outside ${rule.min}–${rule.max} — likely a recognition error. Check the audio.`,
  };
}
