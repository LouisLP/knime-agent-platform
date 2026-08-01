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

/**
 * The pane is the scroll container, so snapping lives here and the slides only
 * declare where they align. `proximity`, not `mandatory`: a slide can be taller
 * than the viewport, and mandatory snapping would fight anyone reading the
 * bottom of one.
 */
.walkthrough-pane {
  grid-row: 1;
  grid-column: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--space-xl) var(--space-gutter);
  background-color: var(--color-bg-canvas);
  scroll-snap-type: y proximity;
  scroll-padding-block-start: var(--space-xl);
}

/**
 * Attention follows the pointer: hovering one pane recedes the other, so the
 * walkthrough is not competing for attention while you are using the chat.
 * Typing counts as using the chat (`:focus-within`) — the caret stays there
 * even when the pointer wanders — but an explicit hover on the walkthrough
 * always wins, so pointing at it brings it back.
 *
 * Hover-capable pointers only, and only in the two-column layout: on a touch
 * screen or the stacked layout there is no "other pane beside this one".
 */
@media (hover: hover) and (width >= 900px) {
  .chat-pane,
  .walkthrough-pane {
    transition: opacity var(--duration-normal) var(--ease-out);
  }

  .app-shell:has(.walkthrough-pane:hover) .chat-pane,
  .app-shell:has(.chat-pane:hover) .walkthrough-pane,
  .app-shell:has(.chat-pane:focus-within):not(:has(.walkthrough-pane:hover)) .walkthrough-pane {
    opacity: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-pane,
  .walkthrough-pane {
    transition: none;
  }
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
