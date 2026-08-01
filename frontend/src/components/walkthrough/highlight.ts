import type { HighlighterCore } from 'shiki/core'
import type { CodeExcerpt } from './slides'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

/**
 * Shiki, assembled by hand rather than pulled in as a bundle: only the four
 * grammars the excerpts actually use, and the JavaScript regex engine, which
 * skips the ~1MB Oniguruma WASM. Themes and grammars load as dynamic imports,
 * and this module is itself imported dynamically, so none of it lands in the
 * entry chunk — the chat pane is the app and must not wait on the walkthrough's
 * syntax highlighting.
 */
export type ExcerptLanguage = 'typescript' | 'vue' | 'css' | 'markdown'

/**
 * Kanagawa, after the Hokusai wave print: muted ink with warm accents, which is
 * the same brief Kabuki's sumi/kaki/seiji palette answers. Both themes are
 * emitted at once as `--shiki-light` / `--shiki-dark` custom properties and
 * resolved in CSS by `light-dark()`, so a theme switch costs no re-highlight.
 */
const THEMES = { light: 'kanagawa-lotus', dark: 'kanagawa-wave' } as const

let highlighterPromise: Promise<HighlighterCore> | undefined

function loadHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [
      import('shiki/themes/kanagawa-lotus.mjs'),
      import('shiki/themes/kanagawa-wave.mjs'),
    ],
    langs: [
      import('shiki/langs/typescript.mjs'),
      import('shiki/langs/vue.mjs'),
      import('shiki/langs/css.mjs'),
      import('shiki/langs/markdown.mjs'),
    ],
    engine: createJavaScriptRegexEngine(),
  })

  return highlighterPromise
}

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
  const highlighter = await loadHighlighter()

  return new Map(excerpts.map(excerpt => [
    excerpt,
    highlighter.codeToHtml(excerpt.code, {
      lang: excerpt.lang,
      themes: THEMES,
      // No `color:` on the spans — only the two custom properties, which the
      // stylesheet feeds to `light-dark()`.
      defaultColor: false,
    }),
  ]))
}
