import type { RequestHandler } from 'express'
import type { ChatService } from '../../service/chat.service.ts'
import type { ConversationParams, SendMessageBody } from '../dto/chat.dto.ts'

/**
 * Thin HTTP adapter: unwrap the request, call the service, shape the response.
 * No orchestration logic lives here.
 */
export class ChatController {
  readonly #chat: ChatService

  constructor(chat: ChatService) {
    this.#chat = chat
  }

  createConversation: RequestHandler = (_req, res) => {
    const conversation = this.#chat.createConversation()
    res.status(201).json(conversation)
  }

  getConversation: RequestHandler<ConversationParams> = (req, res) => {
    res.json(this.#chat.getConversation(req.params.id))
  }

  sendMessage: RequestHandler<ConversationParams, unknown, SendMessageBody> = async (req, res, next) => {
    try {
      res.status(201).json(await this.#chat.sendMessage(req.params.id, req.body.content))
    }
    catch (error) {
      next(error)
    }
  }
}
