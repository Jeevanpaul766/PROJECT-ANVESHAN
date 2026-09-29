/**
 * HTTP server entry point for Project Anveshan.
 * Spec: plans/modules/M10-http-api.md
 *
 * Binds to 127.0.0.1 by default (SERVER.host / SERVER.port from config).
 * Run with:  npm start  or  npm run dev:api
 */

import express from "express";
import cors from "cors";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SERVER } from "../engine/config.js";
import { buildRouter } from "./routes.js";

export const VERSION = "0.2.0";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));          // local-only — safe for 127.0.0.1
app.use(express.json());

// ── Serve built web UI (M11) ────────────────────────────────────────────────
const webDist = join(__dirname, "../../web/dist");
app.use(express.static(webDist));


// ── Routes ──────────────────────────────────────────────────────────────────
app.use(buildRouter());

// ── 404 catch-all ───────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(SERVER.port, SERVER.host, (err?: Error) => {
  if (err) {
    console.error(`Failed to start API server:`, err.message);
    process.exit(1);
  }
  console.log(
    `Anveshan API v${VERSION} listening on http://${SERVER.host}:${SERVER.port}`,
  );
  console.log("Endpoints:");
  console.log(`  GET  /api/health`);
  console.log(`  GET  /api/sessions`);
  console.log(`  POST /api/sessions          { goal }`);
  console.log(`  GET  /api/sessions/:id`);
  console.log(`  POST /api/sessions/:id/start`);
  console.log(`  POST /api/sessions/:id/pause`);
  console.log(`  GET  /api/sessions/:id/events   (SSE)`);
  console.log(`  GET  /api/sessions/:id/report   (Markdown)`);
});

export default app;
