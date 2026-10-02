import { useState } from "react";
import { BookPlus, Loader2, Trash2 } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge, Field, Input, Panel, PanelHeader } from "../ui/panel";
import { Button } from "../ui/button";
import { LEXICON } from "../../data/lexicon";

export interface CustomTermRow {
  id: Id<"customTerms">;
  source: string;
  en: string;
  tier: 1 | 2 | 3;
  category: string;
}

const CATEGORIES = ["drug", "lab", "vital", "unit", "procedure", "department", "diagnosis", "abbreviation"] as const;

const TIER_HELP: Record<1 | 2 | 3, string> = {
  1: "Always Latin in real notes. Substituted silently.",
  2: "Clinical value. Substituted and underlined for review.",
  3: "Ambiguous. Never substituted — flagged instead.",
};

export function LexiconManager({
  rows,
  onAdd,
  onRemove,
  busy,
}: {
  rows: CustomTermRow[];
  onAdd: (source: string, en: string, tier: 1 | 2 | 3, category: string) => Promise<void>;
  onRemove: (id: Id<"customTerms">) => Promise<void>;
  busy: boolean;
}) {
  const [source, setSource] = useState("");
  const [en, setEn] = useState("");
  const [tier, setTier] = useState<1 | 2 | 3>(2);
  const [category, setCategory] = useState<string>("drug");
  const [error, setError] = useState<string | null>(null);

  const builtInCount = Object.values(LEXICON).reduce((sum, group) => sum + group.length, 0);

  async function submit() {
    setError(null);
    try {
      await onAdd(source, en, tier, category);
      setSource("");
      setEn("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that term.");
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Terminology"
        hint={`${builtInCount} built-in terms across drugs, labs, vitals, procedures and diagnoses. Add the local vocabulary your ward actually uses.`}
        action={<Badge tone="primary">{rows.length} custom</Badge>}
      />

      <div className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What you hear in Persian" htmlFor="term-source">
            <Input
              id="term-source"
              dir="rtl"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="متوپرولول"
            />
          </Field>
          <Field label="What the chart should say" htmlFor="term-en">
            <Input
              id="term-en"
              dir="ltr"
              value={en}
              onChange={(e) => setEn(e.target.value)}
              placeholder="metoprolol"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Safety tier" hint={TIER_HELP[tier]}>
            <div className="flex rounded-md border border-input bg-background/60 p-1">
              {([1, 2, 3] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setTier(value)}
                  className={`flex-1 rounded-sm px-2 py-1.5 text-[11px] transition-colors ${
                    tier === value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Tier {value}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Category" htmlFor="term-category">
            <select
              id="term-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background/60 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {error ? (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        ) : null}

        <Button variant="primary" size="sm" onClick={submit} disabled={busy || !source.trim() || !en.trim()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookPlus className="h-3.5 w-3.5" />}
          Add to my lexicon
        </Button>

        <div className="space-y-2 border-t border-border/70 pt-4">
          {rows.length === 0 ? (
            <p className="py-4 text-center text-xs leading-6 text-muted-foreground">
              No custom terms yet. Start with the drug names and shorthand your colleagues actually
              dictate.
            </p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-3 rounded-md border border-border/70 bg-background/40 px-3 py-2"
              >
                <span dir="rtl" className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {row.source}
                </span>
                <span className="text-muted-foreground">→</span>
                <span dir="ltr" className="text-xs text-primary">
                  {row.en}
                </span>
                <Badge tone={row.tier === 3 ? "warn" : row.tier === 2 ? "primary" : "ok"}>T{row.tier}</Badge>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onRemove(row.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="sr-only">Remove {row.en}</span>
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </Panel>
  );
}
