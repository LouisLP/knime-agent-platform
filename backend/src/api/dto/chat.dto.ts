import { z } from 'zod'
import { toConversationId } from '../../domain/ids.ts'

/**
 * The trust boundary: a raw path segment is validated as a UUID and branded
 * here, so nothing downstream can pass an unvalidated string as a
 * `ConversationId`.
 */
export const conversationParamsSchema = z.object({
  id: z.uuid().transform(toConversationId),
})

export const sendMessageBodySchema = z.object({
  content: z.string().trim().min(1, 'content must not be empty').max(8000),
})

export type ConversationParams = z.infer<typeof conversationParamsSchema>
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>
