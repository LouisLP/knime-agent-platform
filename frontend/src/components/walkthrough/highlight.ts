import type { CodeExcerpt } from './slides'
import type { Language } from '@/lib/shiki'
import { highlightCode } from '@/lib/shiki'

/**
 * The grammars the slides quote — a subset of what the shared highlighter can
 * load, so an excerpt cannot name a language nothing knows how to fetch.
 */
export type ExcerptLanguage = Extract<Language, 'typescript' | 'vue' | 'css' | 'markdown'>

/**
 * Highlights every excerpt in one pass, keyed by the excerpt object itself —
 * the slides are module constants, so identity is a stable key and no excerpt
 * is ever highlighted twice. Called once when the pane mounts; components read
 * the result and never call Shiki themselves.
 *
 * A failure here is not worth breaking the pane over: the excerpts render as
 * plain monospace text without it.
 */
export async function highlightExcerpts(
  excerpts: readonly CodeExcerpt[],
): Promise<ReadonlyMap<CodeExcerpt, string>> {
  const highlighted = await Promise.all(excerpts.map(
    async excerpt => [excerpt, await highlightCode(excerpt.code, excerpt.lang)] as const,
  ))

  return new Map(highlighted)
}
