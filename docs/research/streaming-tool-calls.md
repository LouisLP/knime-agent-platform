# Streaming a tool-calling loop over OpenAI-compatible SSE

Answers [#31](https://github.com/LouisLP/knime-agent-platform/issues/31). Two halves: how
OpenRouter streams a completion that contains tool calls (upstream), and what SSE event shape
this backend should expose to the frontend (downstream).

Sources are the OpenRouter and OpenAI streaming docs and the WHATWG SSE spec — plus five live
captures. Every wire detail quoted below came out of an actual `stream: true` request against
`openrouter.ai/api/v1/chat/completions` with two tools attached, run against **five different
providers** (Amazon Bedrock, OpenAI, Google, DeepInfra, StreamLake) to separate what OpenRouter
normalises from what varies. The Express findings likewise come from running this repo's exact
`express@5` + `cors` setup, not from reading its docs.

## Recommendation in one paragraph

Add `stream()` to `LlmClient` as the *only* primitive and derive the existing `complete()` from
it, so the non-streaming tests keep working. Reassemble tool calls into a `Map` keyed by
`tool_calls[].index`, never by array position or `id`. Downstream, expose **`POST
/api/conversations/:id/messages/stream`** carrying three named SSE events — `item` (a complete
`ConversationItem`, verbatim), `delta` (`{ itemId, text }`, only ever for an
`assistant_message`), and `done`. Consume it from the frontend with `fetch` + `ReadableStream`,
not `EventSource`. ADR 0002's claim that the item union streams "without changing the model"
holds, with exactly one amendment: an `assistant_message` has to be *opened* with `content: ""`
before its text exists.

---

# Part 1 — Upstream: OpenRouter's SSE

## 1.1 The framing

Verified identical across all five providers:

| | |
| --- | --- |
| Status / content-type | `200`, `text/event-stream` (`transfer-encoding: chunked`) |
| SSE fields used | **`data:` only.** No `event:`, no `id:`, no `retry:` |
| Line endings | **LF only** — not CRLF, on every provider |
| Comments | `: OPENROUTER PROCESSING` keep-alives, 0–3 per stream |
| Terminator | `data: [DONE]` then EOF |
| Correlation | `x-generation-id` response header, equal to the chunk `id` |

Every `data:` payload is single-line JSON — newlines inside content are JSON-escaped as `\n`,
so a multi-line `data:` frame never occurs in practice. That is a *fact about the payload*, not
a guarantee of the transport, and it does not excuse a hand-rolled parser: OpenRouter emits
comment lines, and a chunk boundary can split a `data:` line in half mid-flight. Either buffer
across reads and skip `:` lines (the pattern in OpenRouter's own streaming snippet), or use
[`eventsource-parser`](https://github.com/rexxars/eventsource-parser), which OpenRouter
recommends by name.

Gemini sent **zero** keep-alive comments in its capture, so the comment is not a reliable
heartbeat — don't build a "still alive" timeout on it.

## 1.2 The chunk shape

A content chunk, verbatim from the Bedrock capture:

```json
{"id":"gen-1785701116-JaiOCiCf0xWNyr2BV2Bs","object":"chat.completion.chunk","created":1785701116,
 "model":"anthropic/claude-sonnet-4.5","provider":"Amazon Bedrock",
 "choices":[{"index":0,"delta":{"content":"I'll read both the","role":"assistant"},
             "finish_reason":null,"native_finish_reason":null}]}
```

Two normalisations OpenRouter applies that plain OpenAI does not, both confirmed on all five
providers:

- **`role: "assistant"` is on *every* delta**, not just the first. OpenAI's Chat Completions
  sends `role` once. Don't use it to detect the start of a message.
- **The `content` key is always present**, as `null` on tool-call deltas and `""` on the
  terminal one — never absent. OpenAI omits the key. So `'content' in delta` is useless as a
  discriminator; test `typeof delta.content === 'string' && delta.content !== ''`.

`choices` always has exactly one element (`index: 0`) because we never send `n > 1`.

## 1.3 Tool-call delta reassembly

This is the part worth getting exactly right. A tool call arrives as fragments under
`choices[0].delta.tool_calls[]`, and the fragments fall into **two distinct shapes**:

**Opening fragment** — carries the identity, once per call:

```json
{"index":0,"id":"toolu_bdrk_019xdqhRTK2BKW2FranMU9Rw","type":"function",
 "function":{"name":"read_text_file","arguments":""}}
```

**Continuation fragment** — carries nothing but an argument slice:

```json
{"index":0,"function":{"arguments":"{\"path\": \"notes"}}
```

The rules, all verified:

1. **`index` is the identity. Key a `Map<number, PartialToolCall>` on it.** Array position is
   meaningless — a single delta may carry a fragment for any index, and the array is not a
   window onto the final list.
2. **`id`, `type` and `function.name` appear exactly once**, on the opening fragment, and never
   again. Code that reads `name` off the *last* fragment gets `undefined`. Merge with
   "first-write-wins per field", not "last-write-wins".
3. **`function.arguments` concatenates with `+=` in arrival order.** Nothing else accumulates.
4. **Empty-string argument fragments are normal.** Four of the five providers emitted a
   redundant `{"index":0,"function":{"arguments":""}}` immediately after the opener. Harmless
   under `+=`; a `if (args) args = frag` style merge would be fine too, but a truthiness guard
   that *skips* the field entirely is what breaks.
5. **Never `JSON.parse` the arguments until the stream ends.** Mistral fragmented
   `{"path": "reports/release-checklist.md"}` into **twelve** pieces:

   ```json
   ["{\"", "path", "\":", " \"", "re", "ports", "/re", "lease", "-check", "list", ".md", "\"}"]
   ```

   Every intermediate state is invalid JSON.

Chunk-count spread for the same two-tool prompt: Gemini 4 fragments, OpenAI/DeepSeek 6, Bedrock
10, Mistral 21. Same reassembly rules produced byte-identical results in all five.

Minimal correct merge:

```ts
const calls = new Map<number, { id?: string, name?: string, args: string }>()

for (const frag of delta.tool_calls ?? []) {
  const call = calls.get(frag.index) ?? { args: '' }
  call.id ??= frag.id
  call.name ??= frag.function?.name
  call.args += frag.function?.arguments ?? ''
  calls.set(frag.index, call)
}
```

Emit in ascending `index` order at the end; the `Map` preserves insertion order, which happens
to match, but sorting is free and doesn't depend on that.

### Parallel tool calls are the default, not an edge case

**All five providers returned two tool calls in a single completion** (`index: 0` and
`index: 1`) for a prompt naming two files. `parallel_tool_calls` defaults to `true` and the
current request sends no override.

That makes `// Parallel tool calls are out of scope` in `chat.service.ts:117` a comment about
*execution*, not about what arrives — the loop already receives parallel calls today and runs
them sequentially. Under streaming this becomes user-visible: two `tool_call` items render
before either `tool_result` does. Relevant to [#35](https://github.com/LouisLP/knime-agent-platform/issues/35).

Tool-call ids are unique per call even when the same tool is called twice — verified on Gemini,
which derives ids from the tool name (`tool_read_text_file_96GFTKmmZHPYY6yCXY7p`,
`tool_read_text_file_ObtYclc9SxorHKHeK3te`). So `toolCallId` stays safe as a `Map` key on the
frontend.

## 1.4 Finish reasons and the end of a stream

Verbatim terminal sequence (Bedrock):

```
data: {…,"choices":[{"index":0,"delta":{"content":"","role":"assistant"},"finish_reason":"tool_calls","native_finish_reason":"tool_use"}]}

data: {…,"service_tier":null,"choices":[{"index":0,"delta":{"content":"","role":"assistant"},"finish_reason":"tool_calls","native_finish_reason":"tool_use"}],"usage":{"prompt_tokens":675,"completion_tokens":127,"total_tokens":802,"cost":0.00393,…}}

data: [DONE]
```

Four things to take from that:

- **`finish_reason` sits on the choice, not on the delta.** OpenRouter's own tool-calling doc
  gets this wrong — its streaming snippet tests `data.choices[0].delta.finish_reason`, which is
  always `undefined`, so the branch that runs the tools never fires. **Do not copy that
  example.** (It is also wrong in a second way: it does `toolCalls.push(...delta.tool_calls)`,
  pushing raw fragments without merging by `index`.)
- **The terminal chunk arrives twice** — once plain, once repeated with `usage` attached — on
  every provider. Whatever you do on "finish" must be idempotent, or you emit the turn twice.
- **`native_finish_reason` is raw provider output and varies wildly**: `tool_use` (Bedrock),
  `STOP` (Google), `end_turn` (Bedrock, on a text turn), `completed` (OpenAI), `tool_calls`
  (DeepInfra, StreamLake). The normalised `finish_reason` was `tool_calls` on all five. Branch
  on `finish_reason`; log `native_finish_reason` and nothing more.
- **`usage` arrives whether or not you ask for it.** Sending `stream_options: {include_usage:
  true}` made no difference — verified by running the same prompt with and without it. It
  carries `cost` in USD per generation, which is a cheaper signal for `CreditsIndicator.vue`
  than polling the credits endpoint. Out of scope here; worth noting.

**Don't gate tool execution on `finish_reason === 'tool_calls'`.** Gate it on "did we
accumulate any calls". A truncated turn finishes with `length` while holding half-built
arguments; those arguments then fail `JSON.parse`, and `chat.service.ts` already has the right
answer for that — hand the parse failure back as a tool result so the model can retry.

## 1.5 Errors

Two shapes, split by whether any bytes have gone out:

**Before the stream starts** — a normal non-2xx JSON body, *not* SSE. Verified with a bad model
id:

```
HTTP/1.1 400
{"error":{"message":"not-a-real/model is not a valid model ID","code":400},"user_id":"user_…"}
```

So `OpenRouterClient`'s existing `!response.ok` → `readJson` → `describe` path is still exactly
right; it just has to run *before* anything tries to parse the body as an event stream. Check
`response.ok` first, and ideally the content-type too.

**Mid-stream** — HTTP 200 already sent, so the error rides in as a `data:` event with the error
at the top level alongside `choices`:

```
data: {"id":"cmpl-abc123",…,"error":{"code":"server_error","message":"Provider disconnected unexpectedly"},"choices":[{"index":0,"delta":{"content":""},"finish_reason":"error"}]}
```

The stream terminates after it. Map this to a `ProviderError` so the existing catch in
`sendMessage` turns it into an `error` conversation item — which, downstream, is just another
`item` event. Nothing special is needed.

I did not manage to provoke a genuine mid-stream error in the captures, so this shape is quoted
from the docs rather than observed. The pre-stream 400 is observed.

## 1.6 Cancellation, and the 60-second timeout

`AbortController` on the fetch cancels the stream. OpenRouter documents that this stops *billing*
on ~24 providers (OpenAI, Azure, Anthropic, Together, DeepSeek, …) and **does not** on ~32
others, where the model finishes generating and you pay for all of it.

Worth knowing which side we're on: **AWS Bedrock is on the unsupported list**, and the capture
shows `OPENROUTER_MODEL=anthropic/claude-sonnet-4.5` routing to `"provider":"Amazon Bedrock"`.
So a stop button would free the UI immediately but not the wallet. Google, Groq, Mistral and
Perplexity are also unsupported. Cancel anyway — it's still the right UX and the routing can
change under us — just don't sell it as a cost control.

More pressing: **`REQUEST_TIMEOUT_MS = 60_000` via `AbortSignal.timeout` is the wrong shape once
streaming exists.** It is a total-duration cap. A stream that is happily delivering tokens for
70 seconds — entirely normal for a multi-tool turn — would be killed mid-answer. It needs to
become an *idle* timeout: reset a timer on every chunk, abort only when nothing has arrived for
N seconds. Combine with a separate, shorter time-to-first-byte budget if you want fast failure
on a wedged provider.

## 1.7 Verdict on `OpenRouterClient` and `LlmClient`

The seam is fine; the method is the wrong shape. `complete()` returns a whole `LlmCompletion`,
and streaming needs the caller to see text before tool calls are known.

Recommended:

```ts
export type LlmStreamEvent
  = | { type: 'text', delta: string }
    | { type: 'tool_calls', calls: ChatToolCall[] }   // once, fully reassembled
    | { type: 'finish', reason: string | null, usage?: LlmUsage }

export interface LlmClient {
  readonly model: ModelId
  stream: (messages: ChatMessage[], tools: ChatTool[], signal?: AbortSignal) => AsyncIterable<LlmStreamEvent>
}
```

Then keep `complete()` as a free function that drains a `stream()` into today's
`LlmCompletion`. That is a dozen lines, and it means:

- `backend/src/testing/fakes.ts` gets **one** thing to fake, and the existing sync fakes can
  stay sync by yielding from an array;
- every existing `chat.service.test.ts` assertion about whole completions keeps passing;
- the orchestrator opts into streaming per call site rather than being rewritten.

Emitting `tool_calls` as one event at the end rather than incrementally is deliberate: a
half-built `arguments` string has no consumer. The UI cannot render a partial argument object,
and nothing can execute one. Streaming that fragmentation to the frontend would be protocol
surface with no reader.

Specific fixes:

- [ ] Key reassembly on `tool_calls[].index`; take `id`/`type`/`name` from the opening fragment
      only, `+=` the arguments.
- [ ] Read `finish_reason` from `choices[0]`, never from `delta`. Make the finish transition
      idempotent — it fires twice.
- [ ] Check `response.ok` before treating the body as SSE; keep the existing error path for the
      pre-stream case, add the top-level-`error`-in-a-chunk case for mid-stream.
- [ ] Replace the 60 s total timeout with an idle timeout plus an `AbortSignal` the caller owns.
- [ ] Skip `:` comment lines before `JSON.parse`, and buffer across chunk boundaries — or take
      `eventsource-parser`. `data: [DONE]` is not JSON either.
- [ ] Don't validate a *chunk* with `chatCompletionResponseSchema` — the shape is different
      (`delta`, not `message`) and per-chunk Zod on a token stream is real overhead. Validate
      the assembled result instead, where the existing schema already fits.

---

# Part 2 — Downstream: what the backend emits

## 2.1 The item union under streaming

Of the five item types, **four are complete the moment they exist**: `user_message` is known
before the model is even called, `tool_call` is only knowable once its arguments have finished
arriving, `tool_result` is atomic by nature, and `error` is a single record. Exactly one item
type has an interior: `assistant_message`.

So a delta protocol for all five types would be four-fifths dead weight — five open/patch/close
lifecycles where one is needed, and a frontend reducer that has to handle a partially-built
`tool_call` state no producer will ever emit.

The other end of the range — "emit whole items only, no text streaming" — is just ADR 0002 with
extra round trips. It removes the pause before the *first* item, which is real, but leaves the
long one: a 400-token final answer still lands all at once.

## 2.2 Recommended event shape

Three named SSE events. The `event:` name carries the envelope discriminator, `data` carries the
payload raw:

```
event: item
data: {"id":"itm_…","conversationId":"cnv_…","createdAt":"…","type":"tool_call","toolCallId":"toolu_…","toolName":"read_text_file","arguments":{"path":"notes.md"}}

event: item
data: {"id":"itm_…","conversationId":"cnv_…","createdAt":"…","type":"assistant_message","content":""}

event: delta
data: {"itemId":"itm_…","text":"I'll read both the"}

event: delta
data: {"itemId":"itm_…","text":" notes.md file"}

event: done
data: {"conversationId":"cnv_…"}
```

- **`item`** — a complete `ConversationItem`, serialised exactly as `POST /messages` serialises
  it today. No wrapper, no added fields. All five types use it.
- **`delta`** — `{ itemId, text }`, appended to the item with that id. Only ever emitted for an
  `assistant_message`, but the payload doesn't say so; the frontend reducer is "append `text` to
  the item with this id", which stays true if anything else ever grows.
- **`done`** — the turn is over. Distinguishes a finished turn from a dropped socket, which
  otherwise look identical to the client.

An `assistant_message` is emitted as an `item` with `content: ""` **when its first token
arrives**, then grown by `delta`s. `createItem` already stamps the id up front, so this costs
nothing.

Using `event:` names rather than a `{"kind":…}` wrapper avoids a second discriminator colliding
with the item's own `type` field, and keeps the item payload byte-identical to the non-streaming
endpoint — which is the whole point of ADR 0002's claim.

**No `id:` field, deliberately.** `id:` exists to drive `Last-Event-ID` resumption, which only
means anything with `EventSource`'s auto-reconnect, which we are not using (§2.5). Emitting ids
we can't honour on replay is worse than emitting none.

### Where errors go

They don't need an event type. ADR 0003 already makes an error a conversation item, so a failed
turn is an `item` event carrying an `error` item, followed by `done` — the stream ends
*successfully*. Only a genuinely broken socket is a transport error, and that is the absence of
`done`, which the client already has to detect.

## 2.3 Verdict on ADR 0002

> "emitting the same items one at a time over SSE changes the transport but not the model or the
> frontend's reducer"

Substantially correct, with two amendments:

1. **An `assistant_message` must be openable before its content exists.** `content: string`
   already permits `""`; nothing in the domain model changes. But the *invariant* changes — an
   item in the transcript may now be incomplete, and `AssistantMessage.vue` renders markdown
   through `marked` + DOMPurify, which will be re-run on every delta over a string ending
   mid-syntax. Worth measuring; a trailing unclosed ``` fence renders as a code block that snaps
   shut when the fence completes.
2. **The frontend reducer is not unchanged.** `chat.store.ts` documents "Items are stored
   exactly as the backend returned them — the store appends, it never rewrites", backed by a
   `shallowRef` whose comment says items are "replaced wholesale, never mutated in place".
   A `delta` event rewrites an existing item, so either that item becomes a `ref` of its own or
   every delta reallocates the array. Given deltas arrive at token rate, reallocating a growing
   array per token is the wrong default — the honest change is to let the in-flight assistant
   item be a separate reactive cell that is folded into `items` on `done`.

Neither invalidates the ADR's reasoning. Both belong in its reconciliation.

## 2.4 SSE through this Express setup

Verified by running `express@5.1` + `cors@2.8` with this repo's exact middleware stack
(`cors({ origin })`, `express.json({ limit: '1mb' })`) and hitting it with `curl -N`.

Headers to set, then `res.flushHeaders()`:

```ts
res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
res.setHeader('Cache-Control', 'no-cache, no-transform')
res.setHeader('Connection', 'keep-alive')
res.setHeader('X-Accel-Buffering', 'no')
res.flushHeaders()
```

Observed response, unmodified by anything in the stack:

```
HTTP/1.1 200 OK
Access-Control-Allow-Origin: http://localhost:5173
Vary: Origin
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Transfer-Encoding: chunked
```

**CORS is a non-issue.** `cors()` runs before the handler, so `Access-Control-Allow-Origin` is
on the flushed headers. The preflight for a JSON POST returns `204` with
`Access-Control-Allow-Methods` and `Access-Control-Allow-Headers: content-type`, unprompted.
No credentials are involved, so no `credentials: true` and no origin-echo subtlety. This holds
for the `fetch` approach; it would hold for `EventSource` too.

**No compression middleware is installed**, so nothing buffers today. `no-transform` and
`X-Accel-Buffering: no` are insurance against a proxy or a future `compression()` — the latter
would coalesce events into its own buffer and stall the stream until it flushes.

**`express.json()` is harmless** on the streaming route: it parses the request body before the
handler runs and touches nothing on the response.

### Two Express gotchas, both verified

**1. `req.on('close')` is not a disconnect signal on a POST.** It fired *immediately* on a POST
with a body while `curl` was still happily reading events and the handler went on writing two
more successfully. Use `res.on('close')` and treat `res.writableEnded === false` as "the client
left":

```ts
res.on('close', () => { if (!res.writableEnded) abortController.abort() })
```

Under a real mid-stream `curl` abort, `res.on('close')` fired with `writableEnded=false` and the
loop stopped on the next iteration — the correct behaviour.

**2. `next(error)` after `flushHeaders()` destroys the connection.** Confirmed: the request
reaches `errorHandler` with `headersSent === true`, and `errorHandler` in
`middleware/error-handler.ts` calls `res.status(...).json(...)` unconditionally. Express 5's
final handler then destroys the socket — `curl` exits 18 (partial transfer) with no error body.
Two fixes, both wanted:

- the streaming route must never `next(err)`; it emits an `error` **item** and `res.end()`s;
- `errorHandler` should grow a `if (res.headersSent) return next(error)` guard so a bug there
  can't silently truncate a stream.

### Timeouts and keep-alives

Node's defaults on this server: `requestTimeout: 300000`, `headersTimeout: 60000`,
`keepAliveTimeout: 5000`, `timeout: 0`. All of those govern *receiving* a request or reusing an
idle connection between requests; none caps how long a response may take, and `timeout: 0` means
no socket-inactivity kill. So Node will not sever a long turn.

Confirmed empirically: a stream that flushed its headers, wrote one event, then **said nothing
for 340 seconds** — past both `headersTimeout` (60 s) and `requestTimeout` (300 s) — was still
writable afterwards (`res.write()` returned `true`, `res.destroyed === false`), the late event
reached the client, and `curl` exited 0.

Server-side keep-alive comments (`: ping\n\n` every ~15 s) are therefore not needed for Node,
but are cheap insurance for any intermediary between the two. They are also the natural carrier
for a "still thinking" indicator, exactly as OpenRouter uses them.

`res.write()` returned `true` throughout — no backpressure at these sizes. It can still return
`false` on a slow client, and a correct writer awaits `'drain'` before continuing.

## 2.5 `EventSource` vs `fetch` + `ReadableStream`

**`EventSource` cannot POST.** Per the WHATWG spec it issues a GET and admits no request body
and no custom headers. Sending a message is a POST today, so `EventSource` forces one of:

- **POST then GET.** `POST /messages` returns `202` with a stream id, then
  `new EventSource('/streams/:id')`. Costs a round trip, requires the server to hold the turn's
  output addressable by id until a client attaches, and introduces a window where a turn is
  running with nobody listening. It also drags in `EventSource`'s auto-reconnect, which will
  silently re-request a stream that has already been consumed — so you now *need* `Last-Event-ID`
  replay, i.e. buffering the whole turn anyway.
- **GET-with-query-string.** Puts user message text in a URL. Length-limited and it lands in
  access logs. No.

**`fetch` + `ReadableStream`** POSTs directly, keeps the one-request shape the API already has,
and gives cancellation for free via `AbortController` — which is the same handle §1.6 wants
upstream, so a user pressing stop can propagate all the way to OpenRouter.

What it costs:

- ~40 lines of SSE parsing (buffer, split on `\n\n`, read `event:`/`data:` fields, skip `:`), or
  `eventsource-parser` as a dependency. The frontend already carries nine runtime deps, so one
  more is not a departure, but the hand-rolled version is genuinely small and the framing here
  is ours — we control both ends and can guarantee single-line `data:`.
- **No auto-reconnect.** For this app that is a feature: a re-fired turn would re-run tools.
- `fetch` rejects only when the request never completes, so a stream that dies mid-flight
  surfaces as the reader ending without a `done` event — which is precisely why `done` is in the
  protocol.

`ApiError` and `http.ts` stay as they are; the streaming call is a sibling of `request()`, not a
change to it, and `transportError` in the store already models "the request never landed".

## 2.6 Open questions this did not settle

- Whether `POST /messages` (non-streaming) stays. Keeping both costs one thin controller if
  `complete()` is derived from `stream()`; `server.test.ts` currently exercises the JSON one.
- Whether a `delta`-per-token is too chatty for `marked` + DOMPurify, or wants coalescing on a
  ~50 ms frame. Measure before deciding.
- Whether the in-flight assistant item lives in `items` or beside it (§2.3, amendment 2).

## Sources

- [OpenRouter — Streaming](https://openrouter.ai/docs/api-reference/streaming) (keep-alive
  comments, `[DONE]`, mid-stream error envelope, cancellation and the per-provider billing list)
- [OpenRouter — Tool & function calling](https://openrouter.ai/docs/guides/features/tool-calling)
  (`parallel_tool_calls`, `tool_choice`; its streaming snippet is wrong — see §1.4)
- [OpenAI — Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [WHATWG HTML — Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
  (field grammar, comment lines, dispatch on blank line, `Last-Event-ID`, `EventSource`'s
  GET-only constraint)
- Live captures against `openrouter.ai/api/v1`, 2026-08-02, with two tools attached:
  `anthropic/claude-sonnet-4.5` (Amazon Bedrock), `openai/gpt-4.1-mini` (OpenAI),
  `google/gemini-2.5-flash` (Google), `mistralai/mistral-small-3.2-24b-instruct` (DeepInfra),
  `deepseek/deepseek-chat` (StreamLake)
- Local spikes against `express@5.1.0` + `cors@2.8.5` as installed in `backend/`
