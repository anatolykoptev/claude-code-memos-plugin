#!/usr/bin/env node
/**
 * Claude Code Hook: PreCompact — Compaction Flush
 *
 * Before Claude Code compacts context, reads the transcript, summarizes it
 * via MemOS chat/complete, and saves the summary entries to MemOS.
 *
 * Stdin: { session_id, transcript_path, hook_event_name }
 * Stdout: { continue: true }
 */
import { readFileSync } from "node:fs";

const MEMOS_API = process.env.MEMOS_API_URL || "http://127.0.0.1:8000";
const USER_ID = process.env.MEMOS_USER_ID || "default";
const CUBE_ID = process.env.MEMOS_CUBE_ID || "memos";
const SECRET = process.env.INTERNAL_SERVICE_SECRET || "";

function makeHeaders() {
  const h = { "Content-Type": "application/json" };
  if (SECRET) h["X-Internal-Service"] = SECRET;
  return h;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
  });
}

async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  const transcriptPath = event.transcript_path;

  if (!transcriptPath) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  try {
    // Read transcript (JSONL format)
    const raw = readFileSync(transcriptPath, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);

    // Extract user/assistant messages from last portion
    const messages = [];
    for (const line of lines.slice(-50)) {
      try {
        const entry = JSON.parse(line);
        const role = entry.role || entry.type;
        const text =
          typeof entry.content === "string"
            ? entry.content
            : Array.isArray(entry.content)
              ? entry.content.map((b) => b?.text || "").join("")
              : entry.message || "";
        if ((role === "user" || role === "assistant") && text.length > 10) {
          messages.push(`${role}: ${text.slice(0, 500)}`);
        }
      } catch {
        // skip malformed lines
      }
    }

    if (messages.length < 2) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const transcript = messages.join("\n\n");

    // Summarize via MemOS chat/complete
    const summaryPrompt = `Extract the key facts, decisions, and important context from this conversation. Return a JSON array of objects with "content" (the fact/decision) and "tags" (array of relevant tags).

Focus on:
- User preferences and profile facts
- Technical decisions made
- Project context and progress
- Action items and tasks

Conversation:
${transcript.slice(0, 4000)}

Return ONLY a JSON array like: [{"content": "fact here", "tags": ["tag1"]}, ...]`;

    const summaryRes = await fetch(`${MEMOS_API}/product/chat/complete`, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify({
        user_id: USER_ID,
        mem_cube_id: CUBE_ID,
        query: summaryPrompt,
        top_k: 1,
        add_message_on_answer: false,
        max_tokens: 2000,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!summaryRes.ok) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const summaryData = await summaryRes.json();
    const responseText = summaryData?.data?.response || "";

    // Parse entries from LLM response
    const match = responseText.match(/\[[\s\S]*\]/);
    let entries = [];
    if (match) {
      try {
        entries = JSON.parse(match[0]);
      } catch {
        const cleaned = match[0]
          .replace(/,\s*([}\]])/g, "$1")
          .replace(/[\u201C\u201D]/g, '"');
        try { entries = JSON.parse(cleaned); } catch { /* skip */ }
      }
    }

    if (!entries.length) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // Save each entry to MemOS
    let saved = 0;
    for (const entry of entries.slice(0, 15)) {
      if (!entry.content || entry.content.length < 10) continue;
      try {
        await fetch(`${MEMOS_API}/product/add`, {
          method: "POST",
          headers: makeHeaders(),
          body: JSON.stringify({
            user_id: USER_ID,
            mem_cube_id: CUBE_ID,
            memory_content: entry.content,
            tags: entry.tags || ["compaction_summary"],
            info: {
              _type: "compaction_summary",
              source: "claude_code_precompact",
              ts: new Date().toISOString(),
            },
          }),
          signal: AbortSignal.timeout(15000),
        });
        saved++;
      } catch {
        // continue saving other entries
      }
    }

    // Also save a meta-entry
    if (saved > 0) {
      try {
        await fetch(`${MEMOS_API}/product/add`, {
          method: "POST",
          headers: makeHeaders(),
          body: JSON.stringify({
            user_id: USER_ID,
            mem_cube_id: CUBE_ID,
            memory_content: `Claude Code compaction flush: ${saved} entries saved from ${messages.length} messages`,
            tags: ["compaction_summary"],
            info: {
              _type: "compaction_summary",
              entries_saved: saved,
              message_count: messages.length,
              ts: new Date().toISOString(),
            },
          }),
          signal: AbortSignal.timeout(15000),
        });
      } catch { /* non-fatal */ }
    }
  } catch {
    // Non-fatal: never block compaction
  }

  console.log(JSON.stringify({ continue: true }));
}

main();
