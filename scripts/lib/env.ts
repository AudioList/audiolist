/**
 * Auto-loads env files into process.env.
 * Import this as the first line in any script that needs env vars:
 *   import "./lib/env.js";
 *
 * Load order (later files do NOT override already-set vars):
 *   1) .env
 *   2) .env.local
 *   3) .env.admin.local
 *
 * No external dependencies (no dotenv).
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function stripQuotes(v: string): string {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function loadEnvFile(path: string): void {
  try {
    const content = readFileSync(path, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.replace(/\r$/, '').trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const rawVal = trimmed.slice(eq + 1).trim();
      const val = stripQuotes(rawVal);
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // File not found or unreadable: ignore.
  }
}

const envPaths = [
  resolve(__dirname, '../../.env'),
  resolve(__dirname, '../../.env.local'),
  resolve(__dirname, '../../.env.admin.local'),
];

for (const p of envPaths) {
  loadEnvFile(p);
}
