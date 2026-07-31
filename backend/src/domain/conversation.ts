import type { ConversationItem } from './conversation-item.ts'
import type { ConversationId } from './ids.ts'

export interface Conversation {
  id: ConversationId
  createdAt: string
  items: ConversationItem[]
}
