# Backend smoke test — real model, real MCP

Manual end-to-end run of the backend against the live OpenRouter key and the filesystem MCP
server, driven by `curl`. Recorded so the frontend and the walkthrough have a real payload to
build against rather than an invented one.

- **Date:** 2026-07-31
- **Model:** `anthropic/claude-sonnet-4.5` via OpenRouter `/chat/completions`
- **MCP:** `@modelcontextprotocol/server-filesystem@2026.7.10` over stdio, rooted at `sandbox/`
- **Config:** stock `.env.example` with only `OPENROUTER_API_KEY` filled in

Boot discovers **13 tools** and offers all of them to the model:
`read_text_file`, `read_media_file`, `read_multiple_files`, `write_file`, `edit_file`,
`create_directory`, `list_directory`, `list_directory_with_sizes`, `directory_tree`,
`move_file`, `search_files`, `get_file_info`, `list_allowed_directories`.

`GET /health` → `{"status":"ok","model":"anthropic/claude-sonnet-4.5"}`.

## Happy path

`POST /api/conversations` → `201`, then
`POST /api/conversations/:id/messages` with
`{"content":"what files are in the sandbox, and what does the CSV contain?"}`.

Full payload: [`fixtures/turn-with-tools.json`](fixtures/turn-with-tools.json). 15 items:

| # | type | tool | note |
| - | ---- | ---- | ---- |
| 1 | `user_message` | | |
| 2 | `assistant_message` | | "I'll help you explore the sandbox directory…" |
| 3–4 | `tool_call` → `tool_result` | `list_allowed_directories` | resolves the sandbox root |
| 5–6 | `tool_call` → `tool_result` | `list_directory` | `README.md`, `notes.md`, `reports/` |
| 7 | `assistant_message` | | "Let me check the reports directory…" |
| 8–9 | `tool_call` → `tool_result` | `list_directory` | `reports/` |
| 10–11 | `tool_call` → `tool_result` | `search_files` | finds the CSV |
| 12 | `assistant_message` | | "Now let me read the CSV file:" |
| 13–14 | `tool_call` → `tool_result` | `read_text_file` | `quarterly-revenue.csv` |
| 15 | `assistant_message` | | final answer |

Verified over the response: every `tool_call` is immediately followed by its `tool_result`,
matched on both `toolCallId` and `toolName`; `toolCallId`s are unique; the turn opens on
`user_message` and closes on `assistant_message`; every item carries
`id`/`conversationId`/`createdAt`/`type`; `conversationId` is constant; `createdAt` is
monotonic. `GET /api/conversations/:id` afterwards returns the same 15 items.

**The stream is not a fixed four-item shape.** The model narrates before calling a tool, so
`assistant_message` items are interleaved between tool rounds, and a single question took four
tool rounds and five calls. The frontend must render an arbitrary-length sequence and treat
a non-final `assistant_message` as ordinary prose, not as the end of the turn.

Tool-call arguments come back as parsed objects (`{"path": "<repo>/sandbox"}`), not as the raw
JSON string — the string form only survives when it fails to parse.

Of the tools the README names, all three are exercised (`list_directory`, `search_files`,
`read_text_file`); the model also opens with `list_allowed_directories` to resolve the
sandbox root, because the server reports absolute paths and rejects relative ones. The README
table lists all four.

## Failure paths

### A tool that errors

`{"content":"Read the file /etc/passwd and tell me the first line."}` →
[`fixtures/turn-with-tool-error.json`](fixtures/turn-with-tool-error.json), 5 items:
`user_message` → `assistant_message` → `tool_call` → `tool_result` (`isError: true`,
`"Access denied - path outside allowed directories"`) → `assistant_message` explaining the
refusal. The turn still ends normally at `201` — the failure is fed back to the model, which
recovers on its own, exactly as ADR 0003 describes.

### A bad model slug

Booting with `OPENROUTER_MODEL=acme/not-a-real-model` starts fine (the slug is only validated
by the provider, on the first request) and `/health` reports it. Sending a message returns
`201` with two items:

```json
{ "type": "user_message", "content": "hello" }
{ "type": "error", "code": "provider_error",
  "message": "OpenRouter returned 400: acme/not-a-real-model is not a valid model ID" }
```

### An unreachable MCP server

`MCP_COMMAND=definitely-not-a-real-binary` fails at boot with exit code 1 and
`Could not connect to the MCP server: spawn definitely-not-a-real-binary ENOENT` — no stack
trace, no half-started server.

### Request validation

| Request | Result |
| ------- | ------ |
| `GET /api/conversations/<unknown uuid>` | `404` `not_found` |
| `GET /api/conversations/not-a-uuid` | `400` `validation_error`, `"Invalid UUID"` |
| `POST …/messages` `{"content":"   "}` | `400` `validation_error`, `"content must not be empty"` |
| `POST …/messages` `{}` | `400` `validation_error`, `"expected string, received undefined"` |

## Fixed as a result

- The root README and ADR 0003 said a provider/MCP failure "returns 200". `POST /messages`
  returns `201`; the point being made is that it is a success status, so both now say that.
- The README's "tools exercised" row omitted `list_allowed_directories`, which the model
  reaches for first every time.
