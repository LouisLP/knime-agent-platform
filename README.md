# Agentic Chat: KNIME Full-Stack Exercise

A vertical slice of an agentic chat app: a Vue frontend talks to a Node/TypeScript backend,
which orchestrates an OpenRouter model and an MCP server and returns structured conversation
items.

```
frontend/   Vue 3 + TypeScript (Vite)   — chat UI, tool-usage indicator, error states
backend/    Node 22 + TypeScript        — HTTP API, model <-> tool orchestration, MCP client
sandbox/    Seed files the MCP filesystem server is allowed to touch
docs/adr/   Architecture decision records
```

The per-side READMEs go deeper: [backend/README.md](backend/README.md) covers layering,
branded ids, and the orchestration loop; [frontend/README.md](frontend/README.md) covers the
UI structure.

## Running it

Prerequisites: Node 22.18+ (or 24.12+), `npm`, and `pnpm`.

```bash
make install
```

Then fill in `backend/.env` (created for you from `.env.example`):

| Variable              | Notes                                                    |
| --------------------- | -------------------------------------------------------- |
| `OPENROUTER_API_KEY`  | The provided key. **Never commit this.**                 |
| `OPENROUTER_MODEL`    | `vendor/model` slug, e.g. `anthropic/claude-sonnet-4.5`  |
| `MCP_COMMAND`/`_ARGS` | How to launch the MCP server. Pre-filled; `MCP_ARGS` is a JSON array |
| `MCP_SANDBOX_DIR`     | The server's allowed root. Blank = the committed `sandbox/`          |
| `MAX_TOOL_ITERATIONS` | Model↔tool round trips per user message (default 5)      |
| `PORT`, `CORS_ORIGIN` | Backend port and the allowed frontend origin             |

Only `OPENROUTER_API_KEY` actually has to be filled in — the MCP defaults launch the
filesystem server against `sandbox/` with no further setup. The first boot is a few seconds
slower while `npx` fetches the server package.

```bash
make dev
```

Backend on `http://localhost:3000`, frontend on `http://localhost:5173`.
`make check` runs type-check + lint on both sides; `make help` lists everything.

Config is validated at boot in `backend/src/config/env.ts` — a missing or malformed variable
stops the process with a readable message rather than failing on the first request.

## Model and MCP tool

| | |
| --- | --- |
| **Model** | `anthropic/claude-sonnet-4.5` via OpenRouter's OpenAI-compatible `/chat/completions` |
| **MCP server** | [`@modelcontextprotocol/server-filesystem`](https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem) `2026.7.10`, launched over **stdio**, rooted at `sandbox/` |
| **Tools exercised** | `list_directory`, `read_text_file`, `search_files` — 13 are discovered and offered |

The model is environment-configurable and never hardcoded. Tools are not hardcoded either:
the backend calls `tools/list` on the MCP server at boot and passes whatever it finds to the
model, so swapping the MCP server requires no code change.

The server version is pinned because the package uses CalVer and its tool set has changed
across releases. `sandbox/` is committed with a few seed files (notes, a CSV, a checklist) so
a fresh clone has something to read — ask _"which region had the highest Q2 revenue?"_ and
the model has to list, read and reason over the CSV. The server can write and delete inside
that directory and refuses every path outside it, symlinks included.

## Architecture

```
Vue app ──HTTP/JSON──> Express API ──> ChatService ──> OpenRouter (chat completions)
                                            │
                                            └──────> MCP client (tools/list, tools/call)
```

The backend is layered `api → service → repository → domain`, with dependencies pointing
inward and every cross-layer collaborator behind an interface (`LlmClient`, `ToolProvider`,
`ConversationRepository`). `container.ts` is the composition root. See
[backend/README.md](backend/README.md#layers).

### API

| Method | Path                              | Purpose                                          |
| ------ | --------------------------------- | ------------------------------------------------ |
| `GET`  | `/health`                         | Liveness + active model                          |
| `POST` | `/api/conversations`              | Create a conversation → `{ id, items }`          |
| `GET`  | `/api/conversations/:id`          | Full conversation                                |
| `POST` | `/api/conversations/:id/messages` | Send `{ content }` → the items this turn produced |

### Conversation items

One discriminated union shared by both sides
(`backend/src/domain/conversation-item.ts`):

`user_message` · `assistant_message` · `tool_call` · `tool_result` · `error`

`POST /messages` returns only the items that turn produced, in the order they happened, so
the frontend appends them and renders tool activity inline. `tool_call` and `tool_result`
are linked by `toolCallId`.

### Orchestration flow

1. Append the `user_message` item.
2. Project the conversation into provider messages. `error` items are deliberately not
   replayed to the model.
3. Call OpenRouter with the discovered MCP tool list.
4. No tool calls → append `assistant_message`, done.
5. Tool calls → append `tool_call`, execute via MCP, append `tool_result`, loop from step 2.
6. Bounded by `MAX_TOOL_ITERATIONS`; exceeding it appends an `error` item.

## Design decisions and trade-offs

Each of these has a fuller write-up in [`docs/adr/`](docs/adr/).

- **Node/TypeScript backend instead of Go or Java.** The brief prefers Go or Java; within a
  4–6 hour timebox one language across both sides buys a single shared conversation-item
  model and no context switching. The layering is the part that transfers, and it is
  framework-agnostic. — [ADR 0001](docs/adr/0001-node-typescript-backend.md)
- **Non-streaming request/response.** Token streaming is explicitly out of scope. Returning
  the turn's items as one array keeps the transport trivial and the item union honest; the
  same shape can later be emitted incrementally over SSE without changing the model. —
  [ADR 0002](docs/adr/0002-turn-shaped-responses.md)
- **Errors are conversation items, not failed requests.** A provider or MCP failure returns
  200 with an `error` item, so the UI renders it in the transcript instead of showing a dead
  request. A failing *tool* becomes a `tool_result` with `isError: true` so the model can
  recover on its own. — [ADR 0003](docs/adr/0003-errors-as-conversation-items.md)
- **In-memory repository behind an interface.** Persistence is out of scope, but the seam
  exists so swapping in a real store is a one-file change.
- **Branded ids.** Three UUID-shaped ids flow through the same call sites in the
  orchestrator; brands make mixing them a compile error at zero runtime cost.
- **MCP session opened once at boot** and reused, with discovery cached for the session and
  a clean shutdown on `SIGINT`/`SIGTERM`. Startup fails loudly if the server is unreachable,
  which is the right trade for a single-instance app.

## Out of scope

Per the brief: auth, persistence, multiple users/conversations, multiple providers, UI-based
config, token streaming, parallel tool calls, human approval, file uploads, deployment, and
broad test coverage.

## Time allocation

_Fill in at the end._

| Area | Time |
| --- | --- |
| Design, scaffolding, project setup | |
| Backend: domain model + layering | |
| Backend: OpenRouter client | |
| Backend: MCP client + tool loop | |
| Frontend: chat UI and states | |
| Docs and cleanup | |
| **Total** | |
