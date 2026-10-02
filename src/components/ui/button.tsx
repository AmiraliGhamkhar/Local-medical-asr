import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_0_1px_hsl(var(--primary)/0.4),0_12px_30px_-14px_hsl(var(--primary)/0.7)]",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border",
  ghost: "bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/60",
  danger: "bg-danger text-danger-foreground hover:bg-danger/90",
  accent: "bg-accent text-accent-foreground hover:bg-accent/90",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2.5",
  icon: "h-10 w-10",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
