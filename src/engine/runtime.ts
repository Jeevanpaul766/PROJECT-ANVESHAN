/**
 * In-memory registry of active AbortControllers, one per sessionId.
 * Spec: plans/modules/M09-research-loop.md
 *
 * Only one run per sessionId is allowed. A second runResearch call on the
 * same id throws until the first finishes or is cancelled.
 */

const active = new Map<string, AbortController>();

/** Register a new run. Throws if the session is already running. */
export function register(sessionId: string): AbortController {
  if (active.has(sessionId)) {
    throw new Error(
      `Session ${sessionId} is already running. Cancel it before starting a new run.`,
    );
  }
  const controller = new AbortController();
  active.set(sessionId, controller);
  return controller;
}

/** Deregister a session after it finishes (success, fail, or cancel). */
export function deregister(sessionId: string): void {
  active.delete(sessionId);
}

/** Abort a running session. No-op if the session is not active. */
export function abort(sessionId: string): void {
  active.get(sessionId)?.abort();
}

/** True if a run is currently registered for this sessionId. */
export function isRunning(sessionId: string): boolean {
  return active.has(sessionId);
}
