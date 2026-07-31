import type { Brand } from './brand.ts'
import { randomUUID } from 'node:crypto'

/** Identifies a conversation. Ours; a UUID. */
export type ConversationId = Brand<string, 'ConversationId'>

/** Identifies a single conversation item. Ours; a UUID. */
export type ItemId = Brand<string, 'ItemId'>

/** Identifies a tool call. Assigned by the model provider, not by us. */
export type ToolCallId = Brand<string, 'ToolCallId'>

export function newConversationId(): ConversationId {
  return randomUUID() as ConversationId
}

export function newItemId(): ItemId {
  return randomUUID() as ItemId
}

/**
 * The single cast site for conversation ids arriving from outside. Call only
 * on input that has already been validated as a UUID (see `chat.dto.ts`).
 */
export function toConversationId(raw: string): ConversationId {
  return raw as ConversationId
}

/** The single cast site for tool call ids arriving from the provider. */
export function toToolCallId(raw: string): ToolCallId {
  return raw as ToolCallId
}
