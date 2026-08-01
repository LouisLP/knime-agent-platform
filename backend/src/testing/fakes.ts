import type { Env } from '../config/env.ts'
import type { CreditStatus } from '../domain/credits.ts'
import type { CreditsReader } from '../service/llm/credits.client.ts'
import type { LlmClient, LlmCompletion } from '../service/llm/openrouter.client.ts'
import type { ChatMessage, ChatTool, ChatToolCall } from '../service/llm/openrouter.types.ts'
import type { ToolExecutionResult, ToolProvider } from '../service/mcp/mcp.client.ts'

/**
 * Hand-rolled stand-ins for the two outbound dependencies, shared by the
 * service and API tests. They exist because `LlmClient` and `ToolProvider` are
 * interfaces on purpose (see `container.ts`) — the loop is fully exercisable
 * without a network, a provider key or a spawned MCP server.
 *
 * Not a `.test.ts` file and not under `test/`, so Node's runner ignores it.
 */

export const testEnv = {
  PORT: 0,
  CORS_ORIGIN: 'http://localhost:5173',
  OPENROUTER_API_KEY: 'test-key',
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  OPENROUTER_MODEL: 'anthropic/claude-sonnet-4.5',
  MAX_TOOL_ITERATIONS: 5,
  MCP_TRANSPORT: 'stdio',
  MCP_COMMAND: 'true',
  MCP_ARGS: [],
  MCP_SANDBOX_DIR: '/tmp/unused-sandbox',
} satisfies Env

/** A completion with the fields a test does not care about filled in. */
export function completion(partial: Partial<LlmCompletion> = {}): LlmCompletion {
  return {
    content: null,
    toolCalls: [],
    finishReason: 'stop',
    ...partial,
  }
}

export function assistantSays(content: string): LlmCompletion {
  return completion({ content, finishReason: 'stop' })
}

export function requestsTool(
  id: string,
  name: string,
  args: unknown = {},
): LlmCompletion {
  return completion({
    finishReason: 'tool_calls',
    toolCalls: [toolCall(id, name, args)],
  })
}

export function toolCall(id: string, name: string, args: unknown = {}): ChatToolCall {
  return {
    id,
    type: 'function',
    function: {
      name,
      // A string, like the wire format: the orchestrator owns the parsing, so
      // tests that pass raw text can exercise the malformed-arguments path.
      arguments: typeof args === 'string' ? args : JSON.stringify(args),
    },
  }
}

/**
 * Replays a fixed script of completions, one per call, and records the
 * messages it was handed so a test can assert on what the model actually saw.
 * Running past the end of the script throws rather than looping forever —
 * an over-eager loop should fail loudly, not hang.
 */
export class ScriptedLlmClient implements LlmClient {
  readonly model = testEnv.OPENROUTER_MODEL
  /** One entry per `complete()` call, in order. */
  readonly calls: ChatMessage[][] = []
  readonly toolsSeen: ChatTool[][] = []
  readonly #script: (LlmCompletion | Error)[]

  constructor(script: (LlmCompletion | Error)[]) {
    this.#script = [...script]
  }

  get callCount(): number {
    return this.calls.length
  }

  /** The messages handed to the nth call (0-based). */
  messagesAt(index: number): ChatMessage[] {
    const messages = this.calls[index]
    if (!messages)
      throw new Error(`The model was never called ${index + 1} time(s)`)

    return messages
  }

  complete(messages: ChatMessage[], tools: ChatTool[]): Promise<LlmCompletion> {
    this.calls.push(messages)
    this.toolsSeen.push(tools)

    const next = this.#script.shift()
    if (!next)
      throw new Error(`Unscripted model call #${this.calls.length}`)

    if (next instanceof Error)
      return Promise.reject(next)

    return Promise.resolve(next)
  }
}

/** Always answers with the same text and never asks for a tool. */
export class StaticLlmClient implements LlmClient {
  readonly model = testEnv.OPENROUTER_MODEL
  readonly calls: ChatMessage[][] = []
  readonly #content: string

  constructor(content = 'Hello from the fake model.') {
    this.#content = content
  }

  complete(messages: ChatMessage[]): Promise<LlmCompletion> {
    this.calls.push(messages)
    return Promise.resolve(assistantSays(this.#content))
  }
}

/** Reports fixed spend figures, or fails, without touching the provider. */
export class FakeCreditsReader implements CreditsReader {
  readonly #result: CreditStatus | Error

  constructor(result: CreditStatus | Error = {
    usage: 2.5,
    limit: 10,
    remaining: 7.5,
    scope: 'key',
  }) {
    this.#result = result
  }

  read(): Promise<CreditStatus> {
    return this.#result instanceof Error
      ? Promise.reject(this.#result)
      : Promise.resolve(this.#result)
  }
}

export interface FakeToolProviderOptions {
  tools?: ChatTool[]
  /** Keyed by tool name; anything unlisted returns a generic success. */
  handlers?: Record<string, (args: unknown) => ToolExecutionResult>
  /** Thrown from `listTools()`, standing in for a dead MCP session. */
  listToolsError?: Error
  /** Thrown from `callTool()` — the real client only does this when unconnected. */
  callToolError?: Error
}

export class FakeToolProvider implements ToolProvider {
  /** One entry per `callTool()`, in order. */
  readonly calls: { name: string, args: unknown }[] = []
  readonly #options: FakeToolProviderOptions

  constructor(options: FakeToolProviderOptions = {}) {
    this.#options = options
  }

  connect(): Promise<void> {
    return Promise.resolve()
  }

  close(): Promise<void> {
    return Promise.resolve()
  }

  listTools(): Promise<ChatTool[]> {
    if (this.#options.listToolsError)
      return Promise.reject(this.#options.listToolsError)

    return Promise.resolve(this.#options.tools ?? [])
  }

  callTool(name: string, args: unknown): Promise<ToolExecutionResult> {
    this.calls.push({ name, args })

    if (this.#options.callToolError)
      return Promise.reject(this.#options.callToolError)

    const handler = this.#options.handlers?.[name]
    return Promise.resolve(
      handler?.(args) ?? { content: `result of ${name}`, isError: false },
    )
  }
}

export function tool(name: string, description = `the ${name} tool`): ChatTool {
  return {
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties: {} } },
  }
}
