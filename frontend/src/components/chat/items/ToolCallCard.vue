<script setup lang="ts">
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui'
import { computed, shallowRef, watch } from 'vue'

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

/**
 * Arguments are JSON, and a wall of one-colour JSON is the hardest part of the
 * transcript to skim: highlighting is what separates the keys from the paths
 * and patterns that are the actual content of the call.
 *
 * Shiki is behind a dynamic `import()` so the chat's entry chunk stays free of
 * it — it arrives with the first tool call and is a singleton thereafter. Until
 * then (and if it fails) the same JSON renders as plain monospace: same font,
 * same size, so nothing moves when the colour lands.
 */
const highlightedArgs = shallowRef<string>()

watch([formattedArgs, hasArgs], async ([json, present]) => {
  if (!present)
    return

  try {
    const { highlightCode } = await import('@/lib/shiki')
    highlightedArgs.value = await highlightCode(json, 'json')
  }
  catch {
    // Colour is the only thing lost; the plain rendering below stands in.
  }
}, { immediate: true })
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
        <!-- eslint-disable-next-line vue/no-v-html -- Shiki escapes the code it
             wraps, so tool arguments cannot smuggle markup through it. -->
        <div v-if="highlightedArgs" class="tool-call__args" v-html="highlightedArgs" />
        <pre v-else class="tool-call__args tool-call__args--plain">{{ formattedArgs }}</pre>
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

/**
 * Shiki emits its own `<pre class="shiki">`, so the wrapper carries the frame
 * and the `pre` inside it carries the scroll. The plain fallback is the `pre`
 * itself, hence the shared class.
 */
.tool-call__args {
  border-radius: var(--radius-sm);
  background-color: var(--color-bg-surface);
  color: var(--color-text-secondary);
}

.tool-call__args :deep(pre),
.tool-call__args--plain {
  overflow-x: auto;
  padding: var(--space-xs);
  font-size: var(--font-size-xs);
  /* A file path in an argument is long and the pane is narrow: wrap rather
     than hide the end of the call behind a sideways scroll. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  tab-size: 2;
}

/* Shiki makes the block focusable so it can be scrolled by keyboard. */
.tool-call__args :deep(pre:focus-visible),
.tool-call__args--plain:focus-visible {
  outline: var(--focus-ring);
  outline-offset: calc(var(--focus-ring-offset) * -1);
}
</style>
