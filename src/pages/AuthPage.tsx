import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, Loader2, ShieldCheck, Waves } from "lucide-react";
import { Button } from "../components/ui/button";
import { Field, Input, Panel } from "../components/ui/panel";
import { useAuth } from "../lib/auth";

const DEFAULT_RETURN = "/studio";

export default function AuthPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signIn, signUp, status, online } = useAuth();

  const returnTo = params.get("returnTo") ?? DEFAULT_RETURN;
  const [mode, setMode] = useState<"signin" | "signup">(
    params.get("mode") === "signin" ? "signin" : "signup",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "authenticated") navigate(returnTo, { replace: true });
  }, [status, navigate, returnTo]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") await signUp(name, email, password);
      else await signIn(email, password);
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="surface-vignette relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div className="surface-grid pointer-events-none absolute inset-0 opacity-30" />

      <div className="relative grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
        <motion.div
          initial={{ opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="hidden lg:block"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md border border-primary/40 bg-primary/10">
              <Waves className="h-5 w-5 text-primary" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">شنوا</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Shenava Clinical
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-semibold leading-snug tracking-tight">
            Your dictation, your machine,
            <br />
            <span className="text-primary">your chart.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
            Accounts exist so your lexicon, your audit trail and your session history stay yours.
            Audio is never uploaded and never stored.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
            {[
              "Persian audio is decoded on your own device",
              "Every rule rewrite is recorded in an audit trail",
              "Your personal terminology overrides apply everywhere",
            ].map((line) => (
              <li key={line} className="flex items-center gap-3">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                {line}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08 }}
        >
          <Panel className="p-7">
            <Link
              to="/"
              className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
              Back
            </Link>

            <div className="mb-6 flex rounded-md border border-border bg-background/50 p-1">
              {(["signup", "signin"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => {
                    setMode(value);
                    setError(null);
                  }}
                  className={`flex-1 rounded-sm px-3 py-2 text-xs font-medium transition-colors ${
                    mode === value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {value === "signup" ? "Create account" : "Sign in"}
                </button>
              ))}
            </div>

            {!online ? (
              <p className="mb-5 flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[11px] leading-6 text-warn">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                The backend is unreachable, so accounts cannot be created or verified right now. The
                terminology engine itself runs entirely in your browser and needs no backend.
              </p>
            ) : null}

            <h2 className="text-lg font-semibold tracking-tight">
              {mode === "signup" ? "Create your clinician account" : "Welcome back"}
            </h2>
            <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
              {mode === "signup"
                ? "Passwords are stretched with PBKDF2-SHA256 before they are stored."
                : "Sign in to reach your studio and audit history."}
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {mode === "signup" ? (
                <Field label="Full name" htmlFor="name">
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="دکتر نام خانوادگی"
                    required
                    autoComplete="name"
                  />
                </Field>
              ) : null}

              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@hospital.ir"
                  required
                  autoComplete="email"
                />
              </Field>

              <Field
                label="Password"
                htmlFor="password"
                hint={mode === "signup" ? "At least 8 characters." : undefined}
              >
                <Input
                  id="password"
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </Field>

              {error ? (
                <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {error}
                </p>
              ) : null}

              <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {mode === "signup" ? "Create account" : "Sign in"}
              </Button>
            </form>

            <p className="mt-6 text-center text-[11px] leading-6 text-muted-foreground">
              This tool assists documentation. It does not diagnose, and the clinician remains
              responsible for everything that reaches the chart.
            </p>
          </Panel>
        </motion.div>
      </div>
    </div>
  );
}
