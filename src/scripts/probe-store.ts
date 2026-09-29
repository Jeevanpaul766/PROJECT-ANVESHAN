/**
 * Manual store probe for M04 acceptance.
 * Spec: plans/modules/M04-session-memory.md
 */

import {
  appendEvent,
  createSession,
  listSessions,
  loadSnapshot,
  saveFindings,
} from "../engine/store.js";
import { id, nowIso } from "../engine/ids.js";
import type { Finding } from "../engine/types.js";

const emptyList = await listSessions();
console.log(`listSessions_ok count=${emptyList.length}`);

const meta = await createSession("M04 probe: sulfide electrolyte memory test");
const meta2 = await createSession("M04 probe: second session for unique ids");
if (meta.id === meta2.id) {
  console.error("Session ids collided");
  process.exit(1);
}
console.log(`created ${meta.id} and ${meta2.id}`);

await appendEvent(meta.id, {
  type: "status",
  agent: "system",
  message: "Probe started",
});
await appendEvent(meta.id, {
  type: "search",
  agent: "search",
  message: "Probe search note",
});

const findings: Finding[] = [
  {
    id: id("find"),
    createdAt: nowIso(),
    agent: "search",
    claim: "Interfacial stability remains a barrier for sulfide electrolytes.",
    summary: "Probe finding one.",
    source: {
      kind: "arxiv",
      title: "Probe arXiv paper",
      url: "https://arxiv.org/abs/0000.00000",
      year: 2025,
      venue: "arXiv",
      snippet: "Placeholder.",
    },
    confidence: 0.6,
    tags: ["probe"],
  },
  {
    id: id("find"),
    createdAt: nowIso(),
    agent: "search",
    claim: "A second sourced finding proves list persistence.",
    summary: "Probe finding two.",
    source: {
      kind: "web",
      title: "Probe web page",
      url: "https://example.edu/probe",
      snippet: "Placeholder.",
    },
    confidence: 0.4,
    tags: ["probe"],
  },
];

await saveFindings(meta.id, findings);

const reloaded = await loadSnapshot(meta.id);
const ok =
  reloaded.events.length >= 2 &&
  reloaded.findings.length === 2 &&
  reloaded.findings.every((f) => f.source.url && f.source.title) &&
  reloaded.meta.id === meta.id;

console.log(
  JSON.stringify(
    {
      sessionId: meta.id,
      events: reloaded.events.length,
      findings: reloaded.findings.length,
      status: reloaded.meta.status,
      ok,
    },
    null,
    2,
  ),
);

process.exit(ok ? 0 : 1);
