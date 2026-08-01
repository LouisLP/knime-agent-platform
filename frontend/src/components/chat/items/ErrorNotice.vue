<script setup lang="ts">
import type { ErrorCode } from '@/types/conversation.types'
import { computed } from 'vue'

/**
 * An `error` item: a failure the backend recorded *in* the transcript, so it
 * sits in the flow where it happened. Transport failures are a different thing
 * and live outside the list — see `TransportErrorBanner`.
 */
const props = defineProps<{ code: ErrorCode, message: string }>()

/** The backend's codes are a closed set, so every one gets a human heading. */
const HEADINGS: Record<ErrorCode, string> = {
  not_found: 'Conversation not found',
  validation_error: 'That message was rejected',
  provider_error: 'The model provider failed',
  tool_error: 'A tool failed',
  internal_error: 'Something went wrong',
  tool_iteration_limit: 'Stopped after too many tool steps',
}

const heading = computed(() => HEADINGS[props.code])
</script>

<template>
  <article class="error-notice" role="alert">
    <Icon class="error-notice__icon" icon="ph:warning-octagon-bold" aria-hidden="true" />
    <div class="error-notice__text">
      <h3 class="error-notice__heading">
        {{ heading }}
      </h3>
      <p class="error-notice__message">
        {{ message }}
      </p>
    </div>
  </article>
</template>

<style scoped>
.error-notice {
  display: flex;
  gap: var(--space-xs);
  align-items: start;
  padding: var(--space-xs) var(--space-sm);
  border: var(--border-width-thin) solid var(--color-danger-border);
  border-radius: var(--radius-md);
  background-color: var(--color-danger-subtle-bg);
  color: var(--color-danger-subtle-fg);
}

.error-notice__icon {
  flex-shrink: 0;
  margin-block-start: 0.15em;
  color: var(--color-danger-default);
}

.error-notice__text {
  min-inline-size: 0;
}

.error-notice__heading {
  font-size: var(--font-size-sm);
  font-family: var(--font-body);
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--letter-spacing-normal);
}

.error-notice__message {
  font-size: var(--font-size-sm);
  overflow-wrap: anywhere;
  text-wrap: pretty;
}
</style>
