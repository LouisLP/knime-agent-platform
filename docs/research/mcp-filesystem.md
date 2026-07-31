# Filesystem MCP server over stdio

Answers [#2](https://github.com/LouisLP/knime-agent-platform/issues/2). Sources are the
published package, the server's TypeScript source, the SDK source in `node_modules`, and the
MCP / OpenAI / OpenRouter specs. Every schema and result payload quoted below was captured by
actually running the server (`npx -y @modelcontextprotocol/server-filesystem@2026.7.10 <dir>`)
against `@modelcontextprotocol/sdk@1.30.0` — not read off a blog.

## Recommended configuration

```dotenv
MCP_TRANSPORT=stdio
MCP_COMMAND=npx
MCP_ARGS=-y @modelcontextprotocol/server-filesystem@2026.7.10 /absolute/path/to/sandbox
```

Pin the version — the package uses CalVer and the tool set has changed across releases. Use an
absolute sandbox path, create it before boot, and keep it outside the repo (the server can
write and delete inside it).

> The `MCP_ARGS` line above only works because the path has no spaces. See
> [Verdict on existing code](#verdict-on-existing-code).

## 1. Package, launch, allowed roots

| | |
| --- | --- |
| npm package | [`@modelcontextprotocol/server-filesystem`](https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem) |
| Latest at time of writing | `2026.7.10` (published 2026-07-10) |
| bin | `mcp-server-filesystem` → `dist/index.js` |
| Server identity | `secure-filesystem-server` v`0.2.0` (`initialize` result) |
| Capabilities | `{"tools":{"listChanged":true}}` — no resources, no prompts |
| Runtime deps | `@modelcontextprotocol/sdk ^1.29.0`, `diff`, `glob`, `minimatch` |

Launch: `npx -y @modelcontextprotocol/server-filesystem <dir> [more dirs...]`.

**Allowed directories are plain positional args.** There is no `--allowed-directories` flag —
the server does `process.argv.slice(2)` and treats every remaining token as a directory
([index.ts#L32](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/index.ts#L32)).

Two supply routes, and **roots wins**:

1. **CLI args** — expanded (`~`), resolved to absolute, and `realpath`'d at startup. If the
   resolved path differs from the original, *both* are kept, which is why a macOS `/tmp/x`
   arg shows up as `/tmp/x` **and** `/private/tmp/x` in `list_allowed_directories`
   ([index.ts#L45-L67](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/index.ts#L45-L67)).
   Inaccessible dirs are warned about and skipped; if *all* specified dirs are inaccessible
   the process exits 1.
2. **MCP Roots** — on `oninitialized`, if the client declared `capabilities.roots`, the server
   calls `roots/list` and **replaces** the entire allowed set with the client's roots. It also
   handles `notifications/roots/list_changed` for runtime updates
   ([index.ts#L724-L770](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/index.ts#L724-L770)).

Consequence worth knowing: if the client declares `roots` but returns an empty list, the
server logs *"No valid root directories provided by client"* and keeps the CLI dirs. If the
server was started with **no** args **and** the client doesn't support roots, `oninitialized`
throws and the session is dead
([index.ts#L767](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/index.ts#L767)).

The SDK `Client` does **not** declare `roots` unless you ask for it, so today we get the
CLI-args path. Confirmed by the server's own stderr during the probe run:

```
Client does not support MCP Roots, using allowed directories set from server args: [ '/tmp/…/sand box', '/private/tmp/…/sand box' ]
```

Opting into roots would mean `new Client({...}, { capabilities: { roots: {} } })` plus a
`roots/list` request handler. Not worth it here — one static sandbox, CLI args are simpler.

## 2. `StdioClientTransport`

`StdioServerParameters` ([`client/stdio.d.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/client/stdio.ts)):

| Field | Default | Notes |
| --- | --- | --- |
| `command` | — | Executable. Spawned with `shell: false`, so no shell quoting/globbing. |
| `args?` | `[]` | `string[]`. Passed verbatim — spaces in a path are safe *inside one array element*. |
| `env?` | — | **Merged over** `getDefaultEnvironment()`, not substituted for it. |
| `cwd?` | inherited | Sets the child's working directory. |
| `stderr?` | `'inherit'` | `'pipe'` / `'overlapped'` gives a `PassThrough` on `transport.stderr`. |
| `maxBufferSize?` | 10 MB | Single-message cap; exceeding it errors and closes the transport. |

`getDefaultEnvironment()` copies through an allowlist only — on POSIX `HOME`, `LOGNAME`,
`PATH`, `SHELL`, `TERM`, `USER`; on Windows `APPDATA`, `PATH`, `SYSTEMROOT`, `TEMP`,
`USERPROFILE`, `PROGRAMFILES`, etc. Values starting with `()` are skipped as a shellshock-style
guard.

Two corrections to the folklore here, both verified against the installed source
(`backend/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js`) and against
`@modelcontextprotocol/sdk@1.22.0`:

- **Passing `env` does *not* clobber `PATH`.** The spawn does
  `env: { ...getDefaultEnvironment(), ...this._serverParams.env }` — the comment in source
  reads *"merge default env with server env because mcp server needs some env vars"*. The
  older advice to hand-merge `getDefaultEnvironment()` yourself is obsolete for 1.22+.
- **The real hazard is the opposite direction.** The child gets the allowlist *only*, so
  anything else the parent has (`NODE_OPTIONS`, npm proxy settings, nvm shims beyond `PATH`)
  silently vanishes. And `env: process.env` would leak `OPENROUTER_API_KEY` into a filesystem
  server that has no business seeing it. Pass nothing.

Lifecycle:

```ts
await client.connect(transport)   // start() spawns the child, then does the `initialize` handshake
await client.listTools()          // tools/list; also caches outputSchema validators + task metadata
await client.callTool({ name, arguments })
await client.close()              // Protocol.close() -> transport.close()
```

`close()` **does** reap the child, in three escalating stages: `stdin.end()`, wait ≤2 s for
`close`; if still alive `SIGTERM`, wait ≤2 s; if still alive `SIGKILL`. Timers are `.unref()`ed
so they don't hold the event loop open. So a clean `await provider.close()` on `SIGINT` is
sufficient — no orphan `node` process, no manual `kill`.

Two SDK behaviours that only show up at runtime:

- `listTools()` calls `cacheToolMetadata()`, which compiles a validator per tool
  `outputSchema`. Every filesystem tool declares one. So a later `callTool` that returns no
  `structuredContent` and no `isError` **throws** `McpError(InvalidRequest, "…has an output
  schema but did not return structured content")`. Error results are exempt, so this is fine
  in practice, but it means `callTool` can throw for reasons other than transport failure.
- `callTool` throws `McpError(InvalidRequest, …)` for tools whose `execution.taskSupport` is
  `"required"`. The filesystem server sets `"forbidden"` on all 14 tools, so this never fires.

## 3. Tool set

14 tools. Note `read_file` is still exposed even though the README omits it — it's a
deprecated alias whose handler is literally the same function as `read_text_file`
([index.ts#L213-L223](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/index.ts#L213-L223)).
The model *will* see both and may pick the deprecated one.

Captured from a live `tools/list` (`required` in bold, everything else optional):

| Tool | Input properties | Read-only |
| --- | --- | --- |
| `read_file` *(deprecated)* | **`path`**:string, `head`:number, `tail`:number | yes |
| `read_text_file` | **`path`**:string, `head`:number, `tail`:number | yes |
| `read_media_file` | **`path`**:string | yes |
| `read_multiple_files` | **`paths`**:string[] (`minItems:1`) | yes |
| `write_file` | **`path`**:string, **`content`**:string | no |
| `edit_file` | **`path`**:string, **`edits`**:{`oldText`,`newText`}[], `dryRun`:boolean=`false` | no |
| `create_directory` | **`path`**:string | no |
| `list_directory` | **`path`**:string | yes |
| `list_directory_with_sizes` | **`path`**:string, `sortBy`:enum[`name`,`size`]=`name` | yes |
| `directory_tree` | **`path`**:string, `excludePatterns`:string[]=`[]` | yes |
| `move_file` | **`source`**:string, **`destination`**:string | no |
| `search_files` | **`path`**:string, **`pattern`**:string, `excludePatterns`:string[]=`[]` | yes |
| `get_file_info` | **`path`**:string | yes |
| `list_allowed_directories` | *(none — `properties: {}`, no `required`)* | yes |

Schemas are declared as raw Zod shapes on `server.registerTool(...)` and converted by the SDK
([index.ts#L188-L721](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/index.ts#L188-L721)).
The emitted JSON Schema is **draft-07** and carries a `$schema` key. Verbatim, for
`read_text_file`:

```json
{
  "type": "object",
  "properties": {
    "path": { "type": "string" },
    "tail": { "type": "number", "description": "If provided, returns only the last N lines of the file" },
    "head": { "type": "number", "description": "If provided, returns only the first N lines of the file" }
  },
  "required": ["path"],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

No `$ref`, no `$defs`, no `anyOf`, no root-level `anyOf`, no `additionalProperties` anywhere in
any of the 14 **input** schemas. `edit_file` nests one object-in-array, one level deep. That is
about as boring as MCP schemas get — which is the good news in §5.

Every tool also ships an `outputSchema`, `annotations` (`readOnlyHint` / `idempotentHint` /
`destructiveHint` / `openWorldHint:false`), and `execution: {"taskSupport":"forbidden"}`. Only
`read_media_file`'s **output** schema contains `anyOf` — irrelevant to us, since output schemas
are never sent to the model.

## 4. MCP `Tool` → OpenAI `tools[]`, and `CallToolResult` → `tool` message

### Tool definition

[OpenRouter](https://openrouter.ai/docs/guides/features/tool-calling) takes the Chat
Completions shape, with `parameters` as a plain JSON Schema object:

```json
{ "type": "function",
  "function": { "name": "…", "description": "…", "parameters": { "type": "object", "properties": {…}, "required": […] } } }
```

So the mapping is `tool.name → function.name`, `tool.description → function.description`,
`tool.inputSchema → function.parameters`. Drop `title`, `annotations`, `outputSchema`,
`execution` — none of them have a slot in the OpenAI shape.

`tool.inputSchema` is optional in the MCP TS types but the [spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
requires it in practice; a `{ "type": "object", "properties": {} }` fallback is right.

### Result flattening

A `CallToolResult` is `{ content: ContentBlock[], structuredContent?: object, isError?: boolean }`.
Block types and their payload fields, per the
[spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools):

| `type` | Fields | Sensible flattening |
| --- | --- | --- |
| `text` | `text` | the text |
| `image` | `data` (base64), `mimeType` | placeholder — `[image image/png, 41 KB]`; never inline the base64 |
| `audio` | `data` (base64), `mimeType` | placeholder, same reasoning |
| `resource_link` | `uri`, `name`, `description?`, `mimeType?` | `[resource_link name — uri]` |
| `resource` | `resource.{uri, mimeType?, text? \| blob?}` | inline `text` if present; else placeholder for `blob` |

Join blocks with `\n`, and send it as `{ role: "tool", tool_call_id, content }` — that's the
exact shape OpenRouter documents.

`structuredContent` is a redundant duplicate for this server (`{ "content": "<the same text>" }`)
and the spec explicitly says a tool returning structured content SHOULD also return the
serialized JSON as a text block. So preferring `content` is correct; falling back to
`JSON.stringify(structuredContent)` only when `content` is empty is a cheap safety net.

`isError: true` is a *result*, not an exception — the SDK returns it normally. Live example
from the probe, calling `read_text_file` on a nonexistent file:

```json
{ "content": [{ "type": "text", "text": "ENOENT: no such file or directory, open '/tmp/…/nope.txt'" }],
  "isError": true }
```

That message should reach the model verbatim: it's exactly the feedback it needs to retry with
a real path. Note there's no `structuredContent` on error results.

## 5. Gotchas

**Schema quirks.** The general MCP→OpenAI hazards are `$ref`/`$defs` (many providers don't
resolve them), root-level `anyOf`, `zod-to-json-schema`'s `$schema` / `additionalProperties`
emissions, and OpenAI **strict mode**, which requires `additionalProperties:false` on every
object and *every* property listed in `required`, and rejects `allOf`/`oneOf`/`not`/`if`
([structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)).
For *this* server, in non-strict mode, none of it bites: no `$ref`, no `$defs`, no root
`anyOf`. The two live nits are:

- the stray `"$schema": "http://json-schema.org/draft-07/schema#"` key inside every
  `inputSchema` — harmless for OpenRouter in non-strict mode, but it is an unexpected key that
  some stricter provider gateways reject, and it costs tokens on every request;
- `minItems` (`read_multiple_files`) and `default` (`dryRun`, `sortBy`, `excludePatterns`) are
  advisory only — the model may omit or ignore them.

Do **not** turn on `strict: true` with these schemas as-is: `required` doesn't list every
property on any of them, and `additionalProperties:false` is absent everywhere. Strict mode
would need a rewrite pass over the schema, which is not worth it.

**stderr / stdout corruption.** The framing is newline-delimited JSON over the child's stdout,
so *anything* the server prints to stdout corrupts the stream. This server is disciplined —
every diagnostic goes through `console.error`, including the startup banner *"Secure MCP
Filesystem Server running on stdio"*. But `npx -y` writes install/deprecation noise, and it
writes it to stderr too:

```
npm warn deprecated glob@10.5.0: Old versions of glob are not supported…
```

With the default `stderr: 'inherit'` all of that lands in our backend's terminal, interleaved
with our own logs. Setting `stderr: 'pipe'` and attaching a listener gives a labelled, greppable
channel and lets you capture the first-boot failure ("Error: None of the specified directories
are accessible") rather than losing it in the scrollback. Recommended.

**Path resolution.**

- Relative paths *work*: `validatePath` resolves them against each allowed directory in turn,
  taking the first that lands inside the allowed set, falling back to `allowedDirectories[0]`
  ([lib.ts#L76-L96](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/lib.ts#L76-L96)).
  Verified: `read_text_file {path: "hello.txt"}` read the sandbox file. Still, tell the model
  to use absolute paths — the fallback is a coin-flip when there are several roots.
- `~` and `~/…` are expanded via `os.homedir()` both for CLI args and for tool arguments
  ([path-utils.ts](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/path-utils.ts)).
- **Symlinks are resolved and re-checked.** `validatePath` verifies the requested path is
  inside an allowed dir, then `realpath`s it and checks *again*, so a symlink pointing out of
  the sandbox is rejected. For a file that doesn't exist yet (a `write_file` target) it
  validates the `realpath` of the parent directory instead
  ([lib.ts#L99-L140](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/lib.ts#L99-L140)).
  The returned path is the *real* one, so on macOS `/tmp/...` silently becomes `/private/tmp/...`
  in messages back to the model.
- `list_allowed_directories` returns duplicates on macOS (`/tmp/x` and `/private/tmp/x` for a
  single `/tmp/x` arg) — cosmetic, but confusing in a transcript.

**Windows / npx.** `spawn` runs with `shell: false`, so `npx` — a `.cmd` shim on Windows —
isn't directly executable. The server README's answer is `command: "cmd"`, `args: ["/c", "npx",
"-y", …]`. The SDK's `cross-spawn` dependency papers over most of this, but the documented
config is the safe one. Since `MCP_COMMAND`/`MCP_ARGS` are env-driven, no code change is needed
to accommodate it. Also note `npx -y` re-resolves the package on first run — that latency lands
inside `connect()`, so the boot-time connect can take several seconds cold.

**Cost.** 14 tools × ~600-char descriptions is roughly 2–3k tokens on *every* request
(OpenRouter requires `tools` on follow-up calls too). Filtering the list — dropping `read_file`
at minimum, and arguably the write tools — is a cheap win.

## Verdict on existing code

> Resolved in [#6](https://github.com/LouisLP/knime-agent-platform/issues/6); the boxes below are
> ticked where the fix landed.

`backend/src/service/mcp/mcp.client.ts` is structurally right: connect once, cache
`tools/list`, pass `inputSchema` through as `parameters`, treat a failed call as a conversation
event rather than a server fault. Three things need fixing, one is a real bug.

- [x] **`MCP_ARGS?.split(' ')` breaks on paths with spaces.** `/Users/me/My Documents/sandbox`
      becomes two argv entries, and the server treats each as a separate directory, warns
      *"Cannot access directory …"* for both, then exits 1. Since `spawn` runs with
      `shell: false`, quoting in the `.env` file doesn't help either — the quotes end up
      *inside* the argument. Either switch `MCP_ARGS` to a JSON array
      (`MCP_ARGS=["-y","@modelcontextprotocol/server-filesystem","/path/with space"]`, parsed
      with `z.string().transform(JSON.parse)` and validated as `string[]`), or split on a
      delimiter that can't occur in a path. JSON is the honest option and it's a two-line
      change in `env.ts`.
- [x] **`renderContent` drops non-text blocks into raw JSON.** `JSON.stringify(block)` on an
      `image`/`audio`/`resource` block from `read_media_file` dumps the entire base64 payload
      into the model's context — a 1 MB PNG becomes ~1.4 MB of tokens. Add explicit cases per
      the table in §4 and emit a placeholder (`[image image/png, 41 KB]`) instead of the data.
      Cheapest alternative if `read_media_file` is out of scope: filter it out of `listTools()`
      so the model can never call it.
- [x] **Set `stderr: 'pipe'` on the transport and log it under a prefix.** Default `'inherit'`
      interleaves npm warnings and server diagnostics with our own stdout unlabelled, and the
      most useful message the server ever emits — the startup directory-access failure — is the
      one you'll want captured.

Optional, in rough value order:

- [x] Filter `read_file` out of `listTools()` — it's a deprecated duplicate of
      `read_text_file` and giving the model two identical tools invites the wrong pick.
- [x] Strip the `$schema` key from `inputSchema` before sending it as `parameters`. Not
      required for OpenRouter, but it's noise on every request and it's a one-liner.
- [x] Prefer `structuredContent` as a fallback when `content` is empty.
- [ ] Consider surfacing `annotations.readOnlyHint` to the UI — it's the natural signal for
      flagging destructive tool calls, and this server sets it on all 14 tools.

No change needed for: `env` handling (correctly omitted — the SDK merges the safe allowlist),
shutdown (`client.close()` reaps the child via SIGTERM/SIGKILL), or the `isError` handling
(`isError:true` arrives as a normal result, and the catch block correctly covers the separate
case of an `McpError` throw).

## Sources

- [`modelcontextprotocol/servers` — `src/filesystem`](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) (`index.ts`, `lib.ts`, `path-utils.ts`, `path-validation.ts`, `roots-utils.ts`, README)
- [`@modelcontextprotocol/server-filesystem` on npm](https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem)
- [`@modelcontextprotocol/sdk` — `client/stdio.ts`, `client/index.ts`](https://github.com/modelcontextprotocol/typescript-sdk/tree/main/src/client) (read as installed at v1.30.0, cross-checked against v1.22.0)
- [MCP spec 2025-06-18 — Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [OpenAI — function calling](https://developers.openai.com/api/docs/guides/function-calling) / [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenRouter — tool & function calling](https://openrouter.ai/docs/guides/features/tool-calling)
