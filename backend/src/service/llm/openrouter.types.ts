/**
 * The slice of the OpenAI chat-completions shape we actually use. Hand-written
 * rather than pulled from the `openai` package to keep the provider boundary
 * explicit and swappable.
 */

export interface ChatToolCall {
  id: string
  type: 'function'
  function: { name: string, arguments: string }
}

export type ChatMessage
  = | { role: 'system', content: string }
    | { role: 'user', content: string }
    | { role: 'assistant', content: string | null, tool_calls?: ChatToolCall[] }
    | { role: 'tool', tool_call_id: string, content: string }

export interface ChatTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  tools?: ChatTool[]
  tool_choice?: 'auto' | 'none'
}

export interface ChatCompletionChoice {
  index: number
  finish_reason: string | null
  message: {
    role: 'assistant'
    content: string | null
    tool_calls?: ChatToolCall[]
  }
}

export interface ChatCompletionResponse {
  id: string
  model: string
  choices: ChatCompletionChoice[]
}
