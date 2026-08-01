<script setup lang="ts">
import type { TransportFailure } from '@/stores/chat'

/**
 * A request that never landed — backend down, CORS, a 500. Deliberately not a
 * transcript item: nothing was recorded server-side, so it sits above the
 * composer as a dismissible strip offering the one action that can help.
 *
 * Which action that is depends on the failure: usually retry, but a
 * conversation the backend has forgotten can only be replaced.
 */
defineProps<{ failure: TransportFailure, busy: boolean }>()

const emit = defineEmits<{ retry: [], restart: [], dismiss: [] }>()
</script>

<template>
  <div class="transport-error" role="alert">
    <Icon class="transport-error__icon" icon="ph:plugs-bold" aria-hidden="true" />
    <p class="transport-error__message">
      {{ failure.message }}
    </p>
    <div class="transport-error__actions">
      <button
        v-if="failure.conversationLost"
        type="button"
        class="transport-error__action"
        :disabled="busy"
        @click="emit('restart')"
      >
        Start a new conversation
      </button>
      <button v-else type="button" class="transport-error__action" :disabled="busy" @click="emit('retry')">
        Retry
      </button>
      <button type="button" class="transport-error__action" @click="emit('dismiss')">
        Dismiss
      </button>
    </div>
  </div>
</template>

<style scoped>
.transport-error {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-2xs) var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border: var(--border-width-thin) solid var(--color-danger-border);
  border-radius: var(--radius-md);
  background-color: var(--color-danger-subtle-bg);
  color: var(--color-danger-subtle-fg);
}

.transport-error__icon {
  margin-block-start: 0.15em;
  color: var(--color-danger-default);
}

.transport-error__message {
  font-size: var(--font-size-sm);
  text-wrap: pretty;
}

.transport-error__actions {
  display: flex;
  grid-column: 2;
  gap: var(--space-xs);
}

.transport-error__action {
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.transport-error__action:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
