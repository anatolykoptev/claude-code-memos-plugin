---
description: "Search MemDB memory for relevant information"
argument-hint: "<query>"
allowed-tools: ["Bash"]
---

# Memory Search

Search the MemDB memory system for relevant stored information.

## Instructions

1. Take the user's query: `$ARGUMENTS`
2. Run the following curl command to search MemDB:

```bash
curl -s -X POST "${MEMOS_API_URL:-http://127.0.0.1:8000}/product/search" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Service: ${INTERNAL_SERVICE_SECRET}" \
  -d '{
    "query": "'"$ARGUMENTS"'",
    "user_id": "'"${MEMOS_USER_ID:-default}"'",
    "mem_cube_id": "'"${MEMOS_CUBE_ID:-memos}"'",
    "top_k": 10
  }'
```

3. Parse the JSON response. Memories are at `data.data.text_mem[].memories[]`.
4. Display results as a formatted list showing:
   - The memory content (`.memory` or `.content` or `.memory_content` field)
   - Any tags or metadata if present
   - The relevance score if available
5. If no results found, tell the user.
6. If the API is unreachable, inform the user that MemDB may not be running on the expected port.
