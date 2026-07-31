# 0002 — Turn-shaped responses instead of token streaming

Status: Accepted

## Context

An agentic turn produces several items — an assistant message, possibly one or more tool
calls and their results. Token streaming is explicitly out of scope. The frontend still has
to show tool activity, not just a final answer.

## Decision

`POST /api/conversations/:id/messages` returns the items produced by that turn as an ordered
array. The frontend appends them to its transcript.

## Consequences

- The transport stays plain JSON request/response: no SSE, no WebSocket, no reconnection or
  partial-item handling.
- Tool activity is still visible, because `tool_call` and `tool_result` are first-class
  items linked by `toolCallId` — the indicator falls out of the data model rather than
  needing a side channel.
- The cost is latency: nothing renders until the whole turn finishes, so a multi-round tool
  loop looks like a long pause. Mitigated in the UI with a pending state.
- The item union is the unit of streaming if this is ever revisited — emitting the same
  items one at a time over SSE changes the transport but not the model or the frontend's
  reducer.
