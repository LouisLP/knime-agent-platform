import type { ExcerptLanguage } from './highlight'

/**
 * The walkthrough content: one slide per decision worth defending out loud,
 * not a tour of the codebase.
 *
 * Excerpts are pasted by hand rather than imported with `?raw`. That is the
 * point of them — an excerpt is an edited quote, trimmed to the four lines that
 * carry the decision, and a live import would drag in the imports, the types
 * and the error handling that make the file work but make the slide unreadable.
 * The cost is that a rewrite of the quoted code leaves the quote stale, so each
 * one names its source file.
 */
export interface CodeExcerpt {
  /** Repository path the excerpt was quoted from. */
  source: string
  lang: ExcerptLanguage
  code: string
}

export interface DecisionSlide {
  /** Also the fragment id, so a slide can be linked to directly. */
  id: string
  /** The requirement this slide answers. */
  kicker: string
  title: string
  lede: string
  points: string[]
  excerpts: CodeExcerpt[]
}

export const decisionSlides: DecisionSlide[] = [
  {
    id: 'pre-considerations',
    kicker: 'Pre-considerations',
    title: 'What was settled before the first commit',
    lede: 'Four to six hours, graded on process rather than polish. So I made the expensive-to-reverse '
      + 'decisions first and wrote them down somewhere that would hold me to them.',
    points: [
      'Every ticket is a GitHub issue, with one map issue carrying the constraints and the open '
      + 'questions. It is the first thing I re-read when picking the work back up.',
      'Conventions came from skills files (Vue, TypeScript, CSS, semantic HTML), so I made those '
      + 'style calls once up front instead of per file.',
      'Libraries were picked so the timebox went on the agentic loop rather than plumbing: Zod, '
      + 'Reka UI, the official MCP SDK, Shiki for this pane.',
      'Kabuki, the design system from my portfolio, came in whole. None of the budget went into '
      + 'inventing a look.',
    ],
    excerpts: [
      {
        source: 'Issue #1 — Map: ship the KNIME agentic chat vertical slice',
        lang: 'markdown',
        code: `Settled before charting:

- **Backend**: Node 22 + TypeScript on native type stripping
  (no build step, \`erasableSyntaxOnly\`). Stated deviation from
  the brief's Go/Java preference.
- **Model**: \`anthropic/claude-sonnet-4.5\`, env-configurable
  via \`OPENROUTER_MODEL\`.
- **MCP**: official filesystem server over **stdio**, rooted at
  a committed \`sandbox/\` dir with seeded files.
- **Frontend**: Vue 3 + Reka UI (headless) styled with the
  existing **Kabuki** design system — plain CSS, \`light-dark()\`,
  dark-first, semantic tokens only.
- **Walkthrough**: hand-pasted markdown excerpts highlighted by
  Shiki. **Built last** — the graded core never waits on it.`,
      },
    ],
  },

  {
    id: 'frontend',
    kicker: 'Frontend',
    title: 'One union, switched on in one place',
    lede: 'The backend returns five kinds of conversation item. The frontend\'s whole job is to render '
      + 'them faithfully and stay honest about what it cannot know yet.',
    points: [
      'types/conversation.ts mirrors the backend union field for field, so responses render with no '
      + 'mapping layer in between. The price is a manual copy across (a shared package would fix that '
      + 'in a longer-lived codebase).',
      'ConversationItemView is the only place that switches on the discriminant. It is a v-if chain '
      + 'rather than a lookup table, because that is what keeps each child\'s props type-checked '
      + 'against its own member of the union.',
      'A tool call shows its name, its arguments behind a collapsible, and its result indented '
      + 'underneath. Both sides derive the element id from toolCallId, so the aria-describedby link '
      + 'falls out of the data model.',
      'Two failures, deliberately shown differently. An error item happened server-side and belongs in '
      + 'the transcript; a transport failure never landed, so it sits above the composer with a Retry '
      + 'button instead.',
      'Nothing is streamed, so mid-turn the pane genuinely cannot say which tool is running. It echoes '
      + 'your message, disables the composer, and shows a status indicator rather than inventing '
      + 'progress it does not have.',
      'Kabuki\'s red belongs to failure alone (kaki is the primary action, seiji the secondary), so '
      + 'nothing red here is ever something you can press.',
    ],
    excerpts: [
      {
        source: 'frontend/src/components/chat/ConversationItemView.vue',
        lang: 'vue',
        code: `<template>
  <UserMessage
    v-if="item.type === 'user_message'"
    :content="item.content"
  />

  <AssistantMessage
    v-else-if="item.type === 'assistant_message'"
    :content="item.content"
  />

  <ToolCallCard
    v-else-if="item.type === 'tool_call'"
    :id="toolCallElementId(item.toolCallId)"
    :tool-name="item.toolName"
    :args="item.arguments"
  />

  <ToolResultCard
    v-else-if="item.type === 'tool_result'"
    :tool-name="item.toolName"
    :content="item.content"
    :is-error="item.isError"
    :linked-call-element-id="linkedCallElementId"
  />

  <ErrorNotice v-else :code="item.code" :message="item.message" />
</template>`,
      },
      {
        source: 'frontend/src/styles/tokens/semantic.css',
        lang: 'css',
        code: `/* Danger owns aka outright — nothing interactive uses that hue, so red in
   the UI always means a failure and never a button you could press. */
--color-danger-default: light-dark(var(--aka-600), var(--aka-500));
--color-danger-border: light-dark(var(--aka-300), var(--aka-800));
--color-danger-subtle-bg: light-dark(var(--aka-50), var(--aka-950));
--color-danger-subtle-fg: light-dark(var(--aka-800), var(--aka-300));`,
      },
    ],
  },

  {
    id: 'backend',
    kicker: 'Backend',
    title: 'Node, layered, and honest about the trade',
    lede: 'The brief prefers Go or Java. I used Node and TypeScript, wrote down why, and kept the part '
      + 'that actually transfers (the layering) framework-agnostic.',
    points: [
      'I am not fast enough in Go, and Java would have cost me a refresher. Inside a four-hour budget '
      + 'that trade buys hours for the orchestration loop, which is the thing being evaluated. ADR '
      + '0001 records it as a deviation rather than smoothing it over.',
      'Node 22 runs the TypeScript directly via native type stripping, so there is no build step and '
      + 'no tsx. erasableSyntaxOnly makes non-erasable syntax a type error instead of a boot-time crash.',
      'api → service → repository → domain, dependencies pointing inward, every cross-layer '
      + 'collaborator behind an interface. container.ts is the only file that constructs anything, and '
      + 'that shape maps onto Spring or a Go service unchanged.',
      'Three UUID-shaped ids meet in the orchestrator, so branding them makes mixing them a compile '
      + 'error. Costs nothing at runtime (they are plain strings in JSON).',
      'I am a frontend engineer first and the backend shows it: conventional rather than clever. The '
      + 'seams are where I spent the thinking.',
    ],
    excerpts: [
      {
        source: 'backend/src/container.ts',
        lang: 'typescript',
        code: `/**
 * Composition root. Every dependency is constructed here and injected downward,
 * so each layer stays testable with hand-rolled fakes.
 */
export function createContainer(env: Env): Container {
  const conversations = new InMemoryConversationRepository()
  const llm = new OpenRouterClient(env)
  const toolProvider = new McpToolProvider(env)
  const chatService = new ChatService(conversations, llm, toolProvider, env)

  return {
    chatController: new ChatController(chatService),
    toolProvider,
  }
}`,
      },
      {
        source: 'backend/src/domain/brand.ts',
        lang: 'typescript',
        code: `declare const brand: unique symbol

/**
 * Compile-time-only nominal typing. The symbol is never emitted, so branded
 * values are plain strings at runtime and serialise to JSON unchanged.
 */
export type Brand<T, B extends string> = T & { readonly [brand]: B }`,
      },
    ],
  },

  {
    id: 'ai-provider',
    kicker: 'AI provider',
    title: 'OpenRouter, and the assumptions underneath it',
    lede: 'OpenRouter speaks the OpenAI chat-completions shape, so the client is just fetch plus Zod. '
      + 'No vendor SDK, and no abstraction beyond the one interface the service depends on.',
    points: [
      'The model is anthropic/claude-sonnet-4.5, read from OPENROUTER_MODEL and never hardcoded, so '
      + 'switching vendors is an env change.',
      'Passing a bare model name instead of a vendor/model slug is the easiest way to misconfigure '
      + 'this, and OpenRouter only tells you with a 404 on the first real request. A template literal '
      + 'type and a regex catch it at boot instead.',
      'One completion per call, stated outright. The wire response carries a choices array but we '
      + 'never ask for more than one, so it gets unwrapped at the boundary and no caller needs an index.',
      'Every failure mode leaves as a ProviderError, including a 200 that carries an error object '
      + 'instead of a completion (which this API does). A 60-second timeout stops a hung call pinning '
      + 'a request open forever.',
      'Tested against the real model end to end, not just fakes. docs/smoke-test.md records a full '
      + 'run: question in, tools/list, two tool rounds over the sandbox, answer out.',
    ],
    excerpts: [
      {
        source: 'backend/src/config/env.ts',
        lang: 'typescript',
        code: `/**
 * OpenRouter routes on a \`vendor/model\` slug — \`anthropic/claude-sonnet-4.5\`,
 * \`openai/gpt-4o\`. A bare model name is the most likely way to misconfigure
 * this, and the provider only reports it as a 404 on the first real request.
 */
export type ModelId = \`\${string}/\${string}\`

const modelIdSchema = z.string()
  .regex(/^[^/\\s]+\\/\\S+$/, 'must be a "vendor/model" slug')
  .transform(value => value as ModelId)`,
      },
      {
        source: 'backend/src/service/llm/openrouter.client.ts',
        lang: 'typescript',
        code: `if (!response.ok)
  throw new ProviderError(\`OpenRouter returned \${response.status}\`)

// A 200 can still carry an upstream failure instead of a completion.
const asError = chatCompletionErrorSchema.safeParse(payload)
if (asError.success)
  throw new ProviderError(\`OpenRouter reported: \${asError.data.error.message}\`)

const parsed = chatCompletionResponseSchema.safeParse(payload)
if (!parsed.success)
  throw new ProviderError(\`OpenRouter response \${summariseIssues(parsed.error)}\`)

// One completion per call, so the \`choices\` array is unwrapped here.
const choice = parsed.data.choices[0]!`,
      },
    ],
  },

  {
    id: 'mcp-integration',
    kicker: 'MCP integration',
    title: 'The filesystem server, over stdio, on a committed sandbox',
    lede: 'The official filesystem MCP server, launched as a child process and rooted at a directory '
      + 'that ships with the repo, so a fresh clone has something real for the model to read.',
    points: [
      'stdio rather than HTTP: no second service to start and no port to coordinate. The package is '
      + 'pinned, since it uses CalVer and its tool set has changed across releases.',
      'MCP_ARGS is a JSON array rather than a space-separated string, because the transport spawns '
      + 'with shell: false and a sandbox path containing a space has to survive as one argv element.',
      'Tools are discovered, not hardcoded. The backend calls tools/list at boot and hands the model '
      + 'whatever comes back, so swapping in a different server needs no code change. read_file is the '
      + 'one exception, withheld as a deprecated alias that just invites the wrong pick.',
      'One session, opened at boot and reused, discovery cached, closed cleanly on SIGINT and SIGTERM. '
      + 'Startup fails loudly if the server is unreachable, which is the right trade for a '
      + 'single-instance app.',
      'The loop is the whole exercise: project the conversation into messages, call the model with the '
      + 'discovered tools, then either finish or run the calls and go round again. Every step is '
      + 'recorded as an item, which is why the UI can show tool activity at all.',
      'MAX_TOOL_ITERATIONS bounds it. Running out appends an error item instead of looping forever, '
      + 'and a failing tool comes back with isError so the model gets a chance to recover on its own.',
    ],
    excerpts: [
      {
        source: 'backend/src/service/mcp/mcp.client.ts',
        lang: 'typescript',
        code: `export interface ToolProvider {
  connect: () => Promise<void>
  close: () => Promise<void>
  /** MCP tools translated into the provider's function-calling schema. */
  listTools: () => Promise<ChatTool[]>
  callTool: (name: string, args: unknown) => Promise<ToolExecutionResult>
}

/**
 * Tools withheld from the model. \`read_file\` is a deprecated alias whose
 * handler is literally \`read_text_file\`'s — offering both invites the wrong
 * pick and costs tokens on every request.
 */
const HIDDEN_TOOLS = new Set(['read_file'])`,
      },
      {
        source: 'backend/src/service/chat.service.ts',
        lang: 'typescript',
        code: `const availableTools = await this.#tools.listTools()

for (let iteration = 0; iteration < this.#maxToolIterations; iteration++) {
  const messages = toChatMessages(conversation.items, SYSTEM_PROMPT)
  const completion = await this.#llm.complete(messages, availableTools)

  if (completion.toolCalls.length === 0) {
    this.#record(/* assistant_message */)
    return
  }

  // Parallel tool calls are out of scope, so run them in order.
  for (const call of completion.toolCalls)
    await this.#runToolCall(conversation.id, turnItems, call)
}`,
      },
    ],
  },

  {
    id: 'out-of-scope',
    kicker: 'Future considerations',
    title: 'What I left out, and why each one is a choice',
    lede: 'The brief rules out auth, persistence, streaming, parallel tool calls, deployment and broad '
      + 'test coverage, among others. A few of those left a mark worth talking about.',
    points: [
      'Non-streaming is the one with a real user-facing cost: nothing renders until the turn finishes, '
      + 'so a multi-round tool loop looks like a long pause. The UI covers it with a pending state.',
      'Errors are conversation items rather than failed requests. A provider outage still returns 201 '
      + 'with an error item, so the transcript the user already has survives. Only malformed requests '
      + 'get a non-2xx.',
      'A failing tool is neither of those. It comes back as a tool_result with isError and goes '
      + 'straight to the model, so it can retry with a better path instead of the turn dying there.',
      'Tests are narrow on purpose: the service loop, the message mapper and the API contract, against '
      + 'hand-rolled fakes. No coverage target, plus one end-to-end smoke run to prove the wiring.',
    ],
    excerpts: [
      {
        source: 'docs/adr/0002-turn-shaped-responses.md',
        lang: 'markdown',
        code: `## Consequences

- The transport stays plain JSON request/response: no SSE, no
  WebSocket, no reconnection or partial-item handling.
- Tool activity is still visible, because \`tool_call\` and
  \`tool_result\` are first-class items linked by \`toolCallId\` —
  the indicator falls out of the data model rather than needing
  a side channel.
- The cost is latency: nothing renders until the whole turn
  finishes, so a multi-round tool loop looks like a long pause.
- The item union is the unit of streaming if this is ever
  revisited — emitting the same items one at a time over SSE
  changes the transport but not the model or the frontend's
  reducer.`,
      },
    ],
  },

  {
    id: 'next',
    kicker: 'Future considerations',
    title: 'What the next few hours would buy',
    lede: 'Roughly in the order the current design is already shaped for. Each one is a seam that '
      + 'exists rather than a rewrite.',
    points: [
      'Stream the same items over SSE. The transport changes, the domain model and the frontend\'s '
      + 'append-only reducer do not.',
      'Persistence, where ConversationRepository is already the seam: one new class plus one line in '
      + 'the composition root. It would also fix the one transport failure retrying cannot, which is a '
      + 'backend restart invalidating the id your tab is holding.',
      'Parallel tool calls. The provider hands back an array and the loop deliberately runs it in '
      + 'order, so concurrency is a scheduling change rather than a model change.',
      'Human approval before a tool runs, since the tool_call item already exists as the natural '
      + 'pause point. Cancelling a turn in flight, too (the iteration cap is a budget, not a stop button).',
      'Markdown rendering for assistant text, and the item union moved into a shared package so the '
      + 'frontend mirror cannot drift.',
    ],
    excerpts: [
      {
        source: 'backend/src/repository/conversation.repository.ts',
        lang: 'typescript',
        code: `/**
 * Persistence seam. Storage is out of scope for the exercise, so the only
 * implementation is in-memory — but the service layer depends on this interface
 * so swapping in a real store stays a one-file change.
 */
export interface ConversationRepository {
  create: () => Conversation
  findById: (id: ConversationId) => Conversation | undefined
  /** Throws \`NotFoundError\` instead of returning undefined. */
  getById: (id: ConversationId) => Conversation
  appendItems: (id: ConversationId, items: ConversationItem[]) => Conversation
}`,
      },
    ],
  },
]

/** Every excerpt on every slide, in order — the highlighter's one input. */
export const slideExcerpts: readonly CodeExcerpt[] = decisionSlides.flatMap(slide => slide.excerpts)
