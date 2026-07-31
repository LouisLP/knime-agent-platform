<script setup lang="ts">
/**
 * A raised surface with a title — the shell's one building block until the
 * chat items (#10) and walkthrough slides (#11) bring their own.
 */
defineProps<{ title: string }>()
</script>

<template>
  <article class="surface-card">
    <h3 class="surface-card__title">
      {{ title }}
    </h3>
    <div class="surface-card__body">
      <slot />
    </div>
  </article>
</template>

<style scoped>
.surface-card {
  display: grid;
  gap: var(--space-xs);
  padding: var(--space-lg);
  border: var(--border-width-thin) solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background-color: var(--color-bg-surface-raised);
  box-shadow: var(--shadow-sm);
}

.surface-card__title {
  font-size: var(--font-size-lg);
  text-wrap: balance;
}

.surface-card__body {
  color: var(--color-text-secondary);
  text-wrap: pretty;
}
</style>
