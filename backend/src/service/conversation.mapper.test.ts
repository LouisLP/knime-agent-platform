import type {
  AssistantMessageItem,
  ErrorItem,
  ToolCallItem,
  ToolResultItem,
  UserMessageItem,
} from '../domain/conversation-item.ts'
import type { ChatMessage } from './llm/openrouter.types.ts'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createItem } from '../domain/conversation-item.ts'
import { ErrorCode } from '../domain/error-code.ts'
import { newConversationId, toToolCallId } from '../domain/ids.ts'
import { toChatMessages } from './conversation.mapper.ts'

const conversationId = newConversationId()
const SYSTEM = 'You are a helpful assistant.'

function user(content: string) {
  return createItem<UserMessageItem>(conversationId, { type: 'user_message', content })
}

function assistant(content: string) {
  return createItem<AssistantMessageItem>(conversationId, { type: 'assistant_message', content })
}

function errorItem(message: string) {
  return createItem<ErrorItem>(conversationId, { type: 'error', code: ErrorCode.Provider, message })
}

function toolCall(id: string, toolName: string, args: unknown = {}) {
  return createItem<ToolCallItem>(conversationId, {
    type: 'tool_call',
    toolCallId: toToolCallId(id),
    toolName,
    arguments: args,
  })
}

function toolResult(id: string, toolName: string, content: string, isError = false) {
  return createItem<ToolResultItem>(conversationId, {
    type: 'tool_result',
    toolCallId: toToolCallId(id),
    toolName,
    content,
    isError,
  })
}

/** Narrowing helper: `assert.equal` on `role` does not narrow the union. */
function assistantAt(messages: ChatMessage[], index: number) {
  const message = messages[index]
  assert.ok(message && message.role === 'assistant', `message ${index} is not an assistant message`)
  return message
}

describe('conversation mapper', () => {
  it('opens with the system prompt', () => {
    assert.deepEqual(toChatMessages([], SYSTEM), [{ role: 'system', content: SYSTEM }])
  })

  it('projects plain messages in order', () => {
    const messages = toChatMessages([user('hi'), assistant('hello'), user('and again')], SYSTEM)

    assert.deepEqual(messages, [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'and again' },
    ])
  })

  it('does not replay error items to the model', () => {
    const messages = toChatMessages([
      user('hi'),
      errorItem('OpenRouter fell over'),
      user('still there?'),
    ], SYSTEM)

    assert.deepEqual(messages.map(message => message.role), ['system', 'user', 'user'])
    assert.ok(!JSON.stringify(messages).includes('fell over'))
  })

  it('carries a tool call on an assistant message, then its result', () => {
    const messages = toChatMessages([
      user('what is in notes.md?'),
      toolCall('call_1', 'read_text_file', { path: 'notes.md' }),
      toolResult('call_1', 'read_text_file', 'file contents'),
    ], SYSTEM)

    assert.deepEqual(messages.slice(2), [
      {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'read_text_file', arguments: '{"path":"notes.md"}' },
        }],
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'file contents' },
    ])
  })

  it('merges tool calls from one completion into a single assistant message', () => {
    const messages = toChatMessages([
      user('read both files'),
      toolCall('call_1', 'read_text_file', { path: 'a.md' }),
      toolCall('call_2', 'read_text_file', { path: 'b.md' }),
      toolResult('call_1', 'read_text_file', 'a'),
      toolResult('call_2', 'read_text_file', 'b'),
    ], SYSTEM)

    assert.equal(messages.filter(message => message.role === 'assistant').length, 1)
    assert.deepEqual(assistantAt(messages, 2).tool_calls?.map(call => call.id), ['call_1', 'call_2'])
    assert.deepEqual(
      messages.filter(message => message.role === 'tool').map(message => message.tool_call_id),
      ['call_1', 'call_2'],
    )
  })

  it('folds narration recorded alongside a tool call onto the same message', () => {
    const messages = toChatMessages([
      user('what is in notes.md?'),
      assistant('Let me read that file.'),
      toolCall('call_1', 'read_text_file', { path: 'notes.md' }),
      toolResult('call_1', 'read_text_file', 'file contents'),
      assistant('It is a to-do list.'),
    ], SYSTEM)

    assert.deepEqual(
      messages.map(message => message.role),
      ['system', 'user', 'assistant', 'tool', 'assistant'],
    )
    const withCalls = assistantAt(messages, 2)
    assert.equal(withCalls.content, 'Let me read that file.')
    assert.deepEqual(withCalls.tool_calls?.map(call => call.id), ['call_1'])
  })

  it('starts a new assistant message for a later round of calls', () => {
    const messages = toChatMessages([
      user('read both files'),
      toolCall('call_1', 'read_text_file', { path: 'a.md' }),
      toolResult('call_1', 'read_text_file', 'a'),
      toolCall('call_2', 'read_text_file', { path: 'b.md' }),
      toolResult('call_2', 'read_text_file', 'b'),
    ], SYSTEM)

    assert.deepEqual(
      messages.map(message => message.role),
      ['system', 'user', 'assistant', 'tool', 'assistant', 'tool'],
    )
  })

  it('serialises absent tool arguments as an empty object', () => {
    const messages = toChatMessages([toolCall('call_1', 'list_directory', undefined)], SYSTEM)

    assert.equal(assistantAt(messages, 1).tool_calls?.[0]?.function.arguments, '{}')
  })
})
