#!/usr/bin/env node
/**
 * Claude Code Hook: SessionStart — Health Check
 *
 * Checks if MemOS is reachable and injects a status message.
 * No stdin for SessionStart hooks; outputs JSON to stdout.
 *
 * Stdout: { hookSpecificOutput: { hookEventName, additionalContext } }
 */
import { loadConfig, getApiUrl, getUserId, getCubeId } from "./lib/config.mjs";

loadConfig();

const API = getApiUrl();
const USER = getUserId();
const CUBE = getCubeId();

try {
  const res = await fetch(`${API}/product/scheduler/allstatus`, {
    signal: AbortSignal.timeout(3000),
  });

  if (res.ok) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: `MemOS memory connected (${API}, user: ${USER}, cube: ${CUBE})`,
      },
    }));
  } else {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: `WARNING: MemOS returned HTTP ${res.status} at ${API}. Memory injection and persistence are disabled this session. Run setup.sh in the plugin directory to configure.`,
      },
    }));
  }
} catch {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `WARNING: MemOS is NOT reachable at ${API}. Memory injection and persistence are disabled this session. Run setup.sh in the plugin directory to configure.`,
    },
  }));
}
