/**
 * The slice of the OpenAI chat-completions shape we actually use. Hand-written
 * rather than pulled from the `openai` package to keep the provider boundary
 * explicit and swappable.
 *
 * Requests are plain types — we build them, so they are correct by
 * construction. Responses are Zod schemas: they cross a trust boundary, and
 * OpenRouter fronts many vendors whose payloads differ in the details, so the
 * client validates before the rest of the service sees anything.
 */

import { z } from 'zod'

// --- Request ---------------------------------------------------------------

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

// --- Response --------------------------------------------------------------

/**
 * Lenient where vendors legitimately differ, strict where we depend on the
 * value: `id` and `name` must be present strings, while a missing `type` or
 * `arguments` is normalised rather than rejected.
 */
const toolCallSchema = z.object({
  id: z.string(),
  type: z.literal('function').default('function'),
  function: z.object({
    name: z.string(),
    arguments: z.string().nullish().transform(value => value ?? ''),
  }),
}) satisfies z.ZodType<ChatToolCall, unknown>

const choiceSchema = z.object({
  finish_reason: z.string().nullish().transform(value => value ?? null),
  message: z.object({
    content: z.string().nullish().transform(value => value ?? null),
    tool_calls: z.array(toolCallSchema).nullish().transform(value => value ?? []),
  }),
})

export const chatCompletionResponseSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z.array(choiceSchema).min(1, 'contained no choices'),
})

export type ChatCompletionResponse = z.infer<typeof chatCompletionResponseSchema>

/**
 * OpenRouter reports upstream failures in an `error` envelope, and does so with
 * a 200 status when the request itself was well-formed. Parsed opportunistically
 * so "moderation flagged this" surfaces as a readable message instead of a
 * schema complaint about missing `choices`.
 */
export const chatCompletionErrorSchema = z.object({
  error: z.object({
    message: z.string().optional(),
    code: z.union([z.string(), z.number()]).optional(),
  }),
})
