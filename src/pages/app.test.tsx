import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

/**
 * The Convex client is replaced with an in-memory double: these tests are
 * about routing, auth gating and panel wiring, not about the backend, which is
 * covered against a real deployment by src/convex/backend.integration.test.ts.
 */
/**
 * Convex api references are opaque lazy proxies that hand back a fresh object
 * on every access, so they cannot be used as map keys. The generated api is
 * replaced with plain path strings, which makes the double trivially keyable.
 */
vi.mock("../convex/_generated/api", () => ({
  api: {
    auth: { login: "auth:login", register: "auth:register" },
    session: {
      me: "session:me",
      startSession: "session:startSession",
      endSession: "session:endSession",
      signOut: "session:signOut",
    },
    utterances: {
      recordUtterance: "utterances:recordUtterance",
      listUtterances: "utterances:listUtterances",
      auditSummary: "utterances:auditSummary",
      clearUtterances: "utterances:clearUtterances",
    },
    terms: {
      listTerms: "terms:listTerms",
      addTerm: "terms:addTerm",
      removeTerm: "terms:removeTerm",
    },
  },
  internal: {},
  components: {},
}));

const queryResponses = new Map<string, unknown>();
const mutations = new Map<string, ReturnType<typeof vi.fn>>();
const backend = { online: true };

/** Matches the paths the mocked generated api hands to the double. */
const API = {
  me: "session:me",
  listUtterances: "utterances:listUtterances",
  auditSummary: "utterances:auditSummary",
  recordUtterance: "utterances:recordUtterance",
  listTerms: "terms:listTerms",
  addTerm: "terms:addTerm",
  removeTerm: "terms:removeTerm",
  startSession: "session:startSession",
} as const;

vi.mock("../lib/backend", () => ({
  useBackendStatus: () => ({ online: backend.online, checked: true, retry: vi.fn() }),
}));

/**
 * Convex api references are opaque lazy proxies, so the double keys off object
 * identity rather than a path string: the same reference is handed back on
 * every call, which is all these tests need.
 */
vi.mock("../lib/convex", () => ({
  ConvexClientProvider: ({ children }: { children: React.ReactNode }) => children,
  convex: {},
  useQuery: (reference: string, args: unknown) =>
    args === "skip" ? undefined : (queryResponses.get(reference) ?? null),
  useMutation: (reference: string) => {
    const existing = mutations.get(reference);
    if (existing) return existing;
    const mock = vi.fn(async () => undefined);
    mutations.set(reference, mock);
    return mock;
  },
}));

vi.mock("../lib/backend", () => ({
  useBackendStatus: () => ({ online: backend.online, checked: true, retry: vi.fn() }),
}));

const { AuthProvider } = await import("../lib/auth");
const App = (await import("../App")).default;
const { appendTo } = await import("./Studio");

const SESSION = {
  token: "a".repeat(64),
  user: { id: "u1", name: "دکتر سارا احمدی", email: "sara@hospital.ir", role: "clinician" as const },
};

/**
 * The router is a MemoryRouter, so `window.location` never moves and cannot be
 * used to assert a redirect. A probe inside the tree records the live location
 * instead, which is the only way to see where a redirect actually landed.
 */
let currentPath = "/";
let currentSearch = "";

function LocationProbe() {
  const location = useLocation();
  currentPath = location.pathname;
  currentSearch = location.search;
  return null;
}

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocationProbe />
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  queryResponses.clear();
  mutations.clear();
  backend.online = true;
});

describe("authentication", () => {
  it("sends an anonymous visitor from a protected route to sign in", async () => {
    renderApp("/studio");
    await waitFor(() => expect(screen.getByText("Create your clinician account")).toBeInTheDocument());

    // The intended destination survives the redirect rather than being lost,
    // so signing in lands the clinician back in the studio.
    expect(currentPath).toBe("/auth");
    expect(new URLSearchParams(currentSearch).get("returnTo")).toBe("/studio");
  });

  it("offers sign-in when asked for it explicitly", async () => {
    renderApp("/auth?mode=signin");
    await waitFor(() => expect(screen.getByText("Welcome back")).toBeInTheDocument());
  });

  it("refuses to create an account without the backend", async () => {
    backend.online = false;
    renderApp("/auth");
    await waitFor(() =>
      expect(screen.getByText(/accounts cannot be created or verified/i)).toBeInTheDocument(),
    );
  });

  it("sends a signed-in clinician straight to the studio", async () => {
    localStorage.setItem("shenava.session", JSON.stringify(SESSION));
    queryResponses.set(API.me, SESSION.user);

    renderApp("/");
    await waitFor(() => expect(screen.getByText("Chart target")).toBeInTheDocument());
  });
});

