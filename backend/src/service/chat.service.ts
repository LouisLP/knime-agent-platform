import type { Env } from '../config/env.ts'
import type {
  AssistantMessageItem,
  ConversationItem,
  ErrorItem,
  ToolCallItem,
  ToolResultItem,
  UserMessageItem,
} from '../domain/conversation-item.ts'
import type { Conversation } from '../domain/conversation.ts'
import type { ConversationId } from '../domain/ids.ts'
import type { ConversationRepository } from '../repository/conversation.repository.ts'
import type { LlmClient } from './llm/openrouter.client.ts'
import type { ChatToolCall } from './llm/openrouter.types.ts'
import type { ToolProvider } from './mcp/mcp.client.ts'
import { createItem } from '../domain/conversation-item.ts'
import { ErrorCode } from '../domain/error-code.ts'
import { toAppError } from '../domain/errors.ts'
import { toToolCallId } from '../domain/ids.ts'
import { toChatMessages } from './conversation.mapper.ts'

const SYSTEM_PROMPT = [
  'You are a helpful assistant in a chat application.',
  'You have access to tools provided by an MCP server; use them when they help answer the user.',
  'Keep answers concise.',
].join(' ')

export interface SendMessageResult {
  conversationId: ConversationId
  /** Only the items produced by this turn, in the order they happened. */
  items: ConversationItem[]
}

/**
 * Orchestrates one user turn: model call -> optional tool calls -> model call,
 * looping until the model answers without requesting tools or the iteration
 * budget runs out. Every step is recorded as a conversation item so the
 * frontend can show tool activity as it happened.
 */
export class ChatService {
  readonly #conversations: ConversationRepository
  readonly #llm: LlmClient
  readonly #tools: ToolProvider
  readonly #maxToolIterations: number

  constructor(
    conversations: ConversationRepository,
    llm: LlmClient,
    tools: ToolProvider,
    env: Pick<Env, 'MAX_TOOL_ITERATIONS'>,
  ) {
    this.#conversations = conversations
    this.#llm = llm
    this.#tools = tools
    this.#maxToolIterations = env.MAX_TOOL_ITERATIONS
  }

  createConversation(): Conversation {
    return this.#conversations.create()
  }

  getConversation(id: ConversationId): Conversation {
    return this.#conversations.getById(id)
  }

  async sendMessage(conversationId: ConversationId, content: string): Promise<SendMessageResult> {
    const conversation = this.#conversations.getById(conversationId)

    const userItem = createItem<UserMessageItem>(conversationId, {
      type: 'user_message',
      content,
    })
    const turnItems: ConversationItem[] = [userItem]
    this.#conversations.appendItems(conversationId, [userItem])

    try {
      await this.#runTurn(conversation, turnItems)
    }
    catch (error) {
      const appError = toAppError(error)
      this.#record(conversationId, turnItems, createItem<ErrorItem>(conversationId, {
        type: 'error',
        code: appError.code,
        message: appError.message,
      }))
    }

    return { conversationId, items: turnItems }
  }

  async #runTurn(conversation: Conversation, turnItems: ConversationItem[]): Promise<void> {
    const availableTools = await this.#tools.listTools()

    for (let iteration = 0; iteration < this.#maxToolIterations; iteration++) {
      const messages = toChatMessages(conversation.items, SYSTEM_PROMPT)
      const completion = await this.#llm.complete(messages, availableTools)
      const message = completion.choices[0]!.message
      const requestedCalls = message.tool_calls ?? []

      if (requestedCalls.length === 0) {
        this.#record(conversation.id, turnItems, createItem<AssistantMessageItem>(conversation.id, {
          type: 'assistant_message',
          content: message.content ?? '',
        }))
        return
      }

      // Parallel tool calls are out of scope, so run them in order.
      for (const call of requestedCalls)
        await this.#runToolCall(conversation.id, turnItems, call)
    }

    this.#record(conversation.id, turnItems, createItem<ErrorItem>(conversation.id, {
      type: 'error',
      code: ErrorCode.ToolIterationLimit,
      message: `Stopped after ${this.#maxToolIterations} tool rounds without a final answer.`,
    }))
  }

  async #runToolCall(
    conversationId: ConversationId,
    turnItems: ConversationItem[],
    call: ChatToolCall,
  ): Promise<void> {
    const parsed = parseArguments(call.function.arguments)
    const toolCallId = toToolCallId(call.id)

    this.#record(conversationId, turnItems, createItem<ToolCallItem>(conversationId, {
      type: 'tool_call',
      toolCallId,
      toolName: call.function.name,
      arguments: parsed.ok ? parsed.value : call.function.arguments,
    }))

    const result = parsed.ok
      ? await this.#tools.callTool(call.function.name, parsed.value)
      // Hand the parse failure back as a tool result so the model can retry
      // with well-formed arguments instead of the turn dying here.
      : { content: `Invalid tool arguments: ${parsed.error}`, isError: true }

    this.#record(conversationId, turnItems, createItem<ToolResultItem>(conversationId, {
      type: 'tool_result',
      toolCallId,
      toolName: call.function.name,
      content: result.content,
      isError: result.isError,
    }))
  }

  #record(conversationId: ConversationId, turnItems: ConversationItem[], item: ConversationItem): void {
    turnItems.push(item)
    this.#conversations.appendItems(conversationId, [item])
  }
}

type ParseResult
  = | { ok: true, value: unknown }
    | { ok: false, error: string }

function parseArguments(raw: string): ParseResult {
  if (!raw.trim())
    return { ok: true, value: {} }

  try {
    return { ok: true, value: JSON.parse(raw) }
  }
  catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'not valid JSON' }
  }
}
