<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useCreditsStore } from '@/stores/credits'

/**
 * How much the provider key has left, as a ring plus a figure. It sits opposite
 * the pane heading, so it stays deliberately quiet: no ring when nothing caps
 * the key (there is no fraction to draw), and nothing at all when the lookup
 * fails — an unavailable balance is not the user's problem to solve.
 */

/** Radius of the ring path; the viewBox is sized around it. */
const RADIUS = 7
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Below this share of the budget the ring turns red rather than accent. */
const LOW_THRESHOLD = 0.15

const credits = useCreditsStore()
const { status, fractionRemaining } = storeToRefs(credits)

/** The number the badge leads with: what is left, or failing that, what is spent. */
const headline = computed(() => {
  const current = status.value
  if (current === null)
    return null

  return current.remaining === null
    ? `${money(current.usage)} used`
    : `${money(current.remaining)} left`
})

const isLow = computed(
  () => fractionRemaining.value !== null && fractionRemaining.value < LOW_THRESHOLD,
)

/** The unspent arc, drawn from the top and clockwise (see the -90° rotation). */
const dashArray = computed(() => {
  const fraction = fractionRemaining.value ?? 0
  return `${CIRCUMFERENCE * fraction} ${CIRCUMFERENCE}`
})

/** The full picture, for anyone who hovers or reads it with a screen reader. */
const detail = computed(() => {
  const current = status.value
  if (current === null)
    return ''

  const subject = current.scope === 'key' ? 'API key' : 'OpenRouter account'

  return current.limit === null
    ? `${money(current.usage)} spent on this ${subject}; no spend limit set`
    : `${money(current.remaining ?? 0)} of ${money(current.limit)} left on this ${subject}`
})

/** Cents matter here — a demo turn costs a fraction of one. */
function money(amount: number): string {
  return `$${amount.toFixed(2)}`
}
</script>

<template>
  <p v-if="headline !== null" class="credits" :title="detail">
    <svg
      v-if="fractionRemaining !== null"
      class="credits__ring"
      :class="{ 'credits__ring--low': isLow }"
      viewBox="0 0 18 18"
      aria-hidden="true"
    >
      <circle class="credits__track" cx="9" cy="9" :r="RADIUS" />
      <circle
        class="credits__arc"
        cx="9"
        cy="9"
        :r="RADIUS"
        :stroke-dasharray="dashArray"
        transform="rotate(-90 9 9)"
      />
    </svg>

    <span>{{ headline }}</span>
    <!-- `title` is mouse-only; this carries the same text to assistive tech. -->
    <span class="visually-hidden">{{ detail }}</span>
  </p>
</template>

<style scoped>
.credits {
  display: flex;
  gap: var(--space-2xs);
  align-items: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.credits__ring {
  inline-size: 1.125rem;
  block-size: 1.125rem;
  flex: none;
}

.credits__track,
.credits__arc {
  fill: none;
  stroke-width: 2;
}

.credits__track {
  stroke: var(--color-border-subtle);
}

.credits__arc {
  stroke: var(--color-accent-default);
  stroke-linecap: round;
}

.credits__ring--low .credits__arc {
  stroke: var(--color-danger-default);
}

@media (prefers-reduced-motion: no-preference) {
  .credits__arc {
    transition: stroke-dasharray var(--duration-slow) var(--ease-out);
  }
}
</style>
