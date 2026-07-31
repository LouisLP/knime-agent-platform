import type { ConversationItem } from '../domain/conversation-item.ts'
import type { FakeToolProviderOptions } from '../testing/fakes.ts'
import type { LlmCompletion } from './llm/openrouter.client.ts'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ErrorCode } from '../domain/error-code.ts'
import { ProviderError, ToolError } from '../domain/errors.ts'
import { InMemoryConversationRepository } from '../repository/conversation.repository.ts'
import {
  assistantSays,
  completion,
  FakeToolProvider,
  requestsTool,
  ScriptedLlmClient,
  testEnv,
  tool,
  toolCall,
} from '../testing/fakes.ts'
import { ChatService } from './chat.service.ts'

/**
 * The orchestration loop, one scripted model at a time. Everything the service
 * talks to is an interface, so no network, provider key or MCP child process is
 * involved — the assertions are about item order, what the model was shown, and
 * which failures end the turn versus which the model gets a chance to recover
 * from.
 */

interface Harness {
  service: ChatService
  llm: ScriptedLlmClient
  tools: FakeToolProvider
  repository: InMemoryConversationRepository
}

function harness(
  script: (LlmCompletion | Error)[],
  toolOptions: FakeToolProviderOptions = {},
  env: Partial<typeof testEnv> = {},
): Harness {
  const repository = new InMemoryConversationRepository()
  const llm = new ScriptedLlmClient(script)
  const tools = new FakeToolProvider(toolOptions)
  const service = new ChatService(repository, llm, tools, { ...testEnv, ...env })

  return { service, llm, tools, repository }
}

const types = (items: ConversationItem[]) => items.map(item => item.type)

function only<T extends ConversationItem['type']>(
  items: ConversationItem[],
  type: T,
): Extract<ConversationItem, { type: T }>[] {
  return items.filter((item): item is Extract<ConversationItem, { type: T }> => item.type === type)
}

describe('chat service: a turn with no tool calls', () => {
  it('records the user message and the answer, in that order', async () => {
    const { service, llm } = harness([assistantSays('Hello there.')])
    const conversation = service.createConversation()

    const { conversationId, items } = await service.sendMessage(conversation.id, 'Hi')

    assert.equal(conversationId, conversation.id)
    assert.deepEqual(types(items), ['user_message', 'assistant_message'])
    assert.equal(only(items, 'assistant_message')[0]?.content, 'Hello there.')
    assert.equal(llm.callCount, 1)
  })

  it('shows the model the system prompt, the history and the new message', async () => {
    const { service, llm } = harness([assistantSays('first'), assistantSays('second')])
    const conversation = service.createConversation()

    await service.sendMessage(conversation.id, 'one')
    await service.sendMessage(conversation.id, 'two')

    assert.deepEqual(llm.messagesAt(0).map(message => message.role), ['system', 'user'])
    assert.deepEqual(
      llm.messagesAt(1).map(message => message.role),
      ['system', 'user', 'assistant', 'user'],
    )
  })

  it('offers the discovered tools to the model', async () => {
    const { service, llm } = harness(
      [assistantSays('done')],
      { tools: [tool('read_text_file'), tool('list_directory')] },
    )
    const conversation = service.createConversation()

    await service.sendMessage(conversation.id, 'Hi')

    assert.deepEqual(
      llm.toolsSeen[0]?.map(offered => offered.function.name),
      ['read_text_file', 'list_directory'],
    )
  })

  it('returns only this turn, while the conversation keeps the whole transcript', async () => {
    const { service, repository } = harness([assistantSays('first'), assistantSays('second')])
    const conversation = service.createConversation()

    await service.sendMessage(conversation.id, 'one')
    const second = await service.sendMessage(conversation.id, 'two')

    assert.deepEqual(types(second.items), ['user_message', 'assistant_message'])
    assert.equal(repository.getById(conversation.id).items.length, 4)
  })

  it('substitutes empty content for an answer the provider left null', async () => {
    const { service } = harness([completion({ content: null })])
    const conversation = service.createConversation()

    const { items } = await service.sendMessage(conversation.id, 'Hi')

    assert.equal(only(items, 'assistant_message')[0]?.content, '')
  })
})

