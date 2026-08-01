import type { Env } from '../../config/env.ts'
import type { CreditStatus } from '../../domain/credits.ts'
import { z } from 'zod'
import { ProviderError } from '../../domain/errors.ts'

/** Credit figures move slowly and every browser tab asks; one lookup covers them all. */
const CACHE_TTL_MS = 30_000

/** Short, because this sits behind a header badge and must never hold a page. */
const REQUEST_TIMEOUT_MS = 5_000

/**
 * `GET /key` — what *this* key is allowed to spend. `limit` is null on a key
 * with no cap of its own, which is the common case.
 */
const keySchema = z.object({
  data: z.object({
    usage: z.number(),
    limit: z.number().nullish(),
  }),
})

/** `GET /credits` — what the account behind the key has bought and burned. */
const creditsSchema = z.object({
  data: z.object({
    total_credits: z.number(),
    total_usage: z.number(),
  }),
})

export interface CreditsReader {
  read: () => Promise<CreditStatus>
}

/**
 * Reads the spend figures OpenRouter exposes for the configured key.
 *
 * A key-level cap wins when one is set — it binds first, so it is the number
 * that will actually stop a conversation. Otherwise we fall back to the
 * account balance, and if that lookup is refused (some keys cannot see it) we
 * still report the key's usage with no ceiling rather than failing outright.
 */
export class OpenRouterCreditsClient implements CreditsReader {
  readonly #apiKey: string
  readonly #baseUrl: string
  #cached: { status: CreditStatus, at: number } | null = null

  constructor(env: Pick<Env, 'OPENROUTER_API_KEY' | 'OPENROUTER_BASE_URL'>) {
    this.#apiKey = env.OPENROUTER_API_KEY
    this.#baseUrl = env.OPENROUTER_BASE_URL.replace(/\/$/, '')
  }

  async read(): Promise<CreditStatus> {
    const cached = this.#cached
    if (cached && Date.now() - cached.at < CACHE_TTL_MS)
      return cached.status

    const status = await this.#fetchStatus()
    this.#cached = { status, at: Date.now() }
    return status
  }

  async #fetchStatus(): Promise<CreditStatus> {
    const key = await this.#get('/key', keySchema)

    if (key.data.limit != null) {
      return {
        usage: key.data.usage,
        limit: key.data.limit,
        remaining: Math.max(key.data.limit - key.data.usage, 0),
        scope: 'key',
      }
    }

    const account = await this.#get('/credits', creditsSchema).catch(() => null)

    if (account === null)
      return { usage: key.data.usage, limit: null, remaining: null, scope: 'key' }

    return {
      usage: account.data.total_usage,
      limit: account.data.total_credits,
      remaining: Math.max(account.data.total_credits - account.data.total_usage, 0),
      scope: 'account',
    }
  }

  async #get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${this.#baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${this.#apiKey}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    }
    catch (cause) {
      throw new ProviderError(`Could not reach OpenRouter for ${path}`, cause)
    }

    if (!response.ok)
      throw new ProviderError(`OpenRouter returned ${response.status} for ${path}`)

    const payload = await response.json().catch(() => null) as unknown
    const parsed = schema.safeParse(payload)

    if (!parsed.success)
      throw new ProviderError(`OpenRouter sent an unreadable ${path} response`)

    return parsed.data
  }
}
