<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

/**
 * Enter sends, Shift+Enter makes a newline — the convention every chat client
 * shares, and the reason this is a textarea rather than an input.
 *
 * `maxlength` mirrors the backend's 8000-character limit (`chat.dto.ts`) so an
 * over-long message is stopped here instead of coming back as a 400.
 */
const props = defineProps<{ disabled: boolean, sending: boolean }>()

const emit = defineEmits<{ submit: [content: string] }>()

const MAX_LENGTH = 8000

const draft = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)

const canSubmit = computed(() => draft.value.trim() !== '' && !props.disabled && !props.sending)

function submit(): void {
  if (!canSubmit.value)
    return

  emit('submit', draft.value)
  draft.value = ''
}

/**
 * Enter alone submits; any modifier (Shift for a newline, or IME composition)
 * falls through to the textarea's own behaviour.
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing)
    return

  event.preventDefault()
  submit()
}

// Focus returns to the composer as soon as the turn finishes, so the next
// message can be typed without reaching for the mouse.
watch(() => props.sending, async (sending, wasSending) => {
  if (wasSending && !sending) {
    await nextTick()
    textarea.value?.focus()
  }
})
</script>

<template>
  <form class="composer" @submit.prevent="submit">
    <label class="visually-hidden" for="composer-input">Message</label>
    <textarea
      id="composer-input"
      ref="textarea"
      v-model="draft"
      class="composer__input"
      :maxlength="MAX_LENGTH"
      :disabled="disabled || sending"
      rows="2"
      placeholder="Ask about the files in the sandbox…"
      @keydown="onKeydown"
    />
    <button type="submit" class="composer__send" :disabled="!canSubmit">
      <Icon :icon="sending ? 'ph:circle-notch-bold' : 'ph:paper-plane-tilt-fill'" :class="{ composer__spinner: sending }" aria-hidden="true" />
      <span class="visually-hidden">{{ sending ? 'Sending' : 'Send message' }}</span>
    </button>
  </form>
</template>

<style scoped>
.composer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-xs);
  align-items: end;
}

.composer__input {
  padding: var(--space-xs) var(--space-sm);
  border: var(--border-width-thin) solid var(--color-border-default);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-canvas);
  color: var(--color-text-primary);
  font: inherit;
  font-size: var(--font-size-sm);
  resize: none;
  field-sizing: content;
  max-block-size: 8lh;
}

.composer__input:disabled {
  opacity: 0.6;
}

.composer__send {
  display: grid;
  place-items: center;
  inline-size: 2.5rem;
  block-size: 2.5rem;
  border: none;
  border-radius: var(--radius-md);
  background-color: var(--color-accent-default);
  color: var(--color-text-on-accent);
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-out);
}

.composer__send:hover:not(:disabled) {
  background-color: var(--color-accent-hover);
}

.composer__send:disabled {
  background-color: var(--color-bg-surface-hover);
  color: var(--color-text-muted);
  cursor: default;
}

@media (prefers-reduced-motion: no-preference) {
  .composer__spinner {
    animation: composer-spin var(--duration-slow) linear infinite;
  }
}

@keyframes composer-spin {
  to {
    rotate: 360deg;
  }
}
</style>
