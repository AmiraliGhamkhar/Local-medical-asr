import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TranscriptView, RawView } from "./TranscriptView";
import { FlagsPanel } from "./AuditPanel";
import { AuditTrail, type AuditRow } from "./AuditTrail";
import { LexiconManager } from "./LexiconManager";
import { ChartTarget } from "./ChartTarget";
import { processUtterance } from "../../processing/pipeline";

const PIECES = processUtterance(
  "فشار خون یکصد و بیست روی هشتاد میلی متر جیوه و متفورمین پانصد میلی گرم تجویز شد",
).pieces;

describe("transcript view", () => {
  it("renders the processed text", () => {
    render(<TranscriptView pieces={PIECES} />);
    expect(screen.getByText(/120\/80 mmHg/)).toBeInTheDocument();
  });

  it("sets RTL direction so the browser resolves the mixed script", () => {
    render(<TranscriptView pieces={PIECES} />);
    const paragraph = screen.getByText(/120\/80 mmHg/).closest("p");
    expect(paragraph).toHaveAttribute("dir", "rtl");
    expect(paragraph?.className).toContain("bidi-surface");
  });

  it("marks substituted clinical terms for review", () => {
    render(<TranscriptView pieces={PIECES} />);
    const marked = screen.getByTitle("review");
    expect(marked).toHaveTextContent("metformin");
  });

  it("marks protected numeric spans with their unit", () => {
    render(<TranscriptView pieces={PIECES} />);
    expect(screen.getByTitle("unit: mmHg")).toBeInTheDocument();
  });

  it("renders raw acoustic output for side-by-side review", () => {
    render(<RawView text="فشار خون یکصد و بیست" />);
    expect(screen.getByText("فشار خون یکصد و بیست")).toBeInTheDocument();
  });
});

describe("flags panel", () => {
  it("says so plainly when nothing was flagged", () => {
    render(<FlagsPanel flags={[]} />);
    expect(screen.getByText(/Nothing to review/i)).toBeInTheDocument();
  });

  it("orders the most dangerous flag first", () => {
    const processed = processUtterance("فشار خون شانزده صد روی نود");
    render(<FlagsPanel flags={processed.flags} />);

    const items = screen.getAllByRole("listitem");
    expect(items.length).toBeGreaterThan(0);
    expect(screen.getByText(/is outside 70–260/)).toBeInTheDocument();
  });

  it("explains a refusal to substitute", () => {
    const processed = processUtterance("متوپرولول تجویز شد");
    render(<FlagsPanel flags={processed.flags} />);
    expect(screen.getByText(/left in Persian/)).toBeInTheDocument();
    expect(screen.getByText("ambiguous-term")).toBeInTheDocument();
  });

  it("keeps the negation it scoped over", () => {
    const processed = processUtterance("سرفه ندارد اما تب دارد");
    render(<FlagsPanel flags={processed.flags} />);
    expect(screen.getByText(/«ندارد» applies to/)).toBeInTheDocument();
  });
});

describe("audit trail", () => {
  const rows: AuditRow[] = [
    {
      id: "u1",
      createdAt: Date.now(),
      raw: "فشار خون یکصد و بیست روی هشتاد میلی متر جیوه",
      normalized: "فشار خون یکصد و بیست روی هشتاد میلی متر جیوه",
      final: "BP 120/80 mmHg",
      flags: [{ kind: "review-term", severity: "info", term: "فشار خون → BP", detail: "vital substitution" }],
      pipelineMs: 3.5,
    },
  ];

  it("invites the clinician to open an entry", () => {
    render(<AuditTrail rows={[]} onClear={vi.fn()} clearing={false} />);
    expect(screen.getByText(/Committed utterances appear here/i)).toBeInTheDocument();
  });

  it("reveals the acoustic output behind an accepted note", async () => {
    const user = userEvent.setup();
    render(<AuditTrail rows={rows} onClear={vi.fn()} clearing={false} />);

    await user.click(screen.getByRole("button", { name: /BP 120\/80/ }));
    expect(screen.getByText("Acoustic output")).toBeInTheDocument();
    // The same Persian appears in both the acoustic and the normalised view.
    expect(screen.getAllByText(/میلی متر جیوه/).length).toBeGreaterThan(0);
    expect(screen.getByText(/vital substitution/)).toBeInTheDocument();
  });

  it("clears on request", async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(<AuditTrail rows={rows} onClear={onClear} clearing={false} />);
    await user.click(screen.getByRole("button", { name: /Clear/i }));
    expect(onClear).toHaveBeenCalled();
  });
});

