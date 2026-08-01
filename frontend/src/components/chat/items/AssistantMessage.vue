<script setup lang="ts">
/**
 * The model's prose. Rendered as plain text, not Markdown: the model is told to
 * keep answers short, and shipping a Markdown pipeline for that would buy a
 * sanitisation problem the exercise does not need.
 */
defineProps<{ content: string }>()
</script>

<template>
  <article class="assistant-message">
    <h3 class="visually-hidden">
      Assistant
    </h3>
    <p class="assistant-message__content">
      {{ content }}
    </p>
  </article>
</template>

<style scoped>
.assistant-message {
  padding-inline-start: var(--space-sm);
  border-inline-start: var(--border-width-thick) solid var(--color-border-default);
  color: var(--color-text-primary);
}

.assistant-message__content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}
</style>
