import type { ChatController } from '../controllers/chat.controller.ts'
import { Router } from 'express'
import { conversationParamsSchema, sendMessageBodySchema } from '../dto/chat.dto.ts'
import { validate } from '../middleware/validate.ts'

export function createChatRouter(controller: ChatController): Router {
  const router = Router()

  router.post('/conversations', controller.createConversation)

  router.get(
    '/conversations/:id',
    validate('params', conversationParamsSchema),
    controller.getConversation,
  )

  router.post(
    '/conversations/:id/messages',
    validate('params', conversationParamsSchema),
    validate('body', sendMessageBodySchema),
    controller.sendMessage,
  )

  return router
}
