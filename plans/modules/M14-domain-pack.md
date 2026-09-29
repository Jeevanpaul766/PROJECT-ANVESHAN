# M14 — First domain pack (after MVP)

**Status:** Later  
**Goal:** One installable pack that makes Anveshan stronger in a single field.  
**Depends on:** M13 (and a working M09)  
**Unblocks:** community skill pattern

## Why this module exists

The product vision includes **domain packs** (biotech, materials, finance). The 30-day plan explicitly excludes “many domain packs.” Build **one** after the first preview: suggested **General Science / AI Research**.

## What to build (when you start this)

```
packs/general-science/
  PACK.md                 # what it changes
  queries.md              # default extra queries and venues
  critic-rubric.md        # extra weaknesses to look for
  .dsh/skills/anveshan-domain-science/SKILL.md
```

Runtime: `runResearch` reads an optional `ANVESHAN_DOMAIN_PACK=general-science` and prepends pack queries + critic rubric to M05/M07. Until then, packs are documents only.

## Acceptance checks (when built)

- [ ] Same goal with pack vs without pack changes plan queries (logged in events).
- [ ] Pack contains no secrets and no copyrighted full papers.

## Done means

A second pack can be copied from this folder layout.

## Do not start this during M00–M12
