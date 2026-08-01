# 0004 — The filesystem MCP server over stdio, rooted at a committed sandbox

Status: Accepted

## Context

The brief says to connect to an existing MCP server, discover its tools, execute them, and
feed the results back to the model. It doesn't say which server. That leaves two things to
pick: the server itself, and how the backend talks to it.

Whatever I picked had to work on a reviewer's machine on the first try, with no accounts to
create and nothing to install by hand. It also had to give the model something worth reasoning
over, because a tool call that returns a single value doesn't really prove the loop works.

## Decision

Use [`@modelcontextprotocol/server-filesystem`](https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem),
version-pinned, launched as a child process over **stdio** and rooted at a `sandbox/`
directory committed to the repo.

`MCP_SANDBOX_DIR` is a named setting rather than another entry in the `MCP_ARGS` blob, and it's
checked for existence before the spawn. The transport is a discriminated union on
`MCP_TRANSPORT`, so streamable HTTP still works (`MCP_TRANSPORT=http` + `MCP_SERVER_URL`)
without any of the stdio settings hanging around as optionals.

## Consequences

- A fresh clone runs with only `OPENROUTER_API_KEY` filled in. `npx` fetches the server on
  first boot, which costs a few seconds once and nothing after that.
- The sandbox ships with seed files (notes, a quarterly-revenue CSV, a release checklist), so
  there's a real question to ask. "Which region had the highest Q2 revenue?" forces the model
  to list, search, read and then reason over the contents, which is a much better exercise of
  the loop than a single lookup.
- Fourteen tools arrive from discovery and thirteen are offered. `read_file` is hidden because
  it's a deprecated alias whose handler is literally `read_text_file`'s, and offering both
  invites the wrong pick while costing tokens on every request.
- stdio means process lifecycle is now our problem. The session opens once at boot, is reused
  across requests, and is closed on `SIGINT`/`SIGTERM` so the child gets reaped rather than
  orphaned. Startup fails loudly if the spawn fails.
- The server's own stderr is piped and re-logged under an `[mcp]` prefix. Inheriting it would
  have mixed `npx` warnings into our logs with no way to tell them apart.
- The version is pinned because the package uses CalVer and its tool set has genuinely changed
  across releases. An unpinned `npx` would let the tool list drift under the docs.
- Committing a directory the model can write to and delete from is a deliberate trade. The
  server refuses every path outside that root (symlinks included), and there's nothing in there
  worth protecting, so the blast radius is a `git checkout`.
