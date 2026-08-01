import type {
  Conversation,
  ConversationId,
  SendMessageResult,
} from '@/types/conversation'
import { request } from '@/api/http'

/** The conversation half of the backend contract. Transport lives in `http.ts`. */

export interface ChatClient {
  createConversation: () => Promise<Conversation>
  getConversation: (id: ConversationId) => Promise<Conversation>
  sendMessage: (id: ConversationId, content: string) => Promise<SendMessageResult>
}

export const chatClient: ChatClient = {
  createConversation: () => request<Conversation>('POST', '/api/conversations'),
  getConversation: id => request<Conversation>('GET', `/api/conversations/${id}`),
  sendMessage: (id, content) =>
    request<SendMessageResult>('POST', `/api/conversations/${id}/messages`, { content }),
}
