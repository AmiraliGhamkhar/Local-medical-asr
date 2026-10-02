import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "./convex";
import { api } from "../convex/_generated/api";
import { useBackendStatus } from "./backend";

const STORAGE_KEY = "shenava.session";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "clinician" | "admin";
}

interface StoredSession {
  token: string;
  user: SessionUser;
}

interface AuthContextValue {
  token: string | null;
  user: SessionUser | null;
  status: "loading" | "authenticated" | "anonymous";
  /** False when the Convex backend cannot be reached. */
  online: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(readStoredSession);
  const [verified, setVerified] = useState(false);
  const { online, checked } = useBackendStatus();

  const login = useMutation(api.auth.login);
  const register = useMutation(api.auth.register);
  const signOutMutation = useMutation(api.session.signOut);
  const me = useQuery(api.session.me, session && online ? { token: session.token } : "skip");

  // The stored token is only trusted once the backend has confirmed it. When
  // the backend is unreachable we keep the local session rather than logging the
  // clinician out mid-consultation; the studio tells them what is paused.
  useEffect(() => {
    if (!session) {
      setVerified(true);
      return;
    }
    if (!online) {
      if (checked) setVerified(true);
      return;
    }
    if (me === undefined) return;
    if (me === null) {
      localStorage.removeItem(STORAGE_KEY);
      setSession(null);
    }
    setVerified(true);
  }, [me, session, online, checked]);

  const persist = useCallback((next: StoredSession) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!online) {
        throw new Error("The backend is unreachable, so accounts cannot be verified right now.");
      }
      const result = await login({ email, password });
      persist({ token: result.token, user: result.user });
    },
    [login, online, persist],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      if (!online) {
        throw new Error("The backend is unreachable, so accounts cannot be created right now.");
      }
      const result = await register({ name, email, password });
      persist({ token: result.token, user: result.user });
    },
    [register, online, persist],
  );

  const signOut = useCallback(async () => {
    if (session && online) {
      await signOutMutation({ token: session.token }).catch(() => undefined);
    }
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, [session, online, signOutMutation]);

  const value = useMemo<AuthContextValue>(() => {
    const status: AuthContextValue["status"] = !verified
      ? "loading"
      : session
        ? "authenticated"
        : "anonymous";
    return {
      token: session?.token ?? null,
      user: session?.user ?? null,
      status,
      online,
      signIn,
      signUp,
      signOut,
    };
  }, [verified, session, online, signIn, signUp, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider.");
  return ctx;
}
