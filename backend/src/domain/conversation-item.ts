import type { ErrorCode } from './error-code.ts'
import type { ConversationId, ItemId, ToolCallId } from './ids.ts'
import { newItemId } from './ids.ts'

/**
 * The five item types the frontend renders. This union is the contract between
 * backend and frontend — everything the orchestrator produces is one of these,
 * and they are appended to the conversation in the order they happened.
 */
export type ConversationItem
  = | UserMessageItem
    | AssistantMessageItem
    | ToolCallItem
    | ToolResultItem
    | ErrorItem

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
  /** Text rendering of the MCP result content, as handed back to the model. */
  content: string
  isError: boolean
}

export interface ErrorItem extends ItemBase {
  type: 'error'
  code: ErrorCode
  message: string
}

type ItemPayload<T extends ConversationItem> = Omit<T, keyof ItemBase>

/** Stamps id/createdAt so callers only supply the meaningful fields. */
export function createItem<T extends ConversationItem>(
  conversationId: ConversationId,
  payload: ItemPayload<T>,
): T {
  return {
    id: newItemId(),
    conversationId,
    createdAt: new Date().toISOString(),
    ...payload,
  } as T
}
