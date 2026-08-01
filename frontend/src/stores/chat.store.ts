import type {
  ConversationId,
  ConversationItem,
  ToolCallId,
  ToolCallItem,
} from '@/types/conversation.types'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { chatClient } from '@/api/chat.client'
import { ApiError } from '@/api/http'

/**
 * A request that never landed. `conversationLost` marks the one failure that
 * retrying cannot fix: the backend keeps conversations in memory, so a restart
 * turns every id it handed out into a 404 and the only way forward is a new
 * conversation.
 */
export interface TransportFailure {
  message: string
  conversationLost: boolean
}

/**
 * One conversation and the state of the turn in flight.
 *
 * Items are stored exactly as the backend returned them — the store appends,
 * it never rewrites. The two pieces of local state are the message the user
 * just sent (echoed while the round trip runs, since the backend only reports
 * it back when the whole turn completes) and the transport error, which is not
 * part of the transcript.
 */
export const useChatStore = defineStore('chat', () => {
  const conversationId = ref<ConversationId | null>(null)
  /**
   * Items are replaced wholesale, never mutated in place — shallow is enough,
   * and `readonly` holds consumers to the same rule the store follows.
   */
  const items = shallowRef<readonly ConversationItem[]>([])

  const isStarting = ref(false)
  const isSending = ref(false)
  /** The user's text while its turn is in flight; kept for retry after a failure. */
  const pendingMessage = ref<string | null>(null)
  /** A failed request, not an `error` item — the turn never reached the transcript. */
  const transportError = ref<TransportFailure | null>(null)

  const isReady = computed(() => conversationId.value !== null)

  /**
   * Tool calls by id, so a `tool_result` can name what it answers without the
   * list component walking the array for every result it renders.
   */
  const toolCallsById = computed<ReadonlyMap<ToolCallId, ToolCallItem>>(
    () => new Map(
      items.value
        .filter((item): item is ToolCallItem => item.type === 'tool_call')
        .map(call => [call.toolCallId, call]),
    ),
  )

  /** Opens a conversation on the backend. Safe to call twice; the second is a no-op. */
  async function start(): Promise<void> {
    if (isReady.value || isStarting.value)
      return

    isStarting.value = true
    transportError.value = null

    try {
      const conversation = await chatClient.createConversation()
      conversationId.value = conversation.id
      items.value = conversation.items
    }
    catch (error) {
      transportError.value = failureFor(error)
    }
    finally {
      isStarting.value = false
    }
  }

  /**
   * Sends one user turn and appends the items it produced. A rejected request
   * leaves the text in `pendingMessage` so `retry()` can send it again.
   */
  async function send(content: string): Promise<void> {
    const trimmed = content.trim()
    const id = conversationId.value
    if (trimmed === '' || isSending.value || id === null)
      return

    isSending.value = true
    pendingMessage.value = trimmed
    transportError.value = null

    try {
      const turn = await chatClient.sendMessage(id, trimmed)
      items.value = [...items.value, ...turn.items]
      pendingMessage.value = null
    }
    catch (error) {
      transportError.value = failureFor(error)
    }
    finally {
      isSending.value = false
    }
  }

  /** Re-sends the message the last failed turn was carrying. */
  async function retry(): Promise<void> {
    const pending = pendingMessage.value

    if (pending === null) {
      // The failure was the conversation itself never opening.
      transportError.value = null
      await start()
      return
    }

    await send(pending)
  }

  /** Abandons a conversation the backend no longer has and opens a fresh one. */
  async function restart(): Promise<void> {
    conversationId.value = null
    items.value = []
    pendingMessage.value = null
    transportError.value = null
    await start()
  }

  /** Drops a failed turn: clears the banner and forgets the unsent message. */
  function dismissError(): void {
    transportError.value = null
    pendingMessage.value = null
  }

  return {
    conversationId,
    items,
    toolCallsById,
    isStarting,
    isSending,
    isReady,
    pendingMessage,
    transportError,
    start,
    send,
    retry,
    restart,
    dismissError,
  }
})

function failureFor(error: unknown): TransportFailure {
  if (!(error instanceof ApiError))
    return { message: 'Something went wrong sending that message.', conversationLost: false }

  return { message: error.message, conversationLost: error.code === 'not_found' }
}
