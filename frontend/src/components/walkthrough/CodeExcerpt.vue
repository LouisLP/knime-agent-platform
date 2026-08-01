<script setup lang="ts">
import type { CodeExcerpt } from './slides'

/**
 * One quoted excerpt, captioned with where it came from.
 *
 * `html` arrives already highlighted — this component never calls Shiki, so a
 * re-render costs nothing and the pane highlights once for the whole page.
 * Until it arrives (or if highlighting failed) the same code renders as plain
 * monospace: same font, same size, so nothing moves when the colour lands.
 */
defineProps<{ excerpt: CodeExcerpt, html?: string }>()
</script>

<template>
  <figure class="excerpt">
    <!-- eslint-disable-next-line vue/no-v-html -- Shiki's output over module
         constants: no user input reaches this, and Shiki escapes the code it
         wraps. -->
    <div v-if="html" class="excerpt__code" v-html="html" />
    <pre v-else class="excerpt__code excerpt__code--plain" tabindex="0"><code>{{ excerpt.code }}</code></pre>

    <figcaption class="excerpt__source">
      <code>{{ excerpt.source }}</code>
    </figcaption>
  </figure>
</template>

<style scoped>
.excerpt {
  display: grid;
  gap: var(--space-2xs);
  min-inline-size: 0;
}

/**
 * Shiki emits its own `<pre class="shiki">`, so the wrapper carries the frame
 * and the `pre` inside it only carries the scroll. The plain fallback is the
 * `pre` itself, hence the shared class.
 */
.excerpt__code {
  /* Grid items default to a min-width of their content, which a long line of
     code would happily make 800px wide — the `pre` inside is the thing allowed
     to scroll, not the layout. */
  min-inline-size: 0;
  border: var(--border-width-thin) solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-surface);
}

/**
 * Excerpts are trimmed to fit, but a narrow pane can still outrun them, and a
 * slide someone has to scroll sideways during a walkthrough is a slide they
 * stop reading. So long lines wrap at spaces; `overflow-x` stays for the token
 * that has none.
 */
.excerpt__code :deep(pre),
.excerpt__code--plain {
  overflow-x: auto;
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-relaxed);
  white-space: pre-wrap;
  tab-size: 2;
}

/**
 * Both themes are in the markup as custom properties; `light-dark()` picks one
 * from the document's `color-scheme`. Nothing is re-highlighted when the theme
 * changes, and the plain fallback inherits ordinary body text.
 */
.excerpt__code :deep(.shiki span) {
  color: light-dark(var(--shiki-light), var(--shiki-dark));
}

/* Shiki makes the block focusable so it can be scrolled by keyboard. */
.excerpt__code :deep(pre:focus-visible),
.excerpt__code--plain:focus-visible {
  outline: var(--focus-ring);
  outline-offset: calc(var(--focus-ring-offset) * -1);
}

.excerpt__source {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
}
</style>