describe('chat service: a turn that uses tools', () => {
  it('runs the tool and feeds the result back for a final answer', async () => {
    const { service, llm, tools } = harness(
      [
        requestsTool('call_1', 'read_text_file', { path: 'notes.md' }),
        assistantSays('The file says hello.'),
      ],
      {
        tools: [tool('read_text_file')],
        handlers: { read_text_file: () => ({ content: 'hello', isError: false }) },
      },
    )
    const conversation = service.createConversation()

    const { items } = await service.sendMessage(conversation.id, 'read notes.md')

    assert.deepEqual(types(items), [
      'user_message',
      'tool_call',
      'tool_result',
      'assistant_message',
    ])
    assert.deepEqual(tools.calls, [{ name: 'read_text_file', args: { path: 'notes.md' } }])
    assert.equal(only(items, 'tool_result')[0]?.content, 'hello')
    assert.equal(only(items, 'assistant_message')[0]?.content, 'The file says hello.')

    // The second call must show the model its own call and the tool's answer.
    assert.deepEqual(
      llm.messagesAt(1).map(message => message.role),
      ['system', 'user', 'assistant', 'tool'],
    )
  })

  it('links the tool call and its result by the provider-assigned id', async () => {
    const { service } = harness(
      [requestsTool('call_abc', 'read_text_file'), assistantSays('done')],
      { tools: [tool('read_text_file')] },
    )
    const conversation = service.createConversation()

    const { items } = await service.sendMessage(conversation.id, 'go')

    assert.equal(only(items, 'tool_call')[0]?.toolCallId, 'call_abc')
    assert.equal(only(items, 'tool_result')[0]?.toolCallId, 'call_abc')
  })

  it('records several calls from one completion in order', async () => {
    const { service, tools } = harness(
      [
        completion({
          finishReason: 'tool_calls',
          toolCalls: [
            toolCall('call_1', 'read_text_file', { path: 'a.md' }),
            toolCall('call_2', 'read_text_file', { path: 'b.md' }),
          ],
        }),
        assistantSays('Both read.'),
      ],
      { tools: [tool('read_text_file')] },
    )
    const conversation = service.createConversation()

    const { items } = await service.sendMessage(conversation.id, 'read both')

    assert.deepEqual(types(items), [
      'user_message',
      'tool_call',
      'tool_result',
      'tool_call',
      'tool_result',
      'assistant_message',
    ])
    assert.deepEqual(tools.calls.map(call => call.args), [{ path: 'a.md' }, { path: 'b.md' }])
  })

  it('keeps text the model emitted alongside its tool calls', async () => {
    const { service } = harness(
      [
        completion({
          content: 'Let me check that file.',
          finishReason: 'tool_calls',
          toolCalls: [toolCall('call_1', 'read_text_file')],
        }),
        assistantSays('It is a to-do list.'),
      ],
      { tools: [tool('read_text_file')] },
    )
    const conversation = service.createConversation()

    const { items } = await service.sendMessage(conversation.id, 'what is in notes.md?')

    assert.deepEqual(types(items), [
      'user_message',
      'assistant_message',
      'tool_call',
      'tool_result',
      'assistant_message',
    ])
    assert.equal(only(items, 'assistant_message')[0]?.content, 'Let me check that file.')
  })

  it('loops over several rounds of tool calls', async () => {
    const { service, llm } = harness(
      [
        requestsTool('call_1', 'list_directory'),
        requestsTool('call_2', 'read_text_file'),
        assistantSays('Here is the summary.'),
      ],
      { tools: [tool('list_directory'), tool('read_text_file')] },
    )
    const conversation = service.createConversation()

    const { items } = await service.sendMessage(conversation.id, 'summarise the folder')

    assert.deepEqual(types(items), [
      'user_message',
      'tool_call',
      'tool_result',
      'tool_call',
      'tool_result',
      'assistant_message',
    ])
    assert.equal(llm.callCount, 3)
  })
})

describe('chat service: failures the model can recover from', () => {
  it('hands a failing tool back as an errored result and keeps going', async () => {
    const { service } = harness(
      [
        requestsTool('call_1', 'read_text_file', { path: 'missing.md' }),
        assistantSays('That file does not exist.'),
      ],
      {
        tools: [tool('read_text_file')],
        handlers: { read_text_file: () => ({ content: 'ENOENT: no such file', isError: true }) },
      },
    )
    const conversation = service.createConversation()

    const { items } = await service.sendMessage(conversation.id, 'read missing.md')

    assert.deepEqual(types(items), [
      'user_message',
      'tool_call',
      'tool_result',
      'assistant_message',
    ])
    const [result] = only(items, 'tool_result')
    assert.ok(result)
    assert.equal(result.isError, true)
    assert.match(result.content, /ENOENT/)
  })

  it('turns unparseable tool arguments into an errored result without calling the tool', async () => {
    const { service, tools } = harness(
      [
        completion({
          finishReason: 'tool_calls',
          toolCalls: [toolCall('call_1', 'read_text_file', '{"path": ')],
        }),
        assistantSays('Let me try that again.'),
      ],
      { tools: [tool('read_text_file')] },
    )
    const conversation = service.createConversation()

    const { items } = await service.sendMessage(conversation.id, 'read notes.md')

    assert.deepEqual(tools.calls, [])
    const [result] = only(items, 'tool_result')
    assert.ok(result)
    assert.equal(result.isError, true)
    assert.match(result.content, /Invalid tool arguments/)
    // The raw text is kept on the call item so the transcript shows what broke.
    assert.equal(only(items, 'tool_call')[0]?.arguments, '{"path": ')
  })

  it('treats empty arguments as an empty object', async () => {
    const { service, tools } = harness(
      [
        completion({ finishReason: 'tool_calls', toolCalls: [toolCall('call_1', 'list_directory', '')] }),
        assistantSays('done'),
      ],
      { tools: [tool('list_directory')] },
    )
    const conversation = service.createConversation()

    await service.sendMessage(conversation.id, 'list the folder')

    assert.deepEqual(tools.calls, [{ name: 'list_directory', args: {} }])
  })
})

