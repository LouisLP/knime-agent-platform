# Backend

Node + TypeScript backend for the agentic chat app. Orchestrates OpenRouter (OpenAI-compatible
chat completions) and an MCP server, and returns structured conversation items to the frontend.

## Running

```bash
npm install
cp .env.example .env   # fill in OPENROUTER_API_KEY; the MCP defaults work as shipped
npm run dev
```

Other scripts: `npm test`, `npm run type-check`, `npm run lint`, `npm run lint:fix`, `npm start`.

`npm test` is Node's built-in runner over `src/**/*.test.ts` — no test dependency, in
keeping with the no-build-step setup. Coverage is deliberately thin (see below): the HTTP
layer and the repository are covered end to end with the model and MCP server faked, which
is what the interfaces in `container.ts` exist for.

TypeScript runs directly on Node's built-in type stripping — no build step, no `tsx`.
The tradeoff: TypeScript syntax that emits runtime code is unavailable, so no `enum`,
`const enum`, constructor parameter properties, namespaces, or decorators. `tsconfig.json`
sets `erasableSyntaxOnly`, so `npm run type-check` rejects those at build time rather than
letting them fail as a `SyntaxError` on boot.

## Layers

Dependencies point inward; each layer only knows the one below it.

```
api/         HTTP: routing, DTO validation, error -> status mapping. No orchestration.
service/     Orchestration: the model <-> tool loop, the OpenRouter client, the MCP client.
repository/  Persistence seam. In-memory only (storage is out of scope).
domain/      Conversation item types + typed errors. Depends on nothing.
```

`container.ts` is the composition root — everything is constructed there and injected
downward, so each layer can be tested with hand-written fakes (`LlmClient`,
`ToolProvider`, `ConversationRepository` are all interfaces).

`domain/` is not a types folder — it holds the conversation model, id constructors and
error classes, i.e. runtime code the other layers depend on. Type-only files are the
exception there, not the rule.

### File naming

Outer layers suffix the file with its architectural role — `.controller.ts`, `.service.ts`,
`.repository.ts`, `.routes.ts`, `.dto.ts`, `.client.ts`, `.mapper.ts` — because the role is
what you search for and there are several files per concept.

Domain files are named for the concept alone (`conversation.ts`, `conversation-item.ts`,
`errors.ts`, `ids.ts`): "domain" is already the role, so `conversation.domain.ts` would
only stutter.

A `.types.ts` suffix is reserved for genuinely type-only files that sit beside a same-named
implementation — `openrouter.types.ts` next to `openrouter.client.ts`. Don't reach for it
just because a file happens to be mostly interfaces.

## API

| Method | Path                              | Status | Response                                             |
| ------ | --------------------------------- | ------ | ---------------------------------------------------- |
| `GET`  | `/health`                         | 200    | `{ status, model }`                                  |
| `POST` | `/api/conversations`              | 201    | `{ id, createdAt, items }`                           |
| `GET`  | `/api/conversations/:id`          | 200    | `{ id, createdAt, items }`                           |
| `POST` | `/api/conversations/:id/messages` | 201    | `{ conversationId, items }` — only this turn's items |

Errors are `{ error: { code, message, details? } }`, where `code` is one of the values in
`src/domain/error-code.ts` — a closed union the frontend can switch on exhaustively. The
same set is used for the `code` on `error` conversation items, so a transport-level failure
and an in-conversation failure are named consistently.

It is an `as const` object plus a same-named union type rather than a TS `enum`: enums are
not erasable (see above), and the values must serialise as exactly these strings.

## Conversation items

One discriminated union, defined in `src/domain/conversation-item.ts`, shared by every
layer and mirrored by the frontend:

`user_message` · `assistant_message` · `tool_call` · `tool_result` · `error`

`POST /messages` returns only the items produced by that turn, in the order they happened,
so the frontend can append them and show tool activity inline. `tool_call` and
`tool_result` are linked by `toolCallId`.

## Branded ids

`ConversationId`, `ItemId` and `ToolCallId` are branded strings (`src/domain/brand.ts`,
`src/domain/ids.ts`) rather than bare `string`. Three different UUID-shaped ids move through
the same call sites in the orchestrator — `conversation.id`, `item.id`, `call.id` — and
nothing but a brand distinguishes them.

The brand uses a `unique symbol` that is never emitted, so values stay plain strings at
runtime and serialise to JSON unchanged. Each brand has exactly one cast site:

