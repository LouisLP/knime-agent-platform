<script setup lang="ts">
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui'
import { computed } from 'vue'

/**
 * One tool the model decided to call. The name is always visible — that is the
 * story of the turn — while the arguments collapse, because a `search_files`
 * pattern is detail and the pane is narrow.
 *
 * Reka's Collapsible rather than `<details>`: it wires `aria-expanded` and
 * `aria-controls` to a real button, and keeps trigger and panel styleable as
 * separate rows without fighting the marker.
 */
const props = defineProps<{ toolName: string, args: unknown }>()

/** `{}` is the common case for zero-arg tools — say so instead of showing braces. */
const hasArgs = computed(
  () => props.args !== null
    && typeof props.args === 'object'
    && Object.keys(props.args).length > 0,
)

const formattedArgs = computed(() => JSON.stringify(props.args, null, 2) ?? String(props.args))
</script>

<template>
  <article class="tool-call">
    <CollapsibleRoot v-slot="{ open }" :disabled="!hasArgs">
      <CollapsibleTrigger class="tool-call__trigger" :class="{ 'tool-call__trigger--static': !hasArgs }">
        <Icon class="tool-call__icon" icon="ph:wrench-bold" aria-hidden="true" />
        <span class="tool-call__label">
          <span class="visually-hidden">Called tool </span>
          <code>{{ toolName }}</code>
        </span>
        <Icon
          v-if="hasArgs"
          class="tool-call__chevron"
          :class="{ 'tool-call__chevron--open': open }"
          icon="ph:caret-down-bold"
          aria-hidden="true"
        />
      </CollapsibleTrigger>

      <CollapsibleContent v-if="hasArgs" class="tool-call__content">
        <pre class="tool-call__args">{{ formattedArgs }}</pre>
      </CollapsibleContent>
    </CollapsibleRoot>
  </article>
</template>

<style scoped>
.tool-call {
  border: var(--border-width-thin) solid var(--color-secondary-border);
  border-radius: var(--radius-md);
  background-color: var(--color-secondary-subtle-bg);
  color: var(--color-secondary-subtle-fg);
}

.tool-call__trigger {
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

/* Nothing to expand: keep the row, drop the affordance. */
.tool-call__trigger--static {
  cursor: default;
}

.tool-call__icon {
  flex-shrink: 0;
  font-size: var(--font-size-sm);
}

.tool-call__label {
  flex: 1;
  min-inline-size: 0;
  font-size: var(--font-size-sm);
  overflow-wrap: anywhere;
}

.tool-call__chevron {
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  transition: rotate var(--duration-fast) var(--ease-out);
}

.tool-call__chevron--open {
  rotate: 180deg;
}

.tool-call__content {
  padding: 0 var(--space-xs) var(--space-xs);
}

.tool-call__args {
  overflow-x: auto;
  padding: var(--space-xs);
  border-radius: var(--radius-sm);
  background-color: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}
</style>
