import type { Env, ModelId } from '../../config/env.ts'
import type {
  ChatCompletionRequest,
  ChatMessage,
  ChatTool,
  ChatToolCall,
} from './openrouter.types.ts'
import { ProviderError } from '../../domain/errors.ts'
import { chatCompletionErrorSchema, chatCompletionResponseSchema } from './openrouter.types.ts'

/** A hung provider call would otherwise pin a request open indefinitely. */
const REQUEST_TIMEOUT_MS = 60_000

/** How much of a provider error body we quote back in our own message. */
const DETAIL_LIMIT = 300

/**
 * One model turn, flattened to the parts the orchestrator acts on. The wire
 * response carries a `choices` array, but we never ask for more than one, so
 * unwrapping it here spares every caller an index and a non-null assertion.
 */
export interface LlmCompletion {
  content: string | null
  toolCalls: ChatToolCall[]
  finishReason: string | null
}

export interface LlmClient {
  readonly model: ModelId
  complete: (messages: ChatMessage[], tools: ChatTool[]) => Promise<LlmCompletion>
}

/**
 * OpenAI-compatible client pointed at OpenRouter: non-streaming, one response
 * per call, no provider abstraction beyond `LlmClient`.
 *
 * Every failure mode — unreachable host, timeout, non-2xx, unparseable body,
 * unexpected shape — leaves here as a `ProviderError`, so callers handle one
 * error type and the API layer already knows how to render it.
 */
export class OpenRouterClient implements LlmClient {
  readonly #apiKey: string
  readonly #baseUrl: string
  readonly model: ModelId

  constructor(env: Pick<Env, 'OPENROUTER_API_KEY' | 'OPENROUTER_BASE_URL' | 'OPENROUTER_MODEL'>) {
    this.#apiKey = env.OPENROUTER_API_KEY
    this.#baseUrl = env.OPENROUTER_BASE_URL.replace(/\/$/, '')
    this.model = env.OPENROUTER_MODEL
  }

  async complete(messages: ChatMessage[], tools: ChatTool[]): Promise<LlmCompletion> {
    const body: ChatCompletionRequest = {
      model: this.model,
      messages,
      ...(tools.length > 0 ? { tools, tool_choice: 'auto' as const } : {}),
    }

    const response = await this.#post(body)
    const payload = await readJson(response)

    if (!response.ok)
      throw new ProviderError(`OpenRouter returned ${response.status}: ${describe(payload)}`)

    // A 200 can still carry an upstream failure instead of a completion.
    const asError = chatCompletionErrorSchema.safeParse(payload)
    if (asError.success)
      throw new ProviderError(`OpenRouter reported an error: ${asError.data.error.message ?? 'no message'}`)

    const parsed = chatCompletionResponseSchema.safeParse(payload)
    if (!parsed.success)
      throw new ProviderError(`OpenRouter response ${summariseIssues(parsed.error)}`)

    const choice = parsed.data.choices[0]!

    return {
      content: choice.message.content,
      toolCalls: choice.message.tool_calls,
      finishReason: choice.finish_reason,
    }
  }

  async #post(body: ChatCompletionRequest): Promise<Response> {
    try {
      return await fetch(`${this.#baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.#apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    }
    catch (cause) {
      const timedOut = cause instanceof Error && cause.name === 'TimeoutError'
      throw new ProviderError(
        timedOut
          ? `OpenRouter did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`
          : 'Could not reach OpenRouter',
        cause,
      )
    }
  }
}

/**
 * The body is read once, before the status is branched on, because both the
 * success and the failure path want it and a `Response` body can only be
 * consumed once. Non-JSON comes back as the raw text so an HTML gateway page
 * still tells us something.
 */
async function readJson(response: Response): Promise<unknown> {
  let text: string
  try {
    text = await response.text()
  }
  catch (cause) {
    throw new ProviderError('Could not read the OpenRouter response body', cause)
  }

  try {
    return JSON.parse(text) as unknown
  }
  catch {
    return text
  }
}

function describe(payload: unknown): string {
  const asError = chatCompletionErrorSchema.safeParse(payload)
  if (asError.success && asError.data.error.message)
    return asError.data.error.message.slice(0, DETAIL_LIMIT)

  const text = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return text.slice(0, DETAIL_LIMIT) || '(empty body)'
}

/** Zod's own message is JSON; the paths alone read better in a log line. */
function summariseIssues(error: { issues: { path: PropertyKey[], message: string }[] }): string {
  return error.issues
    .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ')
}
