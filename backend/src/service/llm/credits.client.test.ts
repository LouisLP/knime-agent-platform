import assert from 'node:assert/strict'
import { beforeEach, describe, it, mock } from 'node:test'
import { testEnv } from '../../testing/fakes.ts'
import { OpenRouterCreditsClient } from './credits.client.ts'

/**
 * The two lookups answer different questions and only one of them binds, so
 * these cover which figure wins — plus the cache, since a header badge polls.
 */

type Route = Record<string, { status?: number, body: unknown }>

function stubFetch(routes: Route) {
  const calls: string[] = []

  mock.method(globalThis, 'fetch', (input: string | URL) => {
    const url = String(input)
    calls.push(url)

    const match = Object.entries(routes).find(([path]) => url.endsWith(path))
    if (!match)
      return Promise.resolve(new Response('nope', { status: 404 }))

    const [, { status = 200, body }] = match
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  })

  return calls
}

describe('openRouter credits client', () => {
  beforeEach(() => {
    mock.restoreAll()
  })

  it("prefers the key's own cap, because it binds first", async () => {
    stubFetch({
      '/key': { body: { data: { usage: 4, limit: 10 } } },
      '/credits': { body: { data: { total_credits: 500, total_usage: 4 } } },
    })

    const status = await new OpenRouterCreditsClient(testEnv).read()

    assert.deepEqual(status, { usage: 4, limit: 10, remaining: 6, scope: 'key' })
  })

  it('falls back to the account balance when the key is uncapped', async () => {
    stubFetch({
      '/key': { body: { data: { usage: 4, limit: null } } },
      '/credits': { body: { data: { total_credits: 25, total_usage: 10 } } },
    })

    const status = await new OpenRouterCreditsClient(testEnv).read()

    assert.deepEqual(status, { usage: 10, limit: 25, remaining: 15, scope: 'account' })
  })

  it('still reports usage when the account lookup is refused', async () => {
    stubFetch({
      '/key': { body: { data: { usage: 4, limit: null } } },
      '/credits': { status: 401, body: {} },
    })

    const status = await new OpenRouterCreditsClient(testEnv).read()

    assert.deepEqual(status, { usage: 4, limit: null, remaining: null, scope: 'key' })
  })

  it('never reports a negative balance', async () => {
    stubFetch({ '/key': { body: { data: { usage: 12, limit: 10 } } } })

    const status = await new OpenRouterCreditsClient(testEnv).read()

    assert.equal(status.remaining, 0)
  })

  it('serves repeat reads from the cache', async () => {
    const calls = stubFetch({ '/key': { body: { data: { usage: 4, limit: 10 } } } })
    const client = new OpenRouterCreditsClient(testEnv)

    await client.read()
    await client.read()

    assert.equal(calls.length, 1)
  })

  it('surfaces a failed key lookup as a provider error', async () => {
    stubFetch({ '/key': { status: 500, body: {} } })

    await assert.rejects(
      new OpenRouterCreditsClient(testEnv).read(),
      /OpenRouter returned 500/,
    )
  })
})
