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
    lede: 'Four to six hours, graded on process rather than polish. So the decisions that would be '
      + 'expensive to reverse got made first, and written down somewhere that would hold me to them.',
    points: [
      'Every ticket is a GitHub issue; a map issue carries the constraints and the things still '
      + 'unspecified. It is the first thing I re-read when picking work back up.',
      'Conventions came from skills files — Vue, TypeScript, CSS, code organisation, semantic HTML — '
      + 'so style decisions were made once, up front, instead of per file.',
      'Libraries were chosen to spend the timebox on the agentic loop, not on plumbing: Zod for '
      + 'boot-time config validation, Reka UI for headless accessible behaviour, the official MCP '
      + 'SDK for the stdio transport, Shiki for this pane.',
      'Kabuki — the design system from my portfolio — came in whole. Plain CSS, semantic tokens only, '
      + 'dark-first via light-dark(). No part of the budget went into inventing a look.',
      'One layering idea on both sides: dependencies point inward, every seam is an interface, and a '
      + 'single file does the wiring.',
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
      + 'them faithfully and to be honest about what it cannot know yet.',
    points: [
      'types/conversation.ts mirrors the backend\'s domain union field for field, so the API response '
      + 'is rendered directly with no mapping layer to drift. The price is a manual copy across, '
      + 'which one shared package would solve in a longer-lived codebase.',
      'ConversationItemView is the only place that switches on the discriminant — a v-if chain rather '
      + 'than a component lookup table, because that is what keeps each child\'s props type-checked '
      + 'against its own member of the union.',
      'What the chat shows: the tool name always, its arguments behind a collapsible, and the result '
      + 'indented underneath, linked back by aria-describedby. Both sides derive the element id from '
      + 'toolCallId, so the association falls out of the data model.',
      'Two failures, shown differently on purpose. An error item happened server-side and belongs in '
      + 'the transcript where it occurred; a transport failure never landed, so it is a strip above '
      + 'the composer with Retry — never a transcript item.',
      'Responses are not streamed, so mid-turn the pane cannot say which tool is running. It echoes '
      + 'the user\'s message immediately, disables the composer, and runs a role="status" indicator '
      + 'rather than inventing progress it does not have.',
      'Kabuki\'s red belongs to failure alone — kaki is the primary action, seiji the secondary one — '
      + 'so nothing red in this UI is ever something you can press.',
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
      + 'that actually transfers — the layering — framework-agnostic.',
    points: [
      'I am not experienced enough in Go to be fast in it, and Java would have cost a refresher. Inside '
      + 'a four-hour budget that trade buys hours for the orchestration loop, which is the thing '
      + 'being evaluated. It is recorded in ADR 0001 as a deviation, not smoothed over.',
      'Node 22 runs the TypeScript directly via native type stripping: no build step, no tsx. '
      + 'erasableSyntaxOnly turns non-erasable syntax into a type error rather than a SyntaxError at boot.',
      'api → service → repository → domain, dependencies pointing inward, every cross-layer '
      + 'collaborator behind an interface — LlmClient, ToolProvider, ConversationRepository. '
      + 'container.ts is the only file that constructs anything.',
      'That shape maps onto Spring or a Go service unchanged, which is the honest answer to "but it '
      + 'is not Go": the language is the part I swapped, not the design.',
      'Three UUID-shaped ids flow through the same call sites in the orchestrator. Branding them makes '
      + 'mixing them a compile error and costs nothing at runtime — they are plain strings in JSON.',
      'I am a frontend engineer first, and the backend reflects that: careful and conventional rather '
      + 'than clever. The seams are where I spent the thinking.',
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
    lede: 'OpenRouter speaks the OpenAI chat-completions shape, so the client is fetch plus Zod — no '
      + 'vendor SDK, and no provider abstraction beyond the one interface the service depends on.',
    points: [
      'The model is anthropic/claude-sonnet-4.5, read from OPENROUTER_MODEL and never hardcoded. '
      + 'Swapping to a different vendor\'s model is an env change.',
      'A bare model name instead of a vendor/model slug is the likeliest way to misconfigure this, and '
      + 'the provider only reports it as a 404 on the first real request — so the shape is a template '
      + 'literal type and a regex that fails at boot instead.',
      'Assumption made explicit: one completion per call. The wire response carries a choices array, '
      + 'but we never ask for more than one, so it is unwrapped at the boundary and no caller needs '
      + 'an index or a non-null assertion.',
      'Every failure mode — unreachable host, timeout, non-2xx, unparseable body, unexpected shape — '
      + 'leaves as a ProviderError. Including a 200 that carries an error object instead of a '
      + 'completion, which this API does.',
      'A 60-second timeout, because a hung provider call would otherwise pin a request open forever.',
      'Tested against the real model end to end, not only against fakes: docs/smoke-test.md records a '
      + 'full run — question in, tools/list, two tool rounds over the sandbox, answer out.',
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
      + 'that ships with the repo — so a fresh clone has something real for the model to read.',
    points: [
      'stdio over HTTP: no second service to start, no port to coordinate, and the sandbox root is an '
      + 'argv element rather than a URL. The server package is pinned, because it uses CalVer and its '
      + 'tool set has changed across releases.',
      'MCP_ARGS is a JSON array, not a space-separated string: the transport spawns with shell: false, '
      + 'so a sandbox path containing a space has to survive as one argv element.',
      'Tools are not hardcoded. The backend calls tools/list at boot and passes whatever it finds to '
      + 'the model, so swapping in a different MCP server needs no code change. Thirteen are '
      + 'discovered; read_file is withheld as a deprecated alias of read_text_file — offering both '
      + 'invites the wrong pick and costs tokens on every request.',
      'One session, opened at boot and reused, with discovery cached and a clean close on SIGINT and '
      + 'SIGTERM. Startup fails loudly if the server is unreachable — the right trade for a '
      + 'single-instance app.',
      'The loop is the whole exercise: project the conversation into provider messages, call the model '
      + 'with the discovered tools, and either finish or run the calls and go round again. Every '
      + 'step is recorded as a conversation item, which is why the UI can show tool activity at all.',
      'Bounded by MAX_TOOL_ITERATIONS. Running out appends an error item rather than looping forever, '
      + 'and a tool that fails comes back as a result with isError so the model can recover itself.',
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
    lede: 'The brief rules out auth, persistence, multiple users and providers, UI configuration, '
      + 'streaming, parallel tool calls, human approval, uploads, deployment and broad test coverage. '
      + 'Three of those left a mark worth talking about.',
    points: [
      'Non-streaming is the one with a real user-facing cost: nothing renders until the whole turn '
      + 'finishes, so a multi-round tool loop looks like a long pause. The UI covers it with a '
      + 'pending state, and the item union is already the unit of streaming if it is revisited.',
      'Errors are conversation items, not failed requests. A provider outage or a blown iteration '
      + 'budget still returns 201 with an error item, so the transcript the user already has '
      + 'survives. Only malformed requests are non-2xx.',
      'A failing tool is neither of those — it comes back as a tool_result with isError, fed to the '
      + 'model so it can retry with a better path instead of the turn dying there.',
      'Tests are narrow on purpose and say so: the service loop, the message mapper and the API '
      + 'contract, against hand-rolled fakes. No coverage target, and one end-to-end smoke run '
      + 'against the real model and MCP server to prove the wiring.',
      'Not a Go or Java backend. That is the deviation I would put first on the table, and ADR 0001 '
      + 'exists so the reasoning is reviewable rather than assumed.',
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
    lede: 'In rough order of what the current design is already shaped for — each of these is a seam '
      + 'that exists, not a rewrite.',
    points: [
      'Stream the same items over SSE. The transport changes; the domain model and the frontend\'s '
      + 'append-only reducer do not.',
      'Persistence: ConversationRepository is already the seam. A real store is one new class plus one '
      + 'line in the composition root, and it would also fix the one transport failure retrying '
      + 'cannot — a backend restart invalidating the id the tab is holding.',
      'Parallel tool calls. The provider hands back an array and the loop deliberately runs it in '
      + 'order; concurrency here is a scheduling change, not a model change.',
      'Human approval before a tool runs. The tool_call item is already the natural pause point — it '
      + 'exists before the call is executed.',
      'Cancelling a turn in flight. The iteration cap is a budget, not a stop button.',
      'Markdown rendering for assistant text, with sanitisation, and the item union moved into a '
      + 'shared workspace package so the frontend mirror cannot drift.',
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
