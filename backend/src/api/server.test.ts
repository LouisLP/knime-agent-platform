import type { AddressInfo } from 'node:net'
import type { Env } from '../config/env.ts'
import type { LlmClient } from '../service/llm/openrouter.client.ts'
import type {
  ChatCompletionResponse,
  ChatMessage,
  ChatTool,
} from '../service/llm/openrouter.types.ts'
import type { ToolExecutionResult, ToolProvider } from '../service/mcp/mcp.client.ts'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import { InMemoryConversationRepository } from '../repository/conversation.repository.ts'
import { ChatService } from '../service/chat.service.ts'
import { ChatController } from './controllers/chat.controller.ts'
import { createServer } from './server.ts'

/**
 * Covers the HTTP layer and the repository: routing, DTO validation, status
 * codes and the error envelope. The model and the MCP server are faked, so the
 * orchestration loop is exercised only far enough to prove the wiring.
 */

const env = {
  PORT: 0,
  CORS_ORIGIN: 'http://localhost:5173',
  OPENROUTER_API_KEY: 'test-key',
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  OPENROUTER_MODEL: 'anthropic/claude-sonnet-4.5',
  MAX_TOOL_ITERATIONS: 5,
  MCP_TRANSPORT: 'stdio',
  MCP_COMMAND: 'true',
  MCP_ARGS: [],
} satisfies Env

/** Answers every turn with fixed text and never asks for a tool. */
class FakeLlmClient implements LlmClient {
  readonly model = env.OPENROUTER_MODEL
  readonly calls: ChatMessage[][] = []

  complete(messages: ChatMessage[], _tools: ChatTool[]): Promise<ChatCompletionResponse> {
    this.calls.push(messages)
    return Promise.resolve({
      id: 'fake',
      model: this.model,
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'Hello from the fake model.' },
      }],
    })
  }
}

class FakeToolProvider implements ToolProvider {
  connect(): Promise<void> {
    return Promise.resolve()
  }

  close(): Promise<void> {
    return Promise.resolve()
  }

  listTools(): Promise<ChatTool[]> {
    return Promise.resolve([])
  }

  callTool(): Promise<ToolExecutionResult> {
    return Promise.resolve({ content: 'unused', isError: false })
  }
}

describe('http api', () => {
  const llm = new FakeLlmClient()
  const service = new ChatService(
    new InMemoryConversationRepository(),
    llm,
    new FakeToolProvider(),
    env,
  )
  const server = createServer(env, new ChatController(service)).listen(0)
  let baseUrl: string

  before(() => {
    const { port } = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${port}`
  })

  after(() => {
    server.close()
  })

  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
    return { status: response.status, body: await response.json() as any }
  }

  const createConversation = async () => {
    const { body } = await request('/api/conversations', { method: 'POST' })
    return body.id as string
  }

  it('reports liveness and the active model', async () => {
    const { status, body } = await request('/health')

    assert.equal(status, 200)
    assert.deepEqual(body, { status: 'ok', model: env.OPENROUTER_MODEL })
  })

  it('creates an empty conversation', async () => {
    const { status, body } = await request('/api/conversations', { method: 'POST' })

    assert.equal(status, 201)
    assert.match(body.id, /^[0-9a-f-]{36}$/)
    assert.deepEqual(body.items, [])
  })

  it('returns a conversation by id', async () => {
    const id = await createConversation()
    const { status, body } = await request(`/api/conversations/${id}`)

    assert.equal(status, 200)
    assert.equal(body.id, id)
  })

  it('rejects an id that is not a uuid', async () => {
    const { status, body } = await request('/api/conversations/not-a-uuid')

    assert.equal(status, 400)
    assert.equal(body.error.code, 'validation_error')
    assert.ok(body.error.details)
  })

  it('reports an unknown conversation as not found', async () => {
    const { status, body } = await request(`/api/conversations/${randomUUID()}`)

    assert.equal(status, 404)
    assert.equal(body.error.code, 'not_found')
  })

  it('returns only the items produced by the turn', async () => {
    const id = await createConversation()
    const { status, body } = await request(`/api/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: 'Hi there' }),
    })

    assert.equal(status, 201)
    assert.equal(body.conversationId, id)
    assert.deepEqual(body.items.map((item: any) => item.type), ['user_message', 'assistant_message'])
    assert.equal(body.items[1].content, 'Hello from the fake model.')

    // The full conversation keeps both, so a reload replays the same transcript.
    const { body: reloaded } = await request(`/api/conversations/${id}`)
    assert.equal(reloaded.items.length, 2)
  })

  it('rejects an empty message body', async () => {
    const id = await createConversation()
    const { status, body } = await request(`/api/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: '   ' }),
    })

    assert.equal(status, 400)
    assert.equal(body.error.code, 'validation_error')
  })

  it('answers an unknown route with the error envelope', async () => {
    const { status, body } = await request('/api/nope')

    assert.equal(status, 404)
    assert.equal(body.error.code, 'not_found')
  })
})
