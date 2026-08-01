import type { AddressInfo } from 'node:net'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import { InMemoryConversationRepository } from '../repository/conversation.repository.ts'
import { ChatService } from '../service/chat.service.ts'
import { FakeCreditsReader, FakeToolProvider, StaticLlmClient, testEnv } from '../testing/fakes.ts'
import { ChatController } from './controllers/chat.controller.ts'
import { CreditsController } from './controllers/credits.controller.ts'
import { createServer } from './server.ts'

/**
 * Covers the HTTP layer and the repository: routing, DTO validation, status
 * codes and the error envelope. The orchestration loop itself is covered in
 * `service/chat.service.test.ts`; here the model answers in one shot, so this
 * file only proves the wiring.
 */

describe('http api', () => {
  const service = new ChatService(
    new InMemoryConversationRepository(),
    new StaticLlmClient(),
    new FakeToolProvider(),
    testEnv,
  )
  const server = createServer(
    testEnv,
    new ChatController(service),
    new CreditsController(new FakeCreditsReader()),
  ).listen(0)
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
    assert.deepEqual(body, { status: 'ok', model: testEnv.OPENROUTER_MODEL })
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

  it('reports the credit figures for the provider key', async () => {
    const { status, body } = await request('/api/credits')

    assert.equal(status, 200)
    assert.deepEqual(body, { usage: 2.5, limit: 10, remaining: 7.5, scope: 'key' })
  })

  it('answers an unknown route with the error envelope', async () => {
    const { status, body } = await request('/api/nope')

    assert.equal(status, 404)
    assert.equal(body.error.code, 'not_found')
  })
})