| Brand            | Created / cast at                                                                     |
| ---------------- | ------------------------------------------------------------------------------------- |
| `ConversationId` | `newConversationId()` in the repository; `toConversationId()` in the zod param schema |
| `ItemId`         | `newItemId()`, called only by `createItem()`                                          |
| `ToolCallId`     | `toToolCallId()`, at the provider response boundary                                   |

Inbound ids are branded by `conversationParamsSchema` _after_ UUID validation, so an
unvalidated string cannot reach the service layer. Tool names are deliberately left as
plain `string` — there is no second string they could be confused with.

## Orchestration flow

1. Append the `user_message` item.
2. Project the conversation into provider messages (`service/conversation.mapper.ts`).
   `error` items are deliberately not replayed to the model.
3. Call OpenRouter with the MCP tool list.
4. No tool calls → append `assistant_message`, done.
5. Tool calls → append `tool_call`, execute via MCP, append `tool_result`, loop from 2.
6. Bounded by `MAX_TOOL_ITERATIONS`; exceeding it appends an `error` item.

Failure handling: a failing tool becomes a `tool_result` with `isError: true` so the model
can recover; a failing provider or MCP connection becomes an `error` item and the turn ends.
Either way the request still succeeds with the items so far — the frontend renders the
error in the transcript rather than as a dead request.

## MCP lifecycle

The MCP session is opened once at boot (`toolProvider.connect()` in `src/index.ts`) and
reused across requests; tool discovery is cached for the session; the session is closed on
`SIGINT`/`SIGTERM`. Startup fails loudly if the server cannot be launched — a bad command, a
missing sandbox directory and a malformed `MCP_ARGS` each stop the process with a message
naming the actual cause.

The shipped configuration is **stdio**: the backend spawns
`@modelcontextprotocol/server-filesystem` as a child process and speaks newline-delimited
JSON-RPC over its stdin/stdout. `client.close()` reaps that child (stdin end → `SIGTERM` →
`SIGKILL`), so a clean shutdown leaves no orphan process. The `http` (streamable HTTP)
transport is still supported via `MCP_TRANSPORT=http`, but nothing in the demo setup uses it.

`MCP_SANDBOX_DIR` is appended to `MCP_ARGS` as the server's last positional argument — the
one directory it is allowed to touch. It is a named setting rather than another entry in the
argv blob because it is the security boundary, and it is checked for existence before the
spawn: the server otherwise exits 1 and the failure reaches us as an opaque closed connection.

Three deliberate choices in the MCP → OpenAI translation (`src/service/mcp/mcp.client.ts`):

- **`read_file` is hidden from the model.** It is a deprecated alias whose handler is
  literally `read_text_file`'s; offering both invites the wrong pick and costs tokens on
  every request. 13 of the server's 14 tools are offered.
- **`$schema` is stripped from each `inputSchema`.** Harmless for OpenRouter, but an
  unexpected key for stricter gateways and dead weight in every request body.
- **Binary content blocks become placeholders.** An `image`/`audio` block renders as
  `[image image/png, 41 KB]` rather than its base64 payload — `read_media_file` on a 1 MB PNG
  would otherwise put ~1.4 MB of useless tokens into the model's context.

The server's stderr is piped rather than inherited and re-logged under an `[mcp]` prefix, so
`npx` warnings and server diagnostics stay distinguishable from our own logs.

## Configuration

All config is environment-driven and validated at boot in `src/config/env.ts` — an invalid
or missing variable stops the process with a readable message instead of failing on the
first request. See `.env.example` for the full list. Do not commit `.env`.

The MCP settings are validated as a discriminated union on `MCP_TRANSPORT` (default `stdio`),
so `MCP_SERVER_URL` is required (and typed non-optional) on the `http` branch and
`MCP_COMMAND` on the `stdio` branch. The client narrows on the transport instead of asserting
non-null on values the schema already guaranteed. Blank values are treated as unset, so a var
the chosen transport does not use can be left empty without failing validation.

`MCP_ARGS` is a **JSON array**, not a space-separated string: the child is spawned with
`shell: false`, so argv is passed verbatim and a sandbox path containing a space has to
survive as one element. Quoting it in `.env` would only land the quote characters inside the
argument.

`OPENROUTER_MODEL` is typed as `` `${string}/${string}` `` and regex-checked, since
OpenRouter routes on a `vendor/model` slug and a bare model name otherwise surfaces only as
a 404 on the first real request.
