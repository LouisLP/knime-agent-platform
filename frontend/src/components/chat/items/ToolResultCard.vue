<script setup lang="ts">
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui'
import { computed } from 'vue'

/**
 * What a tool handed back. Results are long — a directory listing, a whole CSV —
 * so the body collapses and the first line stands in for it.
 *
 * `linkedCall` is the id of the `tool_call` element this answers, resolved by
 * the pane from `toolCallId`. Sighted users get the pairing from the layout;
 * this gives screen readers the same link.
 */
const props = defineProps<{
  toolName: string
  content: string
  isError: boolean
  linkedCallElementId?: string
}>()

const summary = computed(() => {
  const firstLine = props.content.trim().split('\n')[0] ?? ''
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine
})

const hasMore = computed(() => props.content.trim() !== summary.value)
</script>

<template>
  <article
    class="tool-result"
    :class="{ 'tool-result--error': isError }"
    :aria-describedby="linkedCallElementId"
  >
    <CollapsibleRoot v-slot="{ open }" :disabled="!hasMore">
      <CollapsibleTrigger class="tool-result__trigger" :class="{ 'tool-result__trigger--static': !hasMore }">
        <Icon
          class="tool-result__icon"
          :icon="isError ? 'ph:warning-bold' : 'ph:arrow-elbow-down-right-bold'"
          aria-hidden="true"
        />
        <span class="tool-result__summary">
          <span class="visually-hidden">
            {{ isError ? 'Tool failed: ' : 'Result from ' }}{{ toolName }}.
          </span>
          {{ summary || (isError ? 'Tool call failed' : 'No output') }}
        </span>
        <Icon
          v-if="hasMore"
          class="tool-result__chevron"
          :class="{ 'tool-result__chevron--open': open }"
          icon="ph:caret-down-bold"
          aria-hidden="true"
        />
      </CollapsibleTrigger>

      <CollapsibleContent v-if="hasMore" class="tool-result__content">
        <pre class="tool-result__body">{{ content }}</pre>
      </CollapsibleContent>
    </CollapsibleRoot>
  </article>
</template>

<style scoped>
/* Indented under its call, in the same hue — the pairing is the layout. */
.tool-result {
  margin-inline-start: var(--space-md);
  border: var(--border-width-thin) solid var(--color-border-default);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-surface);
  color: var(--color-text-secondary);
}

/* A failed tool is still a normal part of the transcript, so it borrows the
   danger hue at its quietest — enough to spot, not enough to alarm. */
.tool-result--error {
  border-color: var(--color-danger-border);
  background-color: var(--color-danger-subtle-bg);
  color: var(--color-danger-subtle-fg);
}

.tool-result__trigger {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  inline-size: 100%;
  padding: var(--space-2xs) var(--space-xs);
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.tool-result__trigger--static {
  cursor: default;
}

.tool-result__icon {
  flex-shrink: 0;
  font-size: var(--font-size-sm);
}

.tool-result__summary {
  flex: 1;
  min-inline-size: 0;
  font-family: var(--font-code);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
}

.tool-result__chevron {
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  transition: rotate var(--duration-fast) var(--ease-out);
}

.tool-result__chevron--open {
  rotate: 180deg;
}

.tool-result__content {
  padding: 0 var(--space-xs) var(--space-xs);
}

.tool-result__body {
  overflow: auto;
  max-block-size: 18rem;
  padding: var(--space-xs);
  border-radius: var(--radius-sm);
  background-color: var(--color-bg-canvas);
  font-size: var(--font-size-xs);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
