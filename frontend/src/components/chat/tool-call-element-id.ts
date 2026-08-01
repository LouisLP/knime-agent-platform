import type { ToolCallId } from '@/types/conversation.types'

/**
 * The DOM id a rendered `tool_call` carries, and the target a `tool_result`
 * points its `aria-describedby` at. Both sides derive it from `toolCallId`, so
 * it lives here rather than in either component.
 */
export function toolCallElementId(toolCallId: ToolCallId): string {
  return `tool-call-${toolCallId}`
}
