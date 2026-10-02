import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Landing from "./pages/Landing";
import AuthPage from "./pages/AuthPage";
import Studio from "./pages/Studio";
import { useAuth } from "./lib/auth";
import { Button } from "./components/ui/button";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

function FullPageMessage({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="surface-vignette flex min-h-screen items-center justify-center px-6">
      <div className="panel max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
        {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

/**
 * Authenticated routes keep their intended destination, so signing in from a
 * deep link lands the clinician in the studio rather than on the front page.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <FullPageMessage title="Checking your session" body="One moment." />;
  }
  if (status === "anonymous") {
    return <Navigate to={`/auth?returnTo=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}

function AuthenticatedHome() {
  const { status } = useAuth();
  if (status === "loading") return <FullPageMessage title="Loading" body="One moment." />;
  if (status === "authenticated") return <Navigate to="/studio" replace />;
  return <Landing />;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <Routes>
        <Route path="/" element={<AuthenticatedHome />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/studio"
          element={
            <RequireAuth>
              <Studio />
            </RequireAuth>
          }
        />
        <Route
          path="*"
          element={
            <FullPageMessage
              title="Page not found"
              body="The page you were looking for does not exist."
              action={
                <Button variant="primary" onClick={() => window.location.assign("/")}>
                  Back to start
                </Button>
              }
            />
          }
        />
      </Routes>
    </AppErrorBoundary>
  );
}
