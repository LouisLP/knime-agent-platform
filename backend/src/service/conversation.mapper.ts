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
        // Tool calls belong on the assistant message they were emitted with,
        // so merge into the preceding one rather than opening a new message.
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

  // An assistant message can only be immediately preceded by another one
  // within a single round: any other item type starts a new message. So the
  // last message being an assistant is exactly the "same round" case, whether
  // it already carries calls (a second call from one completion) or only text
  // (the narration the model emitted alongside them).
  const last = messages.at(-1)
  if (last?.role === 'assistant') {
    last.tool_calls = [...last.tool_calls ?? [], toolCall]
    return
  }

  messages.push({ role: 'assistant', content: null, tool_calls: [toolCall] })
}
