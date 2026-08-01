import type { CreditStatus } from '@/types/credits'
import { request } from '@/api/http'

export interface CreditsClient {
  getCredits: () => Promise<CreditStatus>
}

export const creditsClient: CreditsClient = {
  getCredits: () => request<CreditStatus>('GET', '/api/credits'),
}