describe("studio", () => {
  beforeEach(() => {
    localStorage.setItem("shenava.session", JSON.stringify(SESSION));
    queryResponses.set(API.me, SESSION.user);
    queryResponses.set(API.listUtterances, []);
    queryResponses.set(API.auditSummary, {
      utterances: 0,
      flagged: 0,
      dangerous: 0,
      avgPipelineMs: 0,
    });
    queryResponses.set(API.listTerms, []);
  });

  it("shows the dictation workspace with every panel addressable", async () => {
    renderApp("/studio");
    await waitFor(() => expect(screen.getByText("Chart target")).toBeInTheDocument());

    expect(screen.getByText("Live dictation")).toBeInTheDocument();
    expect(screen.getByText("Safety flags")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run rehearsal/i })).toBeInTheDocument();
    expect(screen.getByText(/F6/)).toBeInTheDocument();
  });

  it("defaults to the rehearsal engine and says what it is", async () => {
    renderApp("/studio");
    await waitFor(() => expect(screen.getByText("Rehearsal source")).toBeInTheDocument());
    expect(screen.getByText(/Scripted Persian, not recognition|Replaying scripted Persian/)).toBeInTheDocument();
  });

  it("switches between the four workspaces", async () => {
    const user = userEvent.setup();
    renderApp("/studio");
    await waitFor(() => expect(screen.getByText("Chart target")).toBeInTheDocument());

    // Tabs cross-fade, so the new panel arrives after the exit animation.
    await user.click(screen.getByRole("button", { name: "Terminology" }));
    await waitFor(() => expect(screen.getByText(/terms across drugs, labs, vitals/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Audit trail" }));
    await waitFor(() => expect(screen.getByText(/Raw acoustic output next to the text you accepted/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Engine & limits" }));
    await waitFor(() => expect(screen.getByText(/What this engine will not do/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Download hotwords_medical.txt/ })).toBeInTheDocument();
  });

  it("states the limitations instead of hiding them", async () => {
    const user = userEvent.setup();
    renderApp("/studio");
    await waitFor(() => expect(screen.getByText("Chart target")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Engine & limits" }));
    await waitFor(() => expect(screen.getByText(/Persian-only\. Speak/)).toBeInTheDocument());
  });

  it("starts a rehearsal session and commits processed utterances", async () => {
    const user = userEvent.setup();
    renderApp("/studio");
    await waitFor(() => expect(screen.getByRole("button", { name: /Run rehearsal/i })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Run rehearsal/i }));

    // The note is rendered span by span, so it is asserted as one text node.
    const note = await screen.findByTestId("committed-note", undefined, { timeout: 15_000 });
    await waitFor(() => expect(note).toHaveTextContent(/metformin 500 mg/));
    expect(note).toHaveTextContent(/BP 150\/90 mmHg/);
    expect(note).toHaveTextContent(/CT scan/);

    // The committed utterance is rendered with its audit counts.
    expect(screen.getByText(/Latin terms/)).toBeInTheDocument();
  }, 30_000);

  it("inserts a committed utterance into the chart target", async () => {
    const user = userEvent.setup();
    renderApp("/studio");
    await waitFor(() => expect(screen.getByRole("button", { name: /Run rehearsal/i })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Run rehearsal/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Insert last utterance/i })).toBeEnabled(), {
      timeout: 15_000,
    });

    await user.click(screen.getByRole("button", { name: /Insert last utterance/i }));
    const chart = screen.getByPlaceholderText(/بخش یادداشت بیمار/);
    expect((chart as HTMLTextAreaElement).value).toMatch(/metformin 500 mg/);

    // One click inserts one utterance: the chart must not keep growing on its
    // own, which is what a self-triggering append effect would do.
    const afterInsert = (chart as HTMLTextAreaElement).value;
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect((chart as HTMLTextAreaElement).value).toBe(afterInsert);
  }, 30_000);

  it("clears the session on F8", async () => {
    const user = userEvent.setup();
    renderApp("/studio");
    await waitFor(() => expect(screen.getByRole("button", { name: /Run rehearsal/i })).toBeInTheDocument());

    await user.keyboard("{F8}");
    expect(screen.getByText(/Nothing committed yet/)).toBeInTheDocument();
  });
});

describe("landing page", () => {
  it("explains the pipeline and refuses to hide the limitations", async () => {
    renderApp("/");
    await waitFor(() => expect(screen.getByText("شنوا")).toBeInTheDocument());

    expect(screen.getByText(/Seven stages, in an order that is a safety property/)).toBeInTheDocument();
    expect(screen.getByText(/Said up front, not in the small print/)).toBeInTheDocument();
    expect(screen.getByText(/generative rewrites/)).toBeInTheDocument();
  });

  it("previews the engine live on the front page", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await waitFor(() => expect(screen.getByText("Acoustic output")).toBeInTheDocument());

    expect(screen.getByText("What lands in the chart")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Prescription" }));
    expect(screen.getByText(/metformin 500 mg/)).toBeInTheDocument();
  });

  it("routes into the auth flow", async () => {
    renderApp("/");
    await waitFor(() => expect(screen.getByText("شنوا")).toBeInTheDocument());
    expect(screen.getAllByRole("link", { name: /Open the studio|Create an account/ }).length).toBeGreaterThan(0);
  });
});

describe("routing", () => {
  it("shows a recoverable page for an unknown route", async () => {
    renderApp("/nowhere");
    await waitFor(() => expect(screen.getByText("Page not found")).toBeInTheDocument());
  });
});

describe("chart assembly", () => {
  it("separates utterances exactly once", () => {
    expect(appendTo("", "BP 120/80 mmHg")).toBe("BP 120/80 mmHg");
    expect(appendTo("بیمار پایدار است", "BP 120/80 mmHg")).toBe("بیمار پایدار است BP 120/80 mmHg");
  });

  it("does not double a separator or orphan punctuation", () => {
    expect(appendTo("بیمار پایدار است ", "BP 120/80")).toBe("بیمار پایدار است BP 120/80");
    expect(appendTo("بیمار پایدار است", ". می باشد")).toBe("بیمار پایدار است. می باشد");
    expect(appendTo("بیمار پایدار است.", "می باشد")).toBe("بیمار پایدار است. می باشد");
  });
});