/** Mirrors `backend/src/domain/credits.ts` — dollars, as the provider reports them. */
export interface CreditStatus {
  usage: number
  /** `null` when nothing caps the key. */
  limit: number | null
  /** `null` when uncapped. */
  remaining: number | null
  /** Whether the figures describe this key's own cap or the account behind it. */
  scope: 'key' | 'account'
}
