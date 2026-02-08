#!/usr/bin/env node
/**
 * Claude Code Hook: UserPromptSubmit — Context Injection
 *
 * Searches MemOS for relevant memories, reranks via LLM to filter noise,
 * and injects relevant results as additionalContext.
 * Uses HTTP REST API (:8000) directly, not MCP.
 *
 * Stdin: { prompt, session_id, hook_event_name }
 * Stdout: { hookSpecificOutput: { hookEventName, additionalContext } }
 */
import { loadConfig } from "./lib/config.mjs";

loadConfig();

const MEMOS_API = process.env.MEMOS_API_URL || "http://127.0.0.1:8000";
const USER_ID = process.env.MEMOS_USER_ID || "default";
const CUBE_ID = process.env.MEMOS_CUBE_ID || "memos";
const SECRET = process.env.INTERNAL_SERVICE_SECRET || "";
const RERANK_ENABLED = process.env.MEMOS_RERANKER === "true"; // disabled by default
const FETCH_K = RERANK_ENABLED ? 12 : 8; // over-fetch only when reranking
const INJECT_K = 6;      // max text memories to inject
const SKILL_K = 2;       // max skill memories to inject
const PREF_K = 2;        // max preference memories to inject
const MAX_CHARS = 500;
const RERANK_SNIPPET = 300;

// Skip patterns: casual prompts not worth searching
const SKIP_RE = /^(hi|hello|hey|ok|yes|no|thanks|спасибо|привет|ок|да|нет|ладно|понял|хорошо|\/\w+)\s*[.!?]*$/i;

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

function getMemoryText(m) {
  return m.memory || m.content || m.memory_content || "";
}

/**
 * Rerank memories via LLM — returns only relevant indices.
 * Falls back to original array on any failure.
 */
async function rerankMemories(query, memories) {
  if (memories.length < 3) return memories;

  const snippets = memories.map((mem, i) => {
    const text = getMemoryText(mem);
    const truncated = text.length > RERANK_SNIPPET
      ? text.slice(0, RERANK_SNIPPET) + "…"
      : text;
    return `[${i}] ${truncated}`;
  });

  const prompt = `You are a relevance judge. Given a user query and memory snippets from a personal knowledge base, return ONLY the indices of memories that are relevant to the query.

RELEVANT = directly relates to the query topic, contains useful info
NOT RELEVANT = different topic, only shares a keyword, generic/unrelated

Query: "${query}"

Memories:
${snippets.join("\n")}

Return a JSON array of relevant indices. Example: [0, 2, 5]
If none are relevant, return: []`;

  try {
    const res = await fetch(`${MEMOS_API}/product/chat/complete`, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify({
        user_id: USER_ID,
        mem_cube_id: CUBE_ID,
        query: prompt,
        top_k: 1,
        include_preference: false,
        add_message_on_answer: false,
        max_tokens: 50,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return memories;

    const data = await res.json();
    const responseText = data?.data?.response || "";

    // Extract JSON array from response
    const match = responseText.match(/\[[\s\S]*?\]/);
    if (!match) return memories;

    let indices;
    try { indices = JSON.parse(match[0]); } catch { return memories; }
    if (!Array.isArray(indices)) return memories;

    // Validate and deduplicate indices
    const seen = new Set();
    const filtered = [];
    for (const idx of indices) {
      const n = typeof idx === "string" ? parseInt(idx, 10) : idx;
      if (Number.isInteger(n) && n >= 0 && n < memories.length && !seen.has(n)) {
        seen.add(n);
        filtered.push(memories[n]);
      }
    }

    return filtered.length > 0 ? filtered : [];
  } catch {
    // Reranker failed — return unfiltered
    return memories;
  }
}

async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  const prompt = event.prompt || "";

  // Skip short or casual prompts
  if (prompt.length < 5 || SKIP_RE.test(prompt.trim())) {
    process.exit(0);
  }

  try {
    // Step 1: Over-fetch from MemOS (with skill, preference, and MMR dedup)
    const res = await fetch(`${MEMOS_API}/product/search`, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify({
        query: prompt.slice(0, 500),
        user_id: USER_ID,
        mem_cube_id: CUBE_ID,
        top_k: FETCH_K,
        include_skill_memory: true,
        skill_mem_top_k: 3,
        include_preference: true,
        dedup: "mmr",
        internet_search: true,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) process.exit(0);

    const data = await res.json();

    // Extract text memories
    const rawCubes = data?.data?.text_mem || data?.text_mem || [];
    let memories = rawCubes.flatMap((cube) => cube.memories || []);

    // Extract skill memories
    const rawSkill = data?.data?.skill_mem || [];
    const skillMemories = rawSkill.flatMap((cube) => cube.memories || []).slice(0, SKILL_K);

    // Extract preference memories
    const rawPref = data?.data?.pref_mem || [];
    const prefMemories = rawPref.flatMap((cube) => cube.memories || []).slice(0, PREF_K);

    if (!memories.length && !skillMemories.length && !prefMemories.length) process.exit(0);

    // Step 2: Rerank text memories via LLM (disabled by default, set MEMOS_RERANKER=true to enable)
    if (RERANK_ENABLED && memories.length) {
      memories = await rerankMemories(prompt.slice(0, 300), memories);
    }

    // Step 3: Format and inject
    const sections = [];

    // Text memories
    if (memories.length) {
      const textLines = memories.slice(0, INJECT_K).map((m) => {
        const text = getMemoryText(m);
        return "- " + (text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + "..." : text);
      }).filter((l) => l.length > 4);
      if (textLines.length) {
        sections.push("Relevant memories from MemOS:\n" + textLines.join("\n"));
      }
    }

    // Skill memories
    if (skillMemories.length) {
      const skillLines = skillMemories.map((m) => {
        const meta = m.metadata || m;
        const name = meta.name || meta.key || "unnamed";
        const desc = meta.description || getMemoryText(m) || "";
        const procedure = meta.procedure || "";
        let line = `- [Skill: ${name}] ${desc}`;
        if (procedure) line += `\n  Procedure: ${procedure.length > 300 ? procedure.slice(0, 300) + "..." : procedure}`;
        return line;
      });
      sections.push("Relevant skills from MemOS:\n" + skillLines.join("\n"));
    }

    // Preference memories
    if (prefMemories.length) {
      const prefLines = prefMemories.map((m) => {
        const text = getMemoryText(m);
        const truncated = text.length > 300 ? text.slice(0, 300) + "..." : text;
        return `- [Preference] ${truncated}`;
      }).filter((l) => l.length > 16);
      if (prefLines.length) {
        sections.push("User preferences from MemOS:\n" + prefLines.join("\n"));
      }
    }

    if (!sections.length) process.exit(0);

    const context = `<user_memory_context>\n${sections.join("\n\n")}\n</user_memory_context>`;

    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: context,
      },
    }));
  } catch {
    // Non-fatal: silently exit on any error
    process.exit(0);
  }
}

main();
