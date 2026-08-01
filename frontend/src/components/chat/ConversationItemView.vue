<script setup lang="ts">
import type { ConversationItem } from '@/types/conversation.types'
import AssistantMessage from '@/components/chat/items/AssistantMessage.vue'
import ErrorNotice from '@/components/chat/items/ErrorNotice.vue'
import ToolCallCard from '@/components/chat/items/ToolCallCard.vue'
import ToolResultCard from '@/components/chat/items/ToolResultCard.vue'
import UserMessage from '@/components/chat/items/UserMessage.vue'
import { toolCallElementId } from '@/components/chat/tool-call-element-id'

/**
 * The one place that switches on the discriminant. A `v-if` chain rather than
 * `<component :is>` over a lookup table, because it is what keeps each child's
 * props type-checked against its own member of the union.
 *
 * `linkedCallElementId` is passed in rather than resolved here: the pane holds
 * the whole conversation and indexes `toolCallId` once for all results.
 */
defineProps<{ item: ConversationItem, linkedCallElementId?: string }>()
</script>

<template>
  <UserMessage v-if="item.type === 'user_message'" :content="item.content" />

  <AssistantMessage v-else-if="item.type === 'assistant_message'" :content="item.content" />

  <ToolCallCard
    v-else-if="item.type === 'tool_call'"
    :id="toolCallElementId(item.toolCallId)"
    :tool-name="item.toolName"
    :args="item.arguments"
  />

  <ToolResultCard
    v-else-if="item.type === 'tool_result'"
    :tool-name="item.toolName"
    :content="item.content"
    :is-error="item.isError"
    :linked-call-element-id="linkedCallElementId"
  />

  <ErrorNotice v-else :code="item.code" :message="item.message" />
</template>
