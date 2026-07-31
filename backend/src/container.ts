import type { Env } from './config/env.ts'
import type { ToolProvider } from './service/mcp/mcp.client.ts'
import { ChatController } from './api/controllers/chat.controller.ts'
import { InMemoryConversationRepository } from './repository/conversation.repository.ts'
import { ChatService } from './service/chat.service.ts'
import { OpenRouterClient } from './service/llm/openrouter.client.ts'
import { McpToolProvider } from './service/mcp/mcp.client.ts'

export interface Container {
  chatController: ChatController
  toolProvider: ToolProvider
}

/**
 * Composition root. Every dependency is constructed here and injected downward,
 * so each layer stays testable with hand-rolled fakes.
 */
export function createContainer(env: Env): Container {
  const conversations = new InMemoryConversationRepository()
  const llm = new OpenRouterClient(env)
  const toolProvider = new McpToolProvider(env)
  const chatService = new ChatService(conversations, llm, toolProvider, env)

  return {
    chatController: new ChatController(chatService),
    toolProvider,
  }
}
