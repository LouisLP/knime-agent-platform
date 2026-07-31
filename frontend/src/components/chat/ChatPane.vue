<script setup lang="ts">
import SurfaceCard from '@/components/ui/SurfaceCard.vue'
</script>

<template>
  <main class="chat-pane" aria-labelledby="chat-pane-heading">
    <header class="chat-pane__header">
      <h2 id="chat-pane-heading" class="chat-pane__title">
        Conversation
      </h2>
    </header>

    <div class="chat-pane__body">
      <SurfaceCard title="Chat lands here">
        The conversation list and composer arrive with the chat pane ticket — this shell
        only fixes where they live.
      </SurfaceCard>
    </div>
  </main>
</template>

<style scoped>
.chat-pane {
  display: grid;
  grid-template-rows: auto 1fr;
  min-block-size: 0;
  background-color: var(--color-bg-surface);
}

.chat-pane__header {
  padding: var(--space-md) var(--space-lg);
  border-block-end: var(--border-width-thin) solid var(--color-border-subtle);
}

.chat-pane__title {
  font-size: var(--font-size-lg);
  color: var(--color-text-secondary);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

/* The scroll container: only the message list moves, the header stays put. */
.chat-pane__body {
  overflow-y: auto;
  overscroll-behavior: contain;
  min-block-size: 0;
  padding: var(--space-lg);
}

/* Stacked layout — the pane is a full screen of its own, the page scrolls. */
@media (width < 900px) {
  .chat-pane__header {
    position: sticky;
    inset-block-start: 0;
    z-index: 1;
    background-color: var(--color-bg-surface);
  }

  .chat-pane__body {
    overflow-y: visible;
  }
}
</style>
