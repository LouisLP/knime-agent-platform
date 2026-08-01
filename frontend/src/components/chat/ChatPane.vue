<script setup lang="ts">
import type { ConversationItem } from '@/types/conversation'
import { storeToRefs } from 'pinia'
import { nextTick, onMounted, ref, watch } from 'vue'
import ChatComposer from '@/components/chat/ChatComposer.vue'
import ConversationItemView from '@/components/chat/ConversationItemView.vue'
import CreditsIndicator from '@/components/chat/CreditsIndicator.vue'
import UserMessage from '@/components/chat/items/UserMessage.vue'
import { toolCallElementId } from '@/components/chat/tool-call-element-id'
import ToolActivityIndicator from '@/components/chat/ToolActivityIndicator.vue'
import TransportErrorBanner from '@/components/chat/TransportErrorBanner.vue'
import { useChatStore } from '@/stores/chat'
import { useCreditsStore } from '@/stores/credits'

/**
 * The chat pane: transcript, in-flight state, composer. It owns scrolling and
 * the one lookup the item components cannot do for themselves — pairing a
 * `tool_result` with the `tool_call` it answers.
 */
const chat = useChatStore()
const { items, toolCallsById, isReady, isStarting, isSending, pendingMessage, transportError }
  = storeToRefs(chat)

const credits = useCreditsStore()

const transcript = ref<HTMLElement | null>(null)

onMounted(() => {
  void chat.start()
  void credits.refresh()
})

// A completed turn is the only thing here that spends anything, so that is the
// one moment the balance can have moved.
watch(isSending, (sending, wasSending) => {
  if (wasSending && !sending)
    void credits.refresh()
})

/** A result whose call is in the transcript can point at it; a stray one cannot. */
function linkedCallElementId(item: ConversationItem): string | undefined {
  if (item.type !== 'tool_result' || !toolCallsById.value.has(item.toolCallId))
    return undefined

  return toolCallElementId(item.toolCallId)
}

async function scrollToLatest(): Promise<void> {
  await nextTick()
  transcript.value?.scrollTo({ top: transcript.value.scrollHeight, behavior: 'smooth' })
}

// Anything that lengthens the transcript pulls the view down with it: a whole
// turn arriving at once, and the echo of the message that started it.
watch([items, pendingMessage, isSending], scrollToLatest)
</script>

<template>
  <main class="chat-pane" aria-labelledby="chat-pane-heading">
    <header class="chat-pane__header">
      <h2 id="chat-pane-heading" class="chat-pane__title">
        Conversation
      </h2>
      <CreditsIndicator />
    </header>

    <div ref="transcript" class="chat-pane__body">
      <!-- role="log" so a screen reader announces items as a turn lands. -->
      <div class="chat-pane__transcript" role="log" aria-live="polite" :aria-busy="isSending">
        <p v-if="isStarting" class="chat-pane__hint">
          Opening a conversation…
        </p>

        <p v-else-if="items.length === 0 && pendingMessage === null" class="chat-pane__hint">
          The assistant can read the files in <code>sandbox/</code> through an MCP server.
          Try <em>“which region had the highest Q2 revenue?”</em>
        </p>

        <ConversationItemView
          v-for="item in items"
          :key="item.id"
          :item="item"
          :linked-call-element-id="linkedCallElementId(item)"
        />

        <!-- The turn in flight: the backend only echoes the user message back
             once the whole turn completes, so show it locally until then. -->
        <UserMessage v-if="pendingMessage !== null" :content="pendingMessage" pending />

        <ToolActivityIndicator v-if="isSending" />
      </div>
    </div>

    <footer class="chat-pane__footer">
      <TransportErrorBanner
        v-if="transportError !== null"
        :failure="transportError"
        :busy="isSending || isStarting"
        @retry="chat.retry"
        @restart="chat.restart"
        @dismiss="chat.dismissError"
      />
      <ChatComposer :disabled="!isReady" :sending="isSending" @submit="chat.send" />
    </footer>
  </main>
</template>

<style scoped>
.chat-pane {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-block-size: 0;
  background-color: var(--color-bg-surface);
}

.chat-pane__header {
  display: flex;
  gap: var(--space-md);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  border-block-end: var(--border-width-thin) solid var(--color-border-subtle);
}

.chat-pane__title {
  font-size: var(--font-size-lg);
  color: var(--color-text-secondary);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

/* The scroll container: only the transcript moves, header and composer stay. */
.chat-pane__body {
  overflow-y: auto;
  overscroll-behavior: contain;
  min-block-size: 0;
  padding: var(--space-lg);
}

.chat-pane__transcript {
  display: grid;
  gap: var(--space-sm);
  align-content: start;
  justify-items: stretch;
}

.chat-pane__hint {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  text-wrap: pretty;
}

.chat-pane__footer {
  display: grid;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-lg) var(--space-lg);
  border-block-start: var(--border-width-thin) solid var(--color-border-subtle);
}

/* Stacked layout — the pane is a full screen of its own, the page scrolls, so
   the composer sticks to the bottom of the viewport instead of the pane. */
@media (width < 900px) {
  .chat-pane__header {
    position: sticky;
    inset-block-start: 0;
    z-index: var(--z-sticky);
    background-color: var(--color-bg-surface);
  }

  .chat-pane__body {
    overflow-y: visible;
  }

  .chat-pane__footer {
    position: sticky;
    inset-block-end: 0;
    z-index: var(--z-sticky);
    background-color: var(--color-bg-surface);
  }
}
</style>
