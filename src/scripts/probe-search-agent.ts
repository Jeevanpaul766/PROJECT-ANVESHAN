/**
 * Manual search-agent probe for M06 acceptance.
 * Spec: plans/modules/M06-search-agent.md
 */

import { buildPlan } from "../engine/agents/orchestrator.js";
import { runSearchTasks } from "../engine/agents/search.js";

const goal = "sulfide solid-state battery electrolyte";
const plan = await buildPlan(goal, [], []);
// Cap work: only first search task for a fast probe
const slim = {
  ...plan,
  tasks: plan.tasks.slice(0, 1).map((t) => ({ ...t, done: false })),
};

const first = await runSearchTasks("test probe goal", slim, []);
const urls = first.findings.map((f) => f.source.url.toLowerCase());
const httpOk = first.findings.every((f) => /^https?:\/\//i.test(f.source.url));
const titlesOk = first.findings.every((f) => Boolean(f.source.title.trim()));

const second = await runSearchTasks("test probe goal", first.plan, first.findings);
const dupes = second.findings.filter((f) =>
  urls.includes(f.source.url.toLowerCase()),
);

console.log(
  JSON.stringify(
    {
      newFindings: first.findings.length,
      sample: first.findings.slice(0, 3).map((f) => ({
        title: f.source.title,
        url: f.source.url,
        kind: f.source.kind,
      })),
      httpOk,
      titlesOk,
      secondNewFindings: second.findings.length,
      duplicateUrlsFromSecond: dupes.length,
      tasksDone: first.plan.tasks.filter((t) => t.done).length,
    },
    null,
    2,
  ),
);

const ok =
  first.findings.length > 0 &&
  httpOk &&
  titlesOk &&
  dupes.length === 0;

process.exit(ok ? 0 : 1);
