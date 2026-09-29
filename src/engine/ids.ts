/**
 * ID and timestamp helpers.
 * Spec: plans/modules/M01-foundation.md
 */

import { randomBytes } from "node:crypto";

export function id(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
