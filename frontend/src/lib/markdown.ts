import DOMPurify from 'dompurify'
import { marked } from 'marked'

/**
 * Markdown → HTML for assistant prose, in two steps with one job each: `marked`
 * turns the text into HTML, DOMPurify decides which of that HTML is allowed to
 * exist. The model's output is untrusted — it quotes files it read through MCP,
 * and those are whatever is in `sandbox/` — so nothing reaches `v-html` without
 * passing the sanitiser.
 *
 * A module rather than a component-local computed because the hook below has to
 * be registered exactly once, not once per message on screen.
 */

/**
 * A link in an answer points somewhere else, and this pane is the app — the
 * conversation only exists in the tab that opened it. So links leave in a new
 * tab, and `noreferrer` covers `opener` along with the referrer.
 */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noreferrer')
  }
})

/**
 * `breaks`, because in chat prose a single newline means a line break and not a
 * paragraph continuation; `gfm` for the tables and strikethrough the model
 * reaches for when it summarises data. `async: false` picks marked's
 * synchronous overload, which keeps callers free of a promise.
 */
export function renderMarkdown(content: string): string {
  return DOMPurify.sanitize(marked(content, { async: false, gfm: true, breaks: true }))
}
