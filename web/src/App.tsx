import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "./api.ts";
import type {
  Critique,
  Finding,
  HealthResult,
  SessionEvent,
  SessionMeta,
  SessionSnapshot,
} from "./api.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

const AGENT_ICONS: Record<string, string> = {
  orchestrator: "🧠",
  search: "🔍",
  critic: "⚖️",
  synthesizer: "✍️",
  system: "⚙️",
};



// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: SessionMeta["status"] }) {
  return (
    <span className="status-dot">
      <span className={`dot ${status}`} />
      <span style={{ color: "var(--text-3)", fontSize: 11, textTransform: "capitalize" }}>
        {status}
      </span>
    </span>
  );
}

function TypewriterText({ text, speed = 15 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    let i = 0;
    setDisplayed("");
    const timer = setInterval(() => {
      setDisplayed(text.substring(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);
  return <>{displayed}</>;
}

function EventItem({ event }: { event: SessionEvent }) {
  const icon = AGENT_ICONS[event.agent] ?? "📌";
  return (
    <div className="event-item">
      <div className={`event-icon ${event.agent}`}>{icon}</div>
      <div className="event-body">
        <div className="event-meta">
          <span className="event-agent">{event.agent}</span>
          <span className={`event-type-tag ${event.type}`}>{event.type}</span>
          <span className="event-time">{fmt(event.ts)}</span>
        </div>
        <div className="event-message">
          <TypewriterText text={event.message} speed={5} />
        </div>
      </div>
    </div>
  );
}

function SourceCard({ finding }: { finding: Finding }) {
  const { source } = finding;
  return (
    <div className="source-card">
      <div className="source-kind">
        <span className={`kind-badge ${source.kind}`}>{source.kind}</span>
        {source.year && <span className="source-year">{source.year}</span>}
      </div>
      <div className="source-title">{source.title}</div>
      {source.snippet && (
        <div className="source-snippet">{source.snippet}</div>
      )}
      {source.authors && source.authors.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 7 }}>
          {source.authors.slice(0, 3).join(", ")}
          {source.authors.length > 3 ? " …" : ""}
        </div>
      )}
      <a
        className="source-link"
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open source <span className="link-arrow">↗</span>
      </a>
    </div>
  );
}

function CritiquePanel({ critique }: { critique: Critique }) {
  return (
    <div className="critique-card">
      <div className="critique-section-title">⚖️ Weaknesses</div>
      <ul className="critique-list">
        {critique.weaknesses.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
      {critique.nextQueries.length > 0 && (
        <>
          <div
            className="critique-section-title"
            style={{ marginTop: 10 }}
          >
            🔎 Next Queries
          </div>
          <ul className="critique-list">
            {critique.nextQueries.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  // ── Global state ──────────────────────────────────────────────────────────
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeSessId, setActiveSessId] = useState<string | null>(null);
  const [snap, setSnap] = useState<SessionSnapshot | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [goal, setGoal] = useState("");
  const [model, setModel] = useState("ollama:qwen2.5:7b");
  const [panelTab, setPanelTab] = useState<"sources" | "critique" | "report">(
    "sources",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Health check ──────────────────────────────────────────────────────────
  const refreshHealth = useCallback(async () => {
    try {
      const h = await api.health();
      setHealth(h);
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  // ── Load session list ─────────────────────────────────────────────────────
  const refreshSessions = useCallback(async () => {
    try {
      const list = await api.listSessions();
      setSessions(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    refreshSessions();
    const iv = setInterval(refreshSessions, 6000);
    return () => clearInterval(iv);
  }, [refreshSessions]);

  // ── Poll active session snapshot ──────────────────────────────────────────
  const refreshSnap = useCallback(async (id: string) => {
    try {
      const s = await api.getSession(id);
      setSnap(s);
      setSessions((prev) =>
        prev.map((m) => (m.id === id ? s.meta : m)),
      );
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    if (!activeSessId) return;
    refreshSnap(activeSessId);
    pollRef.current = setInterval(() => refreshSnap(activeSessId), 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeSessId, refreshSnap]);

  // ── SSE subscription ──────────────────────────────────────────────────────
  const subscribeToSession = useCallback(
    (id: string) => {
      if (unsubRef.current) unsubRef.current();
      setEvents([]);

      unsubRef.current = api.subscribeEvents(
        id,
        (ev) => {
          setEvents((prev) => [...prev, ev]);
          // Refresh snapshot on key events
          if (
            ev.type === "finding" ||
            ev.type === "synthesize" ||
            ev.type === "status"
          ) {
            refreshSnap(id);
          }
        },
        () => {
          /* SSE error — polling will cover us */
        },
      );
    },
    [refreshSnap],
  );

  // ── Select session ─────────────────────────────────────────────────────────
  const selectSession = useCallback(
    (id: string) => {
      if (id === activeSessId) return;
      setActiveSessId(id);
      setEvents([]);
      setError(null);
      subscribeToSession(id);
    },
    [activeSessId, subscribeToSession],
  );

  // ── Auto-scroll log ───────────────────────────────────────────────────────
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  // ── New session ───────────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    const g = goal.trim();
    if (!g) return;
    setLoading(true);
    setError(null);
    try {
      const meta = await api.createSession(g, model);
      setGoal("");
      await refreshSessions();
      selectSession(meta.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setLoading(false);
    }
  }, [goal, model, refreshSessions, selectSession]);

  // ── Start / Resume ────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!activeSessId) return;
    setError(null);
    try {
      await api.startSession(activeSessId);
      subscribeToSession(activeSessId);
      await refreshSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start");
    }
  }, [activeSessId, subscribeToSession, refreshSessions]);

  // ── Pause ─────────────────────────────────────────────────────────────────
  const handlePause = useCallback(async () => {
    if (!activeSessId) return;
    try {
      await api.pauseSession(activeSessId);
    } catch {
      /* silent */
    }
  }, [activeSessId]);

  // ── Download report (.md & .txt) ──────────────────────────────────────────
  const [copied, setCopied] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!activeSessId || !snap?.reportMarkdown) return;
    const blob = new Blob([snap.reportMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = (snap.meta.goal ?? "report")
      .slice(0, 40)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    a.download = `anveshan-${slug}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeSessId, snap]);

  const handleDownloadTxt = useCallback(async () => {
    if (!activeSessId || !snap?.reportMarkdown) return;
    const blob = new Blob([snap.reportMarkdown], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = (snap.meta.goal ?? "report")
      .slice(0, 40)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    a.download = `anveshan-${slug}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeSessId, snap]);

  const handleCopy = useCallback(async () => {
    if (!snap?.reportMarkdown) return;
    await navigator.clipboard.writeText(snap.reportMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [snap]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const activeMeta = snap?.meta ?? sessions.find((s) => s.id === activeSessId);
  const isRunning = activeMeta?.status === "running";

  const canStart =
    activeMeta &&
    ["queued", "paused", "completed", "failed"].includes(activeMeta.status);
  const findings: Finding[] = snap?.findings ?? [];
  const critiques: Critique[] = snap?.critiques ?? [];

  const hasReport = Boolean(snap?.reportMarkdown);
  const progress = activeMeta
    ? Math.min(
        1,
        activeMeta.roundsCompleted / Math.max(1, activeMeta.roundsCompleted + 1),
      )
    : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-brand">
          <span className="wordmark">Anveshan</span>
          <span className="subtitle">Deep Research OS</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {error && (
            <span
              style={{
                fontSize: 12,
                color: "var(--red)",
                maxWidth: 280,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              ⚠ {error}
            </span>
          )}
          <div className="health-pill" data-tooltip={health?.llm?.detail ?? "Checking…"}>
            <span className={`dot ${health?.llm?.ok ? "llm-ok" : "llm-bad"}`} />
            {health
              ? health.llm.ok
                ? `LLM: ${health.llm.model}`
                : "LLM offline — fallback mode"
              : "Connecting…"}
          </div>
        </div>
      </header>

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">Sessions</span>
          <button
            className="btn-new"
            onClick={() => {
              setActiveSessId(null);
              setSnap(null);
              setEvents([]);
              setPanelTab("sources");
              if (unsubRef.current) unsubRef.current();
            }}
          >
            + New
          </button>
        </div>
        <div className="session-list">
          {sessions.length === 0 && (
            <div className="no-sessions">
              No sessions yet.
              <br />
              Start a new research goal →
            </div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`session-card ${activeSessId === s.id ? "active" : ""}`}
              onClick={() => selectSession(s.id)}
            >
              <div className="session-card-top">
                <StatusDot status={s.status} />
              </div>
              <div className="session-goal">{s.goal}</div>
              <div className="session-meta">
                <span>{fmtDate(s.createdAt)}</span>
                <span>·</span>
                <span>{s.findingCount} findings</span>
                <span>·</span>
                <span>{s.roundsCompleted} round{s.roundsCompleted !== 1 ? "s" : ""}</span>
                <span className={`badge ${s.status}`}>{s.status}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main center ── */}
      <main className="main">
        {/* Goal input */}
        <div className="goal-area">
          <div className="goal-label">
            {activeSessId ? "Active Goal" : "New Research Goal"}
          </div>
          {!activeSessId ? (
            <>
              <textarea
                className="goal-textarea"
                placeholder="Enter a deep research objective… e.g. 'Sulfide solid-state battery electrolytes: state of the art 2024'"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleCreate();
                }}
                rows={3}
              />
              <div className="goal-actions" style={{ flexDirection: "column", alignItems: "flex-start", gap: "6px", marginTop: "12px" }}>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", width: "100%" }}>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: "1px solid var(--border2)",
                      background: "var(--surface2)",
                      color: "var(--text)",
                      fontSize: "13px",
                      fontWeight: 500,
                      outline: "none",
                      cursor: "pointer",
                    }}
                  >
                    <optgroup label="⚡ Local Models (Ollama — Unlimited & Private)">
                      <option value="ollama:qwen2.5:7b">Qwen 2.5 7B (Local — Lightweight & Quiet, Recommended)</option>
                      <option value="ollama:qwen2.5:14b">Qwen 2.5 14B (Local — High Compute / Fan Ramped)</option>
                      <option value="ollama:qwen2.5:32b">Qwen 2.5 32B (Local — Maximum Reasoning)</option>
                    </optgroup>
                    <optgroup label="☁️ Cloud APIs (Zero Heat & Fast)">
                      <option value="cloud-router">Auto Cloud Waterfall (Gemini → Groq → OpenRouter)</option>
                      <option value="groq:llama-3.3-70b-versatile">Groq Llama 3.3 70B (Fast & Cool)</option>
                      <option value="gemini:gemini-2.0-flash">Google Gemini 2.0 Flash (Fast & Cool)</option>
                      <option value="openrouter:nvidia/nemotron-3-super-120b-a12b:free">OpenRouter Nemotron Free</option>
                    </optgroup>
                  </select>
                  <button
                    className="btn-primary"
                    onClick={handleCreate}
                    disabled={!goal.trim() || loading}
                  >
                    {loading ? <span className="spinner" /> : "🚀"}
                    {loading ? "Creating…" : "Start Research"}
                  </button>
                  <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: "auto" }}>
                    ⌘↵ to submit
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  color: "var(--text)",
                  lineHeight: 1.5,
                  padding: "10px 0 14px",
                }}
              >
                {snap?.meta.goal ?? activeMeta?.goal ?? "—"}
              </div>
              <div className="goal-actions">
                {canStart && (
                  <button className="btn-primary" onClick={handleStart}>
                    {activeMeta?.status === "paused"
                      ? "▶ Resume"
                      : "▶ Start Research"}
                  </button>
                )}
                {isRunning && (
                  <button className="btn-danger" onClick={handlePause}>
                    ⏸ Pause
                  </button>
                )}
                <div className="rounds-info">
                  <span>Round {activeMeta?.roundsCompleted ?? 0}</span>
                  <span style={{ color: "var(--text-3)" }}>·</span>
                  <span>{activeMeta?.findingCount ?? 0} findings</span>
                </div>
              </div>
              {isRunning && (
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${Math.max(5, progress * 100)}%` }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Event log */}
        <div className="event-log-container">
          <div className="event-log-header">
            <div className="event-log-title">
              Agent Activity
              {isRunning && (
                <span className="live-badge">
                  <span className="dot" /> Live
                </span>
              )}
            </div>
            {events.length > 0 && (
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                {events.length} event{events.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="event-log">
            {events.length === 0 && (
              <div className="empty-state">
                <div className="icon">🧬</div>
                <h3>
                  {activeSessId
                    ? "Waiting for events…"
                    : "No session selected"}
                </h3>
                <p>
                  {activeSessId
                    ? "Start the session to see live agent activity here."
                    : "Select a session from the sidebar or start a new research goal."}
                </p>
              </div>
            )}
            {events.map((ev, i) => (
              <EventItem key={i} event={ev} />
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </main>

      {/* ── Right panel ── */}
      <aside className="panel">
        <div className="panel-tabs">
          <button
            className={`panel-tab ${panelTab === "sources" ? "active" : ""}`}
            onClick={() => setPanelTab("sources")}
          >
            Sources {findings.length > 0 ? `(${findings.length})` : ""}
          </button>
          <button
            className={`panel-tab ${panelTab === "critique" ? "active" : ""}`}
            onClick={() => setPanelTab("critique")}
          >
            Critique {critiques.length > 0 ? `(${critiques.length})` : ""}
          </button>
          <button
            className={`panel-tab ${panelTab === "report" ? "active" : ""}`}
            onClick={() => setPanelTab("report")}
          >
            Report {hasReport ? "✓" : ""}
          </button>
        </div>

        {/* Sources tab */}
        {panelTab === "sources" && (
          <div className="panel-body">
            {findings.length === 0 ? (
              <div className="empty-state" style={{ height: "auto", paddingTop: 40 }}>
                <div className="icon">📚</div>
                <h3>No sources yet</h3>
                <p>Sources will appear here as the search agent discovers them.</p>
              </div>
            ) : (
              findings.map((f) => <SourceCard key={f.id} finding={f} />)
            )}
          </div>
        )}

        {/* Critique tab */}
        {panelTab === "critique" && (
          <div className="panel-body">
            {critiques.length === 0 ? (
              <div className="empty-state" style={{ height: "auto", paddingTop: 40 }}>
                <div className="icon">⚖️</div>
                <h3>No critiques yet</h3>
                <p>The critic agent will analyse findings and surface gaps after each round.</p>
              </div>
            ) : (
              critiques.map((c, i) => (
                <div key={i}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--text-3)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      padding: "4px 0 8px",
                    }}
                  >
                    Round {i + 1} · {fmtDate(c.createdAt)}
                  </div>
                  <CritiquePanel critique={c} />
                </div>
              ))
            )}
          </div>
        )}

        {/* Report tab */}
        {panelTab === "report" && (
          <>
            {snap?.reportMarkdown ? (
              <>
                <div className="report-preview">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {snap.reportMarkdown}
                  </ReactMarkdown>
                </div>
                <div className="download-bar" style={{ display: "flex", gap: "8px", flexDirection: "column" }}>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button className="btn-download" onClick={handleDownload} style={{ flex: 1 }}>
                      ⬇ Download (.md)
                    </button>
                    <button
                      className="btn-download"
                      onClick={handleDownloadTxt}
                      style={{
                        flex: 1,
                        background: "var(--surface-3)",
                        border: "1px solid var(--border)",
                        color: "var(--text-1)",
                        boxShadow: "none"
                      }}
                      title="Opens in any text editor (TextEdit, Notes) without needing Markdown viewer"
                    >
                      📄 Download (.txt)
                    </button>
                  </div>
                  <button
                    className="btn-secondary"
                    onClick={handleCopy}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      padding: "8px",
                      fontSize: "13px",
                      cursor: "pointer",
                      background: copied ? "rgba(34, 197, 94, 0.2)" : undefined,
                      borderColor: copied ? "var(--success)" : undefined,
                      color: copied ? "var(--success)" : undefined,
                      transition: "all 0.2s ease"
                    }}
                  >
                    {copied ? "✓ Copied to clipboard!" : "📋 Copy Markdown to Clipboard"}
                  </button>
                </div>
              </>
            ) : (
              <div className="panel-body">
                <div
                  className="empty-state"
                  style={{ height: "auto", paddingTop: 40 }}
                >
                  <div className="icon">📄</div>
                  <h3>Report not ready</h3>
                  <p>
                    {isRunning
                      ? "The synthesizer will write the report after the final round."
                      : "Run a research session to generate a cited Markdown report."}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
