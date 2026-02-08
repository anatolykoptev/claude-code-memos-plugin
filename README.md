# claude-code-memos-plugin

Claude Code plugin for MemOS memory integration — automatic context injection and conversation persistence.

## What it does

**Two hooks** that make Claude Code sessions memory-aware:

1. **`memos-inject`** (UserPromptSubmit) — Before each prompt, searches MemOS for relevant memories, reranks via LLM to filter noise, and injects the top results as context. Claude sees relevant past decisions, preferences, and project knowledge automatically.

2. **`memos-precompact`** (PreCompact) — Before Claude Code compacts context, reads the conversation transcript, extracts key facts/decisions via LLM summarization, and saves them to MemOS. Important context survives across sessions.

**One command:**

- `/memory-search <query>` — Manually search MemOS memories with a specific query.

**One skill:**

- `memory-context` — Guides Claude on how to use injected memory context and handle memory-related questions.

## Prerequisites

- [MemOS](https://github.com/MemTensor/MemOS) running and accessible (default: `http://127.0.0.1:8000`)
- Node.js 18+ (for `fetch` API)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMOS_API_URL` | `http://127.0.0.1:8000` | MemOS API endpoint |
| `MEMOS_USER_ID` | `default` | User identifier |
| `MEMOS_CUBE_ID` | `memos` | Memory cube identifier |
| `INTERNAL_SERVICE_SECRET` | (empty) | Optional auth secret for X-Internal-Service header |

## Installation

```bash
git clone <this-repo> ~/claude-code-memos-plugin
claude plugins install ~/claude-code-memos-plugin
```

Or install from a local path:

```bash
claude plugins install /path/to/claude-code-memos-plugin
```

## How the hooks work

### Context Injection (UserPromptSubmit)

```
User prompt → Search MemOS (top 12) → LLM rerank → Inject top 6 as context
```

- Skips short/casual prompts (hi, ok, yes, etc.)
- Over-fetches 12 memories, then LLM filters to most relevant
- Injected as `<user_memory_context>` block in additionalContext
- 15-second timeout, fails silently on error

### Compaction Flush (PreCompact)

```
Transcript → Extract last 50 messages → LLM summarize → Save entries to MemOS
```

- Reads conversation transcript (JSONL format)
- Extracts facts, decisions, preferences, and action items
- Saves up to 15 entries tagged `compaction_summary`
- 120-second timeout, never blocks compaction

## License

MIT
