/**
 * Manual orchestrator probe for M05 acceptance.
 * Spec: plans/modules/M05-orchestrator.md
 */

import { buildPlan } from "../engine/agents/orchestrator.js";

const goal = "Deep research on sulfide solid-state battery electrolytes 2023-2026";
const plan = await buildPlan(goal, [], ["moisture stability sulfide electrolyte"]);

const taskCount = plan.tasks.length;
const goalOk = plan.goal === goal;
const queries = plan.tasks.map((t) => t.query);
const notAllSame = queries.some((q) => q !== goal);

console.log(
  JSON.stringify(
    {
      goal: plan.goal,
      summary: plan.summary,
      questions: plan.questions.length,
      tasks: taskCount,
      queries,
      goalOk,
      taskCountOk: taskCount >= 3,
      notAllSameAsGoal: notAllSame,
    },
    null,
    2,
  ),
);

process.exit(goalOk && taskCount >= 3 ? 0 : 1);
