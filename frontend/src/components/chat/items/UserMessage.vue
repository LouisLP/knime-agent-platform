<script setup lang="ts">
/**
 * The user's own turn. Also renders the message still in flight — the backend
 * only echoes it back when the whole turn finishes, and a narrow pane that
 * shows nothing for several seconds reads as a dropped message.
 */
withDefaults(defineProps<{ content: string, pending?: boolean }>(), { pending: false })
</script>

<template>
  <article class="user-message" :class="{ 'user-message--pending': pending }">
    <h3 class="visually-hidden">
      You
    </h3>
    <p class="user-message__content">
      {{ content }}
    </p>
  </article>
</template>

<style scoped>
.user-message {
  justify-self: end;
  max-inline-size: 90%;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg);
  background-color: var(--color-accent-subtle-bg);
  color: var(--color-accent-subtle-fg);
}

/* Dimmed until the server confirms it by returning the turn. */
.user-message--pending {
  opacity: 0.6;
}

.user-message__content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
