/**
 * Manual LLM probe for M02 acceptance.
 * Spec: plans/modules/M02-llm-adapter.md
 */

import { probeLlm } from "../engine/llm.js";

const result = await probeLlm();
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
