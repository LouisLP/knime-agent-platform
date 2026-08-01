<script setup lang="ts">
/**
 * Shown while a turn is in flight. Responses are not streamed, so the pane
 * cannot say *which* tool is running yet — it can only be honest that the model
 * is working and may be reaching for tools. When the turn lands, the calls and
 * results appear in the transcript in the order they happened.
 */
</script>

<template>
  <p class="tool-activity" role="status">
    <span class="tool-activity__dots" aria-hidden="true">
      <span class="tool-activity__dot" />
      <span class="tool-activity__dot" />
      <span class="tool-activity__dot" />
    </span>
    Working — the assistant may be calling tools
  </p>
</template>

<style scoped>
.tool-activity {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.tool-activity__dots {
  display: flex;
  gap: var(--space-2xs);
}

.tool-activity__dot {
  inline-size: 0.375rem;
  block-size: 0.375rem;
  border-radius: var(--radius-full);
  background-color: var(--color-accent-default);
}

@media (prefers-reduced-motion: no-preference) {
  .tool-activity__dot {
    animation: tool-activity-pulse var(--duration-ambient) var(--ease-in-out) infinite;
  }

  .tool-activity__dot:nth-child(2) {
    animation-delay: calc(var(--duration-ambient) / 6);
  }

  .tool-activity__dot:nth-child(3) {
    animation-delay: calc(var(--duration-ambient) / 3);
  }
}

@keyframes tool-activity-pulse {
  0%,
  60%,
  100% {
    opacity: 0.3;
  }

  30% {
    opacity: 1;
  }
}
</style>
