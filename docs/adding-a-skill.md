# Adding a Skill to Project Anveshan

Project Anveshan integrates with **DeepSeek Harness (DSH)** and coding agents using the standardized skill specification.

Skills allow agents to understand specialized workflows, invoke CLI tools, or follow domain-specific research protocols.

---

## Skill Directory Structure

Skills reside in `.dsh/skills/<skill-name>/` or `.agents/skills/<skill-name>/`:

```text
.dsh/skills/
  └── my-custom-skill/
      └── SKILL.md
```

> **Important**: The directory name **must** match the `name:` property in the YAML frontmatter exactly (using lowercase kebab-case).

---

## Frontmatter Template

Every `SKILL.md` must start with YAML frontmatter containing `name` and `description`:

```markdown
---
name: my-custom-skill
description: >
  Concise summary of what this skill does and when an agent or harness
  should activate it. Keep it under 3-4 sentences.
---

# My Custom Skill Title

## When to use this skill
...
## Instructions & Steps
...
```

---

## Creating a New Skill: Step-by-Step

### 1. Create the Directory and File
```bash
mkdir -p .dsh/skills/battery-electrolyte-benchmarks
touch .dsh/skills/battery-electrolyte-benchmarks/SKILL.md
```

### 2. Write the Skill Specification
Define clear instructions, inputs, expected output schemas, and CLI commands.

Example:
```markdown
---
name: battery-electrolyte-benchmarks
description: >
  Domain protocol for evaluating solid-state battery electrolytes.
  Guides the agent to query electrochemical databases and compare ionic
  conductivity, activation energy, and electrochemical stability windows.
---

# Battery Electrolyte Benchmark Protocol

## Objective
Extract quantitative electrochemical metrics for solid-state electrolyte candidate materials.

## Queries to Execute
- "<material> ionic conductivity mS/cm 2024"
- "<material> electrochemical stability window V vs Li/Li+"
- "<material> critical current density mA/cm2 dendrite suppression"

## Output Format
Ensure findings capture exact values with units and temperature (e.g. 10.2 mS/cm at 25 °C).
```

### 3. Verify Skill Discovery
Open the workspace in DeepSeek Harness:
```bash
dsh open .
```
Verify that `battery-electrolyte-benchmarks` appears in your skill catalog.

---

## Reference Examples

Review the 5 built-in core skills in [.dsh/skills/](file:///.dsh/skills/):
- **`anveshan-deep-research`**: Master skill describing the end-to-end multi-round loop.
- **`anveshan-orchestrator`**: How the planner decomposes user goals into structured queries.
- **`anveshan-search`**: Search provider selection and provenance capture.
- **`anveshan-critic`**: Critical evaluation, gap detection, and contradiction analysis.
- **`anveshan-synthesizer`**: Markdown report formulation and citation rules.
