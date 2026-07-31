import type { Env, ModelId } from '../../config/env.ts'
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  ChatTool,
} from './openrouter.types.ts'
import { ProviderError } from '../../domain/errors.ts'

export interface LlmClient {
  readonly model: ModelId
  complete: (messages: ChatMessage[], tools: ChatTool[]) => Promise<ChatCompletionResponse>
}

/** OpenAI-compatible client pointed at OpenRouter. */
export class OpenRouterClient implements LlmClient {
  readonly #apiKey: string
  readonly #baseUrl: string
  readonly model: ModelId

  constructor(env: Pick<Env, 'OPENROUTER_API_KEY' | 'OPENROUTER_BASE_URL' | 'OPENROUTER_MODEL'>) {
    this.#apiKey = env.OPENROUTER_API_KEY
    this.#baseUrl = env.OPENROUTER_BASE_URL.replace(/\/$/, '')
    this.model = env.OPENROUTER_MODEL
  }

  async complete(messages: ChatMessage[], tools: ChatTool[]): Promise<ChatCompletionResponse> {
    const body: ChatCompletionRequest = {
      model: this.model,
      messages,
      ...(tools.length > 0 ? { tools, tool_choice: 'auto' as const } : {}),
    }

    let response: Response
    try {
      response = await fetch(`${this.#baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.#apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    }
    catch (cause) {
      throw new ProviderError('Could not reach OpenRouter', cause)
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new ProviderError(`OpenRouter returned ${response.status}: ${detail.slice(0, 500)}`)
    }

    const payload = await response.json() as ChatCompletionResponse
    if (!payload.choices?.[0])
      throw new ProviderError('OpenRouter response contained no choices')

    return payload
  }
}
