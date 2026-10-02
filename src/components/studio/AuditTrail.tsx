import { useMemo, useState } from "react";
import { Eye, History, Trash2 } from "lucide-react";
import { Badge, Panel, PanelHeader } from "../ui/panel";
import { Button } from "../ui/button";
import { RawView, TranscriptView } from "./TranscriptView";

export interface AuditRow {
  id: string;
  createdAt: number;
  raw: string;
  normalized: string;
  final: string;
  flags: Array<{ kind: string; severity: string; term: string; detail: string }>;
  pipelineMs: number;
}

export function AuditTrail({
  rows,
  onClear,
  clearing,
}: {
  rows: AuditRow[];
  onClear: () => void;
  clearing: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const dangerCount = useMemo(
    () => rows.filter((row) => row.flags.some((f) => f.severity === "danger")).length,
    [rows],
  );

  return (
    <Panel>
      <PanelHeader
        title="Audit trail"
        hint="Raw acoustic output next to the text you accepted. If a rule changed something, you can always see what it changed it from."
        action={
          <div className="flex items-center gap-2">
            <Badge tone={dangerCount > 0 ? "danger" : "neutral"}>{rows.length} entries</Badge>
            <Button size="sm" variant="ghost" onClick={onClear} disabled={rows.length === 0 || clearing}>
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        }
      />

      <div className="max-h-[520px] space-y-2 overflow-y-auto p-4">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-1 py-10 text-center">
            <History className="h-5 w-5 text-muted-foreground" />
            <p className="text-xs leading-6 text-muted-foreground">
              Committed utterances appear here with their raw acoustic output.
            </p>
          </div>
        ) : (
          rows.map((row) => {
            const open = expanded === row.id;
            const flagged = row.flags.filter((f) => f.severity === "danger" || f.severity === "warn");
            return (
              <div key={row.id} className="overflow-hidden rounded-md border border-border/70 bg-background/40">
                <button
                  onClick={() => setExpanded(open ? null : row.id)}
                  className="flex w-full items-start gap-3 p-3 text-start transition-colors hover:bg-secondary/40"
                >
                  <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p dir="rtl" className="bidi-surface truncate text-xs leading-6 text-foreground">
                      {row.final}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="tabnum">{new Date(row.createdAt).toLocaleTimeString()}</span>
                      <span className="tabnum">· {row.pipelineMs} ms</span>
                      {flagged.length > 0 ? (
                        <Badge tone={flagged.some((f) => f.severity === "danger") ? "danger" : "warn"}>
                          {flagged.length} flagged
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </button>

                {open ? (
                  <div className="space-y-3 border-t border-border/70 p-3">
                    <div>
                      <p className="mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                        Acoustic output
                      </p>
                      <RawView text={row.raw} />
                    </div>
                    <div>
                      <p className="mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                        Normalised
                      </p>
                      <RawView text={row.normalized} />
                    </div>
                    <div>
                      <p className="mb-1.5 text-[10px] uppercase tracking-widest text-primary">
                        Accepted
                      </p>
                      <TranscriptView animate={false} pieces={[{ text: row.final, kind: "persian" }]} />
                    </div>
                    {row.flags.length > 0 ? (
                      <ul className="space-y-1.5">
                        {row.flags.map((flag, index) => (
                          <li
                            key={index}
                            className="rounded-sm bg-secondary/50 px-2 py-1.5 text-[11px] leading-6 text-muted-foreground"
                          >
                            <span className="text-foreground">{flag.term}</span> — {flag.detail}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </Panel>
  );
}
