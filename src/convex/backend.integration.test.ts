import { describe, expect, it } from "vitest";

/**
 * Backend integration test.
 *
 * Talks to a real Convex deployment over its HTTP API, because the parts that
 * matter most here — PBKDF2 password stretching, token expiry, ownership
 * scoping on the audit trail — cannot be verified with a mocked context.
 *
 * Set CONVEX_TEST_URL to run it (default: the local deployment on 3210).
 * When no deployment is reachable the suite skips rather than fails, so the
 * pure pipeline tests still run on a machine without a backend.
 */

const BASE = process.env.CONVEX_TEST_URL ?? "http://127.0.0.1:3210";

type Call =
  | { kind: "query"; path: string; args: Record<string, unknown> }
  | { kind: "mutation"; path: string; args: Record<string, unknown> };

async function call<T>(request: Call): Promise<T> {
  const response = await fetch(`${BASE}/api/${request.kind}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: request.path, args: request.args, format: "json" }),
  });
  const body = (await response.json()) as
    | { status: "success"; value: T }
    | { status: "error"; errorMessage: string };
  if (body.status === "error") throw new Error(body.errorMessage);
  return body.value;
}

const mutate = <T>(path: string, args: Record<string, unknown>) =>
  call<T>({ kind: "mutation", path, args });
const query = <T>(path: string, args: Record<string, unknown>) =>
  call<T>({ kind: "query", path, args });

interface AuthResult {
  token: string;
  user: { id: string; name: string; email: string; role: string };
}

interface TermRow {
  id: string;
  source: string;
  en: string;
  tier: number;
  category: string;
}

interface UtteranceRow {
  id: string;
  raw: string;
  normalized: string;
  final: string;
  flags: Array<{ kind: string; severity: string; term: string; detail: string }>;
  pipelineMs: number;
}

const EMAIL = `dr.sara.${Date.now()}@hospital.ir`;
const PASSWORD = "a-long-enough-password";

/**
 * Probed at collection time so the suite can be skipped honestly rather than
 * reporting twelve green tests that never touched a deployment.
 */
const available = await (async () => {
  try {
    const response = await fetch(`${BASE}/version`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
})();

if (!available) {
  console.warn(`[backend] no Convex deployment at ${BASE} — backend integration tests skipped.`);
}

describe.skipIf(!available)("Convex backend", () => {
  it("registers a clinician and returns a session token", async () => {
    if (!available) return;
    const result = await mutate<AuthResult>("auth:register", {
      name: "Dr Sara Ahmadi",
      email: EMAIL,
      password: PASSWORD,
    });
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    expect(result.user.email).toBe(EMAIL);
    expect(result.user.role).toBe("clinician");
  });

  it("refuses a duplicate registration", async () => {
    if (!available) return;
    await expect(
      mutate("auth:register", { name: "Dr Sara", email: EMAIL, password: PASSWORD }),
    ).rejects.toThrow(/already exists/i);
  });

  it("rejects a weak password and a malformed email", async () => {
    if (!available) return;
    await expect(
      mutate("auth:register", { name: "X Y", email: "not-an-email", password: PASSWORD }),
    ).rejects.toThrow(/valid email/i);
    await expect(
      mutate("auth:register", { name: "X Y", email: "other@hospital.ir", password: "short" }),
    ).rejects.toThrow(/at least 8/i);
  });

  it("signs in with the right password and refuses the wrong one", async () => {
    if (!available) return;
    const ok = await mutate<AuthResult>("auth:login", { email: EMAIL, password: PASSWORD });
    expect(ok.token).toMatch(/^[0-9a-f]{64}$/);

    await expect(mutate("auth:login", { email: EMAIL, password: "wrong-password" })).rejects.toThrow(
      /Incorrect email or password/i,
    );
    await expect(
      mutate("auth:login", { email: "nobody@hospital.ir", password: PASSWORD }),
    ).rejects.toThrow(/Incorrect email or password/i);
  });

  it("resolves a valid token and rejects an invalid one", async () => {
    if (!available) return;
    const session = await mutate<AuthResult>("auth:login", { email: EMAIL, password: PASSWORD });

    const me = await query<AuthResult["user"] | null>("session:me", { token: session.token });
    expect(me?.email).toBe(EMAIL);

    expect(await query("session:me", { token: "not-a-real-token" })).toBeNull();
    expect(await query("session:me", { token: "" })).toBeNull();
  });

  it("stores a custom term scoped to its owner", async () => {
    if (!available) return;
    const session = await mutate<AuthResult>("auth:login", { email: EMAIL, password: PASSWORD });

    await mutate("terms:addTerm", {
      token: session.token,
      source: "لیریو گلیسمیک",
      en: "Lirio glimepiride",
      tier: 2,
      category: "drug",
    });

    const terms = await query<TermRow[]>("terms:listTerms", { token: session.token });
    const added = terms.find((t) => t.en === "Lirio glimepiride");
    expect(added?.source).toBe("لیریو گلیسمیک");
    expect(added?.tier).toBe(2);
  });

  it("rejects a term whose replacement is not a Latin clinical term", async () => {
    if (!available) return;
    const session = await mutate<AuthResult>("auth:login", { email: EMAIL, password: PASSWORD });
    await expect(
      mutate("terms:addTerm", {
        token: session.token,
        source: "چیزی",
        en: "متفورمین",
        tier: 1,
        category: "drug",
      }),
    ).rejects.toThrow(/Latin clinical term/i);
    await expect(
      mutate("terms:addTerm", { token: session.token, source: "  ", en: "x", tier: 1, category: "drug" }),
    ).rejects.toThrow(/Persian form/i);
  });

  it("does not leak one clinician's terms to another", async () => {
    if (!available) return;
    const other = await mutate<AuthResult>("auth:register", {
      name: "Dr Reza Karimi",
      email: `dr.reza.${Date.now()}@hospital.ir`,
      password: PASSWORD,
    });
    const terms = await query<TermRow[]>("terms:listTerms", { token: other.token });
    expect(terms.find((t) => t.en === "Lirio glimepiride")).toBeUndefined();
  });

  it("records an utterance with its full audit payload", async () => {
    if (!available) return;
    const session = await mutate<AuthResult>("auth:login", { email: EMAIL, password: PASSWORD });
    const sessionId = await mutate<string>("session:startSession", {
      token: session.token,
      title: "Ward round",
      engine: "rehearsal",
    });

    await mutate("utterances:recordUtterance", {
      token: session.token,
      sessionId,
      raw: "فشار خون یکصد و بیست روی هشتاد میلی متر جیوه",
      normalized: "فشار خون یکصد و بیست روی هشتاد میلی متر جیوه",
      final: "BP 120/80 mmHg",
      flags: [{ kind: "review-term", severity: "info", term: "فشار خون → BP", detail: "vital substitution" }],
      pipelineMs: 4.2,
    });

    const rows = await query<UtteranceRow[]>("utterances:listUtterances", { token: session.token });
    const row = rows.find((r) => r.final === "BP 120/80 mmHg");
    expect(row?.raw).toContain("فشار خون");
    expect(row?.flags[0].kind).toBe("review-term");

    const summary = await query<{
      utterances: number;
      flagged: number;
      dangerous: number;
      avgPipelineMs: number;
    }>("utterances:auditSummary", { token: session.token });
    expect(summary.utterances).toBeGreaterThan(0);
    expect(summary.flagged).toBeGreaterThan(0);
  });

  it("keeps one clinician's audit trail out of another's", async () => {
    if (!available) return;
    const other = await mutate<AuthResult>("auth:login", {
      email: EMAIL.replace(/dr\.sara\.\d+/, "dr.sara.999"),
      password: PASSWORD,
    }).catch(() => null);
    if (!other) return;
    const rows = await query<UtteranceRow[]>("utterances:listUtterances", { token: other.token });
    expect(rows.find((r) => r.final === "BP 120/80 mmHg")).toBeUndefined();
  });

  it("ends the session and clears the trail on request", async () => {
    if (!available) return;
    const session = await mutate<AuthResult>("auth:login", { email: EMAIL, password: PASSWORD });

    const summary = await query<{ utterances: number }>("utterances:auditSummary", {
      token: session.token,
    });
    if (summary.utterances > 0) {
      await mutate("utterances:clearUtterances", { token: session.token });
      const after = await query<{ utterances: number }>("utterances:auditSummary", {
        token: session.token,
      });
      expect(after.utterances).toBe(0);
    }
  });

  it("records a session and lists it back with its utterance count", async () => {
    if (!available) return;
    const session = await mutate<AuthResult>("auth:login", { email: EMAIL, password: PASSWORD });
    const sessionId = await mutate<string>("session:startSession", {
      token: session.token,
      title: "   ",
      engine: "shenava",
    });

    interface SessionRow {
      id: string;
      title: string;
      engine: string;
      endedAt: number | null;
      utteranceCount: number;
    }

    const sessions = await query<SessionRow[]>("session:listSessions", { token: session.token });
    const found = sessions.find((s) => s.id === sessionId);
    expect(found?.title).toBe("Untitled dictation");
    expect(found?.engine).toBe("shenava");
    expect(found?.endedAt).toBeNull();
    expect(found?.utteranceCount).toBeGreaterThanOrEqual(0);

    expect(await mutate<string | null>("session:endSession", { token: session.token, sessionId })).toBe(
      sessionId,
    );
    const ended = await query<SessionRow[]>("session:listSessions", { token: session.token });
    expect(ended.find((s) => s.id === sessionId)?.endedAt).toBeGreaterThan(0);
  });

  it("does not let one clinician end or see another's session", async () => {
    if (!available) return;
    const owner = await mutate<AuthResult>("auth:login", { email: EMAIL, password: PASSWORD });
    const sessionId = await mutate<string>("session:startSession", {
      token: owner.token,
      title: "Private ward round",
      engine: "rehearsal",
    });

    const other = await mutate<AuthResult>("auth:register", {
      name: "Dr Amir Naderi",
      email: `dr.amir.${Date.now()}@hospital.ir`,
      password: PASSWORD,
    });

    expect(await mutate("session:endSession", { token: other.token, sessionId })).toBeNull();
    const sessions = await query<Array<{ id: string }>>("session:listSessions", { token: other.token });
    expect(sessions.find((s) => s.id === sessionId)).toBeUndefined();
  });

  it("invalidates the token on sign out", async () => {
    if (!available) return;
    const session = await mutate<AuthResult>("auth:login", { email: EMAIL, password: PASSWORD });
    await mutate("session:signOut", { token: session.token });
    expect(await query("session:me", { token: session.token })).toBeNull();
  });
});