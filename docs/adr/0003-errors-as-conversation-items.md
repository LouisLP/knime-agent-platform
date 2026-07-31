# 0003 — Errors modelled as conversation items

Status: Accepted

## Context

Three different things can fail during a turn, and they are not the same kind of failure: a
malformed request, a tool that returns an error, and the provider or MCP connection dropping
mid-turn. Collapsing all of them into non-2xx responses would throw away the items already
produced and leave the user with a dead request and no transcript.

## Decision

- Malformed requests → non-2xx with `{ error: { code, message, details? } }`.
- A tool that fails → a `tool_result` item with `isError: true`, fed back to the model so it
  can recover on its own.
- Provider or MCP failure, or exceeding `MAX_TOOL_ITERATIONS` → an `error` conversation item;
  the turn ends and the request still returns 200 with the items produced so far.

`error` items are deliberately not replayed to the model on subsequent turns.

## Consequences

- The user always sees what happened and where in the turn it happened.
- `code` is drawn from one closed union (`domain/error-code.ts`) shared by transport errors
  and `error` items, so the frontend switches on one exhaustive set rather than two.
- A 200 that contains an error item is unusual and needs the comment it has — the status
  code describes the HTTP exchange, the items describe the conversation.
- Not replaying `error` items keeps a transient outage from poisoning the model's view of the
  conversation, at the cost of the model not knowing a previous attempt failed.
