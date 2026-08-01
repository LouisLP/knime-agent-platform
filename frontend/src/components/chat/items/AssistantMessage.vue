<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/lib/markdown'

/**
 * The model's prose. It answers in Markdown whether or not it was asked to — a
 * list of files, a table of regional totals, a bolded number — so the pane
 * renders Markdown rather than showing the syntax literally.
 *
 * Parsing and sanitisation both live in `lib/markdown`; this component only
 * decides what the result should look like.
 */
const props = defineProps<{ content: string }>()

const html = computed(() => renderMarkdown(props.content))
</script>

<template>
  <article class="assistant-message">
    <h3 class="visually-hidden">
      Assistant
    </h3>
    <!-- eslint-disable-next-line vue/no-v-html -- DOMPurify's output; see `lib/markdown`. -->
    <div class="assistant-message__content" v-html="html" />
  </article>
</template>

<style scoped>
.assistant-message {
  padding-inline-start: var(--space-sm);
  border-inline-start: var(--border-width-thick) solid var(--color-border-default);
  color: var(--color-text-primary);
}

/**
 * The rendered Markdown arrives through `v-html`, so scoped styles only reach
 * it with `:deep()`. What follows is the element defaults this pane needs and
 * the global stylesheet does not set — deliberately few, because this is a
 * narrow column of chat and not an article.
 */
.assistant-message__content {
  display: grid;
  gap: var(--space-xs);
  min-inline-size: 0;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}

/* Six heading levels mean nothing inside a chat turn: they collapse to one
   step of emphasis, sized to sit in the surrounding prose. */
.assistant-message__content :deep(:is(h1, h2, h3, h4, h5, h6)) {
  font-size: var(--font-size-md);
}

.assistant-message__content :deep(:is(ul, ol)) {
  display: grid;
  gap: var(--space-2xs);
  padding-inline-start: var(--space-md);
}

.assistant-message__content :deep(ul) {
  list-style: disc outside;
}

.assistant-message__content :deep(ol) {
  list-style: decimal outside;
}

.assistant-message__content :deep(li::marker) {
  color: var(--color-text-muted);
}

/* Inline code sits inside a sentence, so it takes a tint rather than a frame. */
.assistant-message__content :deep(code) {
  padding: 0 var(--space-2xs);
  border-radius: var(--radius-sm);
  background-color: var(--color-bg-surface-raised);
  font-size: var(--font-size-xs);
}

/* Fenced blocks stay uncoloured: the model writes them rarely and the language
   it names is anything at all, which is a grammar this app cannot have
   preloaded. Tool arguments are the code worth highlighting, and they are. */
.assistant-message__content :deep(pre) {
  overflow-x: auto;
  padding: var(--space-xs);
  border: var(--border-width-thin) solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  background-color: var(--color-bg-surface-raised);
  font-size: var(--font-size-xs);
}

/* The frame belongs to the block, not to the code inside it. */
.assistant-message__content :deep(pre code) {
  padding: 0;
  background: none;
}

.assistant-message__content :deep(blockquote) {
  padding-inline-start: var(--space-xs);
  border-inline-start: var(--border-width-thin) solid var(--color-border-default);
  color: var(--color-text-secondary);
}

/* A table of totals is the answer the model most often lays out, and the pane
   is too narrow to hold one: `display: block` makes it its own scroll box. */
.assistant-message__content :deep(table) {
  display: block;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.assistant-message__content :deep(:is(th, td)) {
  padding: var(--space-2xs) var(--space-xs);
  border: var(--border-width-thin) solid var(--color-border-subtle);
  text-align: start;
}

.assistant-message__content :deep(th) {
  background-color: var(--color-bg-surface-raised);
}

.assistant-message__content :deep(hr) {
  border: none;
  border-block-start: var(--border-width-thin) solid var(--color-border-subtle);
}
</style>
