/**
 * Shared config loader for memos-memory plugin.
 *
 * Reads ~/.config/claude-code-memos/config.env (KEY=VALUE lines),
 * sets process.env only if not already set (env vars take precedence).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_PATH = join(homedir(), ".config", "claude-code-memos", "config.env");

export function loadConfig() {
  try {
    const text = readFileSync(CONFIG_PATH, "utf-8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // Config file missing — env vars or defaults will be used
  }
}

export function getApiUrl() {
  return process.env.MEMOS_API_URL || "http://127.0.0.1:8080";
}

export function getUserId() {
  return process.env.MEMOS_USER_ID || "default";
}

export function getCubeId() {
  return process.env.MEMOS_CUBE_ID || "memos";
}
