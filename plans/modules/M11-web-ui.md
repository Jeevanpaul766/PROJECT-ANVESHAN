# M11 — Web UI

**Status:** Not started  
**Goal:** A simple local UI to enter a goal, watch which agent is working, browse sources, download the report, and resume a session.  
**Depends on:** M10  
**Unblocks:** M15

## Why this module exists

Week 3 of the product roadmap: usability. DeepSeek Harness UI can wait until M13; this app has its own small UI so Anveshan is usable without learning dsh.

## What to build

### Files

| Path | Role |
|---|---|
| `web/index.html` | Shell |
| `web/vite.config.ts` | Dev server with proxy `/api` → `http://127.0.0.1:4747` |
| `web/src/main.tsx` | React entry |
| `web/src/App.tsx` | Layout |
| `web/src/api.ts` | fetch + EventSource helpers |
| `web/src/styles.css` | Layout and type |

Keep components few. Do not add a component library.

### Dependencies

- `vite`, `react`, `react-dom`
- `@types/react`, `@types/react-dom`
- `concurrently` for `npm run dev`

Production: Express in M10 should `express.static` `web/dist` after `vite build`. Add that serving in this module (small patch to `src/server/index.ts`).

### Screens (one page is enough)

1. **Left:** session list (goal, status, time). Button: new research.
2. **Center:** goal textarea, Start / Pause, live event log (agent + message).
3. **Right:** findings as source cards (title, kind, link). Download report button when `reportMarkdown` exists.

### Copy rules

- Wordmark: **Anveshan**
- Subtitle: **Deep Research OS**
- No stock “AI copilot” purple-gradient look. Prefer ink/paper, one accent color, readable serif for the report preview.

### Out of scope (product doc)

Beautiful polish, onboarding tours, mobile app, account screens.

## Acceptance checks

- [ ] `npm run dev` opens UI and health is visible (LLM ok or not).
- [ ] Starting a run shows live events without refresh.
- [ ] Completed run: download saves a `.md` file.
- [ ] Clicking an old session loads snapshot and can Start again if paused.

## Done means

A non-developer can run a research goal from the browser on localhost.

## Deferred

Plan editor, finding confidence filters, PDF, dark/light tokens as a system.
