import type { ConversationItem } from '../domain/conversation-item.ts'
import type { Conversation } from '../domain/conversation.ts'
import type { ConversationId } from '../domain/ids.ts'
import { NotFoundError } from '../domain/errors.ts'
import { newConversationId } from '../domain/ids.ts'

/**
 * Persistence seam. Storage is out of scope for the exercise, so the only
 * implementation is in-memory — but the service layer depends on this interface
 * so swapping in a real store stays a one-file change.
 */
export interface ConversationRepository {
  create: () => Conversation
  findById: (id: ConversationId) => Conversation | undefined
  /** Throws `NotFoundError` instead of returning undefined. */
  getById: (id: ConversationId) => Conversation
  appendItems: (id: ConversationId, items: ConversationItem[]) => Conversation
}

export class InMemoryConversationRepository implements ConversationRepository {
  readonly #conversations = new Map<ConversationId, Conversation>()

  create(): Conversation {
    const conversation: Conversation = {
      id: newConversationId(),
      createdAt: new Date().toISOString(),
      items: [],
    }
    this.#conversations.set(conversation.id, conversation)
    return conversation
  }

  findById(id: ConversationId): Conversation | undefined {
    return this.#conversations.get(id)
  }

  getById(id: ConversationId): Conversation {
    const conversation = this.findById(id)
    if (!conversation)
      throw new NotFoundError(`Conversation ${id} not found`)

    return conversation
  }

  appendItems(id: ConversationId, items: ConversationItem[]): Conversation {
    const conversation = this.getById(id)
    conversation.items.push(...items)
    return conversation
  }
}
