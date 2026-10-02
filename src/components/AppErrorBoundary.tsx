import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./ui/button";

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled application error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="surface-vignette flex min-h-screen items-center justify-center px-6">
        <div className="panel max-w-lg p-8 text-center">
          <h1 className="text-lg font-semibold">Something broke</h1>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            The interface hit an unexpected error. Your session is untouched; reloading usually
            clears it.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-background/70 p-3 text-start text-[11px] leading-5 text-muted-foreground">
            {this.state.error.message}
          </pre>
          <div className="mt-6 flex justify-center">
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
