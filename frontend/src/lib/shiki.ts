import type { HighlighterCore } from 'shiki/core'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

/**
 * Shiki, assembled by hand rather than pulled in as a bundle: the JavaScript
 * regex engine instead of the ~1MB Oniguruma WASM, and grammars fetched one at
 * a time, the first time something asks for one. Themes and grammars are
 * dynamic imports and every caller imports *this* module dynamically too, so
 * none of it lands in the entry chunk — a pane that never shows code never
 * pays for the highlighter.
 *
 * Two panes share it now (walkthrough excerpts, tool-call arguments), so the
 * highlighter is a module singleton: created once, grammars loaded once.
 */
export type Language = 'typescript' | 'vue' | 'css' | 'markdown' | 'json'

const LANGUAGE_LOADERS = {
  typescript: () => import('shiki/langs/typescript.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  json: () => import('shiki/langs/json.mjs'),
} as const satisfies Record<Language, () => Promise<unknown>>

/**
 * Kanagawa, after the Hokusai wave print: muted ink with warm accents, which is
 * the same brief Kabuki's sumi/kaki/seiji palette answers. Both themes are
 * emitted at once as `--shiki-light` / `--shiki-dark` custom properties and
 * resolved in CSS by `light-dark()` (see `base.css`), so a theme switch costs
 * no re-highlight.
 */
const THEMES = { light: 'kanagawa-lotus', dark: 'kanagawa-wave' } as const

let highlighterPromise: Promise<HighlighterCore> | undefined

function loadHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [
      import('shiki/themes/kanagawa-lotus.mjs'),
      import('shiki/themes/kanagawa-wave.mjs'),
    ],
    // Grammars arrive through `loadLanguage`, on demand.
    langs: [],
    engine: createJavaScriptRegexEngine(),
  })

  return highlighterPromise
}

/**
 * Keyed by language rather than by a boolean, so two callers racing for the
 * same grammar await the same load and a second grammar does not wait on the
 * first.
 */
const grammarLoads = new Map<Language, Promise<void>>()

function loadGrammar(highlighter: HighlighterCore, lang: Language): Promise<void> {
  let load = grammarLoads.get(lang)

  if (load === undefined) {
    load = highlighter.loadLanguage(LANGUAGE_LOADERS[lang]())
    grammarLoads.set(lang, load)
  }

  return load
}

/**
 * Highlights one block. Callers hold the resulting HTML and render it with
 * `v-html`; nothing re-highlights on re-render.
 *
 * Shiki escapes the code it wraps, so its output is safe to inject even for
 * text that came from the model — the escaping is the sanitisation.
 */
export async function highlightCode(code: string, lang: Language): Promise<string> {
  const highlighter = await loadHighlighter()
  await loadGrammar(highlighter, lang)

  return highlighter.codeToHtml(code, {
    lang,
    themes: THEMES,
    // No `color:` on the spans — only the two custom properties, which the
    // stylesheet feeds to `light-dark()`.
    defaultColor: false,
  })
}
