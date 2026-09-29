/**
 * API helpers for Anveshan Web UI.
 * All calls go through Vite's /api proxy → http://127.0.0.1:4747
 */

const BASE = "/api";

export interface SessionMeta {
  id: string;
  goal: string;
  status: "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  model: string;
  roundsCompleted: number;
  findingCount: number;
  error?: string;
}

export interface Source {
  kind: "arxiv" | "semantic-scholar" | "web";
  title: string;
  url: string;
  authors?: string[];
  year?: number;
  snippet?: string;
}

export interface Finding {
  id: string;
  createdAt: string;
  agent: string;
  claim: string;
  summary: string;
  source: Source;
  confidence: number;
  tags: string[];
}

export interface Critique {
  createdAt: string;
  strengths: string[];
  weaknesses: string[];
  missingAngles: string[];
  nextQueries: string[];
}

export interface SessionEvent {
  ts: string;
  type: "status" | "plan" | "search" | "finding" | "critic" | "synthesize" | "error";
  agent: string;
  message: string;
  data?: unknown;
}

export interface SessionSnapshot {
  meta: SessionMeta;
  plan: unknown;
  findings: Finding[];
  critiques: Critique[];
  events: SessionEvent[];
  reportMarkdown: string | null;
}

export interface HealthResult {
  ok: boolean;
  version: string;
  llm: { ok: boolean; model: string; detail: string };
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => req<HealthResult>("/health"),

  getModels: () => req<string[]>("/models"),

  listSessions: () => req<SessionMeta[]>("/sessions"),

  createSession: (goal: string, model?: string) =>
    req<SessionMeta>("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal, model }),
    }),

  getSession: (id: string) => req<SessionSnapshot>(`/sessions/${id}`),

  startSession: (id: string) =>
    req<{ status: string; sessionId: string }>(`/sessions/${id}/start`, {
      method: "POST",
    }),

  pauseSession: (id: string) =>
    req<{ status: string; sessionId: string }>(`/sessions/${id}/pause`, {
      method: "POST",
    }),

  getReport: async (id: string): Promise<string> => {
    const res = await fetch(`${BASE}/sessions/${id}/report`);
    if (!res.ok) throw new Error("Report not available");
    return res.text();
  },

  subscribeEvents: (
    id: string,
    onEvent: (e: SessionEvent) => void,
    onError?: () => void,
  ): (() => void) => {
    const es = new EventSource(`${BASE}/sessions/${id}/events`);
    es.onmessage = (ev) => {
      try {
        onEvent(JSON.parse(ev.data) as SessionEvent);
      } catch {
        /* ignore malformed */
      }
    };
    if (onError) es.onerror = onError;
    return () => es.close();
  },
};