describe('chat service: failures that end the turn', () => {
  it('records a provider failure as an error item and still returns the turn', async () => {
    const { service, repository } = harness([new ProviderError('OpenRouter returned 502')])
    const conversation = service.createConversation()

    const { items } = await service.sendMessage(conversation.id, 'Hi')

    assert.deepEqual(types(items), ['user_message', 'error'])
    const [error] = only(items, 'error')
    assert.ok(error)
    assert.equal(error.code, ErrorCode.Provider)
    assert.match(error.message, /502/)
    // Persisted too, so a reload shows the failure where it happened.
    assert.deepEqual(types(repository.getById(conversation.id).items), ['user_message', 'error'])
  })

  it('records an unreachable MCP server as an error item', async () => {
    const { service } = harness([], { listToolsError: new ToolError('MCP client is not connected') })
    const conversation = service.createConversation()

    const { items } = await service.sendMessage(conversation.id, 'Hi')

    assert.deepEqual(types(items), ['user_message', 'error'])
    assert.equal(only(items, 'error')[0]?.code, ErrorCode.Tool)
  })

  it('keeps the items produced before the failure', async () => {
    const { service } = harness(
      [requestsTool('call_1', 'read_text_file'), new ProviderError('OpenRouter timed out')],
      { tools: [tool('read_text_file')] },
    )
    const conversation = service.createConversation()

    const { items } = await service.sendMessage(conversation.id, 'read notes.md')

    assert.deepEqual(types(items), ['user_message', 'tool_call', 'tool_result', 'error'])
  })

  it('labels an unexpected failure as internal rather than leaking it', async () => {
    const { service } = harness([new TypeError('undefined is not a function')])
    const conversation = service.createConversation()

    const { items } = await service.sendMessage(conversation.id, 'Hi')

    assert.equal(only(items, 'error')[0]?.code, ErrorCode.Internal)
  })

  it('rejects a message for a conversation that does not exist', async () => {
    const { service } = harness([assistantSays('unused')])
    // A valid id, but from a different repository — nothing was ever stored.
    const unknownId = new InMemoryConversationRepository().create().id

    await assert.rejects(() => service.sendMessage(unknownId, 'Hi'), /not found/)
  })
})

describe('chat service: the iteration budget', () => {
  it('stops after MAX_TOOL_ITERATIONS rounds and records why', async () => {
    const maxToolIterations = 3
    const { service, llm } = harness(
      Array.from({ length: maxToolIterations }, (_, index) =>
        requestsTool(`call_${index}`, 'read_text_file')),
      { tools: [tool('read_text_file')] },
      { MAX_TOOL_ITERATIONS: maxToolIterations },
    )
    const conversation = service.createConversation()

    const { items } = await service.sendMessage(conversation.id, 'loop forever')

    assert.equal(llm.callCount, maxToolIterations)
    assert.deepEqual(types(items), [
      'user_message',
      ...Array.from({ length: maxToolIterations }, () => ['tool_call', 'tool_result']).flat(),
      'error',
    ])
    const [error] = only(items, 'error')
    assert.ok(error)
    assert.equal(error.code, ErrorCode.ToolIterationLimit)
    assert.match(error.message, /3 tool rounds/)
  })

  it('does not fire when the model answers within the budget', async () => {
    const { service } = harness(
      [requestsTool('call_1', 'read_text_file'), assistantSays('Done.')],
      { tools: [tool('read_text_file')] },
      { MAX_TOOL_ITERATIONS: 2 },
    )
    const conversation = service.createConversation()

    const { items } = await service.sendMessage(conversation.id, 'read notes.md')

    assert.deepEqual(only(items, 'error'), [])
  })
})
