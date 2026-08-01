<script setup lang="ts">
import { Separator } from 'reka-ui'
import ChatPane from '@/components/chat/ChatPane.vue'

/**
 * The shell is the app: a fixed, narrow chat pane beside a scrollable
 * walkthrough pane. Routes swap what the walkthrough shows, never the layout.
 */
</script>

<template>
  <div class="app-shell">
    <h1 class="visually-hidden">
      KNIME agentic chat
    </h1>

    <ChatPane />

    <!-- Decorative (aria-hidden), so the fixed orientation carries no meaning
         when CSS flips the divider from vertical to horizontal under 900px. -->
    <Separator class="app-shell__divider" orientation="vertical" decorative />

    <aside class="walkthrough-pane" aria-labelledby="walkthrough-pane-heading">
      <h2 id="walkthrough-pane-heading" class="visually-hidden">
        Walkthrough
      </h2>
      <RouterView />
    </aside>
  </div>
</template>

<style scoped>
/**
 * Split screen: walkthrough takes the width, the chat column is narrow, fixed
 * and on the right — where a chat panel is expected, and where it does not push
 * the reading column away from the left edge. The shell itself never scrolls;
 * each pane owns its own overflow.
 *
 * The chat stays first in the DOM — it is the app, it should be the first thing
 * reached by keyboard or screen reader, and it is what the stacked layout puts
 * on the first screen. Only the columns are reordered, explicitly, below.
 */
.app-shell {
  display: grid;
  grid-template-columns: 1fr auto clamp(20rem, 26vw, 26rem);
  block-size: 100dvh;
  isolation: isolate;
}

.chat-pane {
  grid-column: 3;
}

.app-shell > * {
  /* Grid children default to min-height: auto, which defeats inner scrolling. */
  min-block-size: 0;
}

.app-shell__divider {
  align-self: stretch;
  inline-size: var(--border-width-thin);
  background-color: var(--color-border-default);
}

.walkthrough-pane {
  grid-row: 1;
  grid-column: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--space-xl) var(--space-gutter);
  background-color: var(--color-bg-canvas);
}

/**
 * Under 900px there is no room for two columns, so the panes stack: the chat
 * takes the first screen (it is the app), the walkthrough follows below it and
 * the page — not the panes — scrolls.
 */
@media (width < 900px) {
  .app-shell {
    grid-template-columns: 1fr;
    grid-template-rows: 100dvh auto auto;
    block-size: auto;
    min-block-size: 100dvh;
  }

  .app-shell__divider {
    inline-size: auto;
    block-size: var(--border-width-thin);
  }

  /* One column, so the desktop reordering has to be undone: DOM order (chat,
     divider, walkthrough) is exactly the stacking order we want. */
  .chat-pane,
  .walkthrough-pane {
    grid-row: auto;
    grid-column: 1;
  }

  .walkthrough-pane {
    overflow-y: visible;
  }
}
</style>
