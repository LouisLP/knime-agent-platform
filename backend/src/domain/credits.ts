/**
 * What the provider key has left to spend, in US dollars.
 *
 * OpenRouter reports this in two places and they answer different questions: a
 * key can carry its own spend cap, and the account behind it holds a credit
 * balance. `scope` says which one these numbers describe, so the UI can label
 * it honestly instead of implying a cap that does not exist.
 */
export interface CreditStatus {
  /** Spent so far. */
  usage: number
  /** The ceiling, or `null` when nothing caps this key. */
  limit: number | null
  /** `limit - usage`, or `null` when uncapped. */
  remaining: number | null
  scope: 'key' | 'account'
}