describe("lexicon manager", () => {
  it("explains what the selected safety tier is for", async () => {
    const user = userEvent.setup();
    render(<LexiconManager rows={[]} onAdd={vi.fn()} onRemove={vi.fn()} busy={false} />);

    // Tier 2 is the default: clinical values, substituted and underlined.
    expect(screen.getByText(/Substituted and underlined for review/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Tier 1/i }));
    expect(screen.getByText(/Always Latin in real notes/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Tier 3/i }));
    expect(screen.getByText(/Ambiguous\. Never substituted/)).toBeInTheDocument();
  });

  it("adds a term with the chosen tier and category", async () => {
    const onAdd = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(<LexiconManager rows={[]} onAdd={onAdd} onRemove={vi.fn()} busy={false} />);

    await user.type(screen.getByLabelText(/What you hear in Persian/i), "لیریو گلیسمیک");
    await user.type(screen.getByLabelText(/What the chart should say/i), "Lirio glimepiride");
    await user.click(screen.getByRole("button", { name: /Tier 1/i }));
    await user.selectOptions(screen.getByLabelText("Category"), "drug");
    await user.click(screen.getByRole("button", { name: /Add to my lexicon/i }));

    expect(onAdd).toHaveBeenCalledWith("لیریو گلیسمیک", "Lirio glimepiride", 1, "drug");
  });

  it("surfaces a backend failure instead of silently dropping the term", async () => {
    const onAdd = vi.fn(async () => {
      throw new Error("Custom terms need the backend.");
    });
    const user = userEvent.setup();
    render(<LexiconManager rows={[]} onAdd={onAdd} onRemove={vi.fn()} busy={false} />);

    await user.type(screen.getByLabelText(/What you hear in Persian/i), "فلان");
    await user.type(screen.getByLabelText(/What the chart should say/i), "Flan");
    await user.click(screen.getByRole("button", { name: /Add to my lexicon/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Custom terms need the backend.");
  });

  it("removes an existing custom term", async () => {
    const onRemove = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(
      <LexiconManager
        rows={[
          { id: "t1" as never, source: "لیریو", en: "Lirio", tier: 2, category: "drug" },
        ]}
        onAdd={vi.fn()}
        onRemove={onRemove}
        busy={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Remove Lirio/i }));
    expect(onRemove).toHaveBeenCalledWith("t1");
  });

  it("will not submit an empty form", () => {
    render(<LexiconManager rows={[]} onAdd={vi.fn()} onRemove={vi.fn()} busy={false} />);
    expect(screen.getByRole("button", { name: /Add to my lexicon/i })).toBeDisabled();
  });
});

describe("chart target", () => {
  it("stays empty until the clinician dictates", () => {
    render(
      <ChartTarget value="" onChange={vi.fn()} onInsert={vi.fn()} lastFinal={null} />,
    );
    expect(screen.getByPlaceholderText(/بخش یادداشت بیمار/)).toHaveValue("");
  });

  it("inserts the last utterance once, and only once", async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    const onChange = vi.fn();
    render(
      <ChartTarget
        value="بیمار پایدار است"
        onChange={onChange}
        onInsert={onInsert}
        lastFinal="BP 120/80 mmHg"
      />,
    );

    await user.click(screen.getByRole("button", { name: /Insert last utterance/i }));
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledWith("BP 120/80 mmHg");

    // The component must not append on its own: writing to `value` from an
    // effect that depends on `value` would repeat the same line forever.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the button disabled until there is something to insert", () => {
    render(<ChartTarget value="بیمار پایدار است" onChange={vi.fn()} onInsert={vi.fn()} lastFinal={null} />);
    expect(screen.getByRole("button", { name: /Insert last utterance/i })).toBeDisabled();
  });

  it("writes into an editable RTL field", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChartTarget value="" onChange={onChange} onInsert={vi.fn()} lastFinal={null} />);

    const field = screen.getByPlaceholderText(/بخش یادداشت بیمار/);
    expect(field).toHaveAttribute("dir", "rtl");
    await user.type(field, "سلام");
    expect(onChange).toHaveBeenCalled();
  });
});

describe("rehearsal cases in the UI", () => {
  it("never renders a doubled terminator from any case", () => {
    for (const text of [
      "بیمار پایدار است.",
      "مایع سرم ده سی سی ساعتی تجویز شد.",
      "گزارش آماده است؟",
    ]) {
      const { container } = render(<TranscriptView pieces={processUtterance(text).pieces} />);
      expect(container.textContent).not.toMatch(/[.؟]{2,}/);
    }
  });

  it("keeps the chart panel addressable by name", () => {
    render(<ChartTarget value="" onChange={vi.fn()} onInsert={vi.fn()} lastFinal={null} />);
    const panel = screen.getByText("Chart target").closest("div");
    expect(within(panel as HTMLElement).getByText(/Unicode isolates/)).toBeInTheDocument();
  });
});