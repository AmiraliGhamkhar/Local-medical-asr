import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldQuestion } from "lucide-react";
import { Badge, Panel, PanelHeader } from "../ui/panel";
import type { SafetyFlag } from "../../processing/types";

const TONE = {
  danger: "danger",
  warn: "warn",
  info: "primary",
} as const;

const ICON = {
  "out-of-range": ShieldAlert,
  "ambiguous-term": AlertTriangle,
  "review-term": ShieldQuestion,
  "negation-scope": CheckCircle2,
  unparsed: AlertTriangle,
} as const;

export function FlagsPanel({ flags }: { flags: SafetyFlag[] }) {
  const ordered = [...flags].sort((a, b) => weight(b.severity) - weight(a.severity));

  return (
    <Panel>
      <PanelHeader
        title="Safety flags"
        hint="Everything the rules refused to do silently. A wrong dose or a flipped negation shows up here before it reaches the chart."
        action={<Badge tone={ordered.length === 0 ? "ok" : "warn"}>{ordered.length}</Badge>}
      />
      <div className="max-h-[420px] space-y-2 overflow-y-auto p-4">
        {ordered.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs leading-6 text-muted-foreground">
            Nothing to review. Every number, unit and negation in the current session was handled
            deterministically.
          </p>
        ) : (
          <ul className="space-y-2">
            {ordered.map((flag, index) => {
              const Icon = ICON[flag.kind] ?? AlertTriangle;
              return (
                <li
                  key={`${flag.kind}-${flag.term}-${index}`}
                  className="flex gap-3 rounded-md border border-border/70 bg-background/40 p-3"
                >
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      flag.severity === "danger"
                        ? "text-danger"
                        : flag.severity === "warn"
                          ? "text-warn"
                          : "text-primary"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span dir="rtl" className="text-xs font-medium text-foreground">
                        {flag.term}
                      </span>
                      <Badge tone={TONE[flag.severity]}>{flag.kind}</Badge>
                    </div>
                    <p className="mt-1 text-[11px] leading-6 text-muted-foreground">{flag.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function weight(severity: SafetyFlag["severity"]): number {
  return severity === "danger" ? 3 : severity === "warn" ? 2 : 1;
}
