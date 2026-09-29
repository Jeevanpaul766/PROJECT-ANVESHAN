/**
 * Manual search probe for M03 acceptance.
 * Spec: plans/modules/M03-source-gatherers.md
 */

import { gatherSources } from "../engine/search.js";

const query = "solid-state battery sulfide electrolyte";
const sources = await gatherSources(query);

const urls = sources.map((s) => s.url.toLowerCase());
const uniqueUrls = new Set(urls);
if (urls.length !== uniqueUrls.size) {
  console.error("Duplicate URLs detected");
  process.exit(1);
}

for (const source of sources) {
  console.log(`${source.kind} | ${source.title} | ${source.url}`);
}
console.log(`count=${sources.length}`);

const academic = sources.filter(
  (s) => s.kind === "arxiv" || s.kind === "semantic-scholar",
);
process.exit(academic.length > 0 ? 0 : 1);
