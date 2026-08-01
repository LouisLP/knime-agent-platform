import type { CreditStatus } from '@/types/credits.types'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { creditsClient } from '@/api/credits.client'

/**
 * What the provider key has left. Refreshed on load and after each turn, since
 * a turn is the only thing in this app that spends anything.
 *
 * A failed lookup is not an error worth interrupting anyone over — the key may
 * simply not be allowed to read its own balance — so `status` stays null and
 * the indicator hides itself rather than reporting a problem.
 */
export const useCreditsStore = defineStore('credits', () => {
  const status = ref<CreditStatus | null>(null)
  const isLoading = ref(false)

  /** The share still unspent, 0–1; null when nothing caps the key. */
  const fractionRemaining = computed(() => {
    const current = status.value
    if (current === null || current.limit === null || current.remaining === null)
      return null

    if (current.limit <= 0)
      return 0

    return Math.min(Math.max(current.remaining / current.limit, 0), 1)
  })

  async function refresh(): Promise<void> {
    if (isLoading.value)
      return

    isLoading.value = true

    try {
      status.value = await creditsClient.getCredits()
    }
    catch {
      status.value = null
    }
    finally {
      isLoading.value = false
    }
  }

  return { status, isLoading, fractionRemaining, refresh }
})
