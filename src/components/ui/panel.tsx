import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel", className)} {...props} />;
}

export function PanelHeader({
  title,
  hint,
  action,
  className,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-border/70 px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {hint ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "primary" | "accent" | "warn" | "danger" | "ok";

const TONES: Record<Tone, string> = {
  neutral: "border-border bg-secondary/70 text-muted-foreground",
  primary: "border-primary/40 bg-primary/10 text-primary",
  accent: "border-accent/40 bg-accent/10 text-accent",
  warn: "border-warn/40 bg-warn/10 text-warn",
  danger: "border-danger/40 bg-danger/10 text-danger",
  ok: "border-ok/40 bg-ok/10 text-ok",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border border-input bg-background/60 px-3 text-sm text-foreground",
        "placeholder:text-muted-foreground/70",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm text-foreground",
        "placeholder:text-muted-foreground/70",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] leading-relaxed text-muted-foreground/80">{hint}</p> : null}
    </div>
  );
}
