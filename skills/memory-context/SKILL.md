---
name: memory-context
description: "Use when the user asks about their memories, past decisions, stored context, or when conversation context seems incomplete and MemOS memory could help fill gaps"
version: 1.0.0
---

# Memory Context

## Overview

This skill helps you work with MemOS memory that is automatically injected into conversations via the `UserPromptSubmit` hook.

## How Memory Injection Works

Before each user prompt is processed, the `memos-inject` hook:
1. Searches MemOS for memories relevant to the user's prompt
2. Reranks results via LLM to filter noise (keeps only truly relevant memories)
3. Injects relevant memories as `additionalContext` in a `<user_memory_context>` block

You may see blocks like:
```
<user_memory_context>
Relevant memories from MemOS:
- Memory content here...
- Another memory...
</user_memory_context>
```

## How to Use Injected Memories

- **Reference naturally**: When memory context is present and relevant, incorporate it into your responses without explicitly calling out "according to your memories"
- **Fill gaps**: If a user references something from a previous session, check if memory context provides the missing information
- **Acknowledge when relevant**: If the user asks "do you remember X?", check the memory context for related information

## When Memory is Missing

If the user asks about something that should be in memory but isn't in the injected context:
1. Suggest using `/memory-search <specific query>` to search with different terms
2. The automatic injection uses the full prompt as the search query — a targeted search may find different results

## Conversation Persistence

Before context compaction, the `memos-precompact` hook automatically:
1. Reads the conversation transcript
2. Extracts key facts, decisions, and context via LLM summarization
3. Saves entries to MemOS tagged as `compaction_summary`

This means important information from conversations is preserved across sessions without manual action.

## Environment Requirements

The hooks require MemOS running and accessible. Configuration via environment variables:
- `MEMOS_API_URL` — MemOS API endpoint (default: `http://127.0.0.1:8000`)
- `MEMOS_USER_ID` — User identifier (default: `default`)
- `MEMOS_CUBE_ID` — Memory cube identifier (default: `memos`)
- `INTERNAL_SERVICE_SECRET` — Optional auth secret
