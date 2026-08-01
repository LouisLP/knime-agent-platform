/**
 * The wire contract, mirrored from `backend/src/domain/conversation-item.ts`.
 *
 * Deliberately a mirror and not a translation: the API hands back exactly these
 * shapes, so components render the server's items directly and no mapping layer
 * can drift out of sync. Ids are plain strings here — the backend brands them to
 * protect its own boundaries, the frontend only ever passes them through.
 */

export type ConversationId = string
export type ItemId = string
export type ToolCallId = string

/** Mirrors the backend's closed set of error codes (`domain/error-code.ts`). */
export type ErrorCode
  = | 'not_found'
    | 'validation_error'
    | 'provider_error'
    | 'tool_error'
    | 'internal_error'
    | 'tool_iteration_limit'

export interface ItemBase {
  id: ItemId
  conversationId: ConversationId
  createdAt: string
}

export interface UserMessageItem extends ItemBase {
  type: 'user_message'
  content: string
}

export interface AssistantMessageItem extends ItemBase {
  type: 'assistant_message'
  content: string
}

export interface ToolCallItem extends ItemBase {
  type: 'tool_call'
  /** Provider-assigned id; links this call to its `tool_result`. */
  toolCallId: ToolCallId
  toolName: string
  arguments: unknown
}

export interface ToolResultItem extends ItemBase {
  type: 'tool_result'
  toolCallId: ToolCallId
  toolName: string
  /** Text rendering of the MCP result, as handed back to the model. */
  content: string
  isError: boolean
}

/**
 * A failure the backend chose to record in the transcript rather than throw —
 * a provider outage mid-turn, a tool that blew up, the iteration budget. It is
 * part of the conversation, unlike a transport failure (see `ApiError`).
 */
export interface ErrorItem extends ItemBase {
  type: 'error'
  code: ErrorCode
  message: string
}

export type ConversationItem
  = | UserMessageItem
    | AssistantMessageItem
    | ToolCallItem
    | ToolResultItem
    | ErrorItem

export interface Conversation {
  id: ConversationId
  createdAt: string
  items: ConversationItem[]
}

/** `POST /messages` returns only the items that turn produced. */
export interface SendMessageResult {
  conversationId: ConversationId
  items: ConversationItem[]
}

/** The body of any non-2xx response (`api/middleware/error-handler.ts`). */
export interface ApiErrorBody {
  error: {
    code: ErrorCode
    message: string
    details?: unknown
  }
}
