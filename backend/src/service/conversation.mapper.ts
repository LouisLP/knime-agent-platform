import type { ConversationItem } from '../domain/conversation-item.ts'
import type { ChatMessage } from './llm/openrouter.types.ts'

/**
 * Projects the conversation log into provider messages.
 *
 * `error` items are dropped: they are a frontend-facing signal, and replaying
 * them would invite the model to apologise for infrastructure problems.
 */
export function toChatMessages(items: ConversationItem[], systemPrompt: string): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }]

  for (const item of items) {
    switch (item.type) {
      case 'user_message':
        messages.push({ role: 'user', content: item.content })
        break

      case 'assistant_message':
        messages.push({ role: 'assistant', content: item.content })
        break

      case 'tool_call':
        // Consecutive tool calls from one turn must share a single assistant
        // message, so merge into the previous one when it is still open.
        appendToolCall(messages, item)
        break

      case 'tool_result':
        messages.push({
          role: 'tool',
          tool_call_id: item.toolCallId,
          content: item.content,
        })
        break

      case 'error':
        break
    }
  }

  return messages
}

function appendToolCall(
  messages: ChatMessage[],
  item: Extract<ConversationItem, { type: 'tool_call' }>,
): void {
  const toolCall = {
    id: item.toolCallId,
    type: 'function' as const,
    function: {
      name: item.toolName,
      arguments: JSON.stringify(item.arguments ?? {}),
    },
  }

  const last = messages.at(-1)
  if (last?.role === 'assistant' && last.tool_calls) {
    last.tool_calls.push(toolCall)
    return
  }

  messages.push({ role: 'assistant', content: null, tool_calls: [toolCall] })
}
