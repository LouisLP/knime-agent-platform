<script setup lang="ts">
import type { CodeExcerpt } from '@/components/walkthrough/slides'
import { onMounted, shallowRef } from 'vue'
import DecisionSlide from '@/components/walkthrough/DecisionSlide.vue'
import { decisionSlides, slideExcerpts } from '@/components/walkthrough/slides'

/**
 * The walkthrough: the decisions behind the build, in the order I would talk
 * through them on the day.
 *
 * Highlighting happens once, here, after mount. Shiki — engine, themes and
 * grammars — is imported dynamically and kept out of the entry chunk, so the
 * chat, which is the actual app, never waits on it. The excerpts read as plain
 * monospace until it lands. Slides only consume the finished map, so
 * re-rendering one never re-highlights anything.
 */
const highlighted = shallowRef<ReadonlyMap<CodeExcerpt, string>>(new Map())

onMounted(async () => {
  try {
    const { highlightExcerpts } = await import('@/components/walkthrough/highlight')
    highlighted.value = await highlightExcerpts(slideExcerpts)
  }
  catch {
    // The excerpts are readable without colour. A highlighter that failed to
    // load does not deserve an error state in a presentation pane.
  }
})
</script>

<template>
  <div class="walkthrough">
    <DecisionSlide
      v-for="(slide, index) in decisionSlides"
      :key="slide.id"
      :slide="slide"
      :index="index + 1"
      :total="decisionSlides.length"
      :highlighted="highlighted"
    />
  </div>
</template>

<style scoped>
/* Wide enough for two columns of the slide's own layout, capped so the prose
   never outruns a comfortable measure on a very large screen. */
.walkthrough {
  display: grid;
  align-content: start;
  max-inline-size: 100rem;
  margin-inline: auto;
}
</style>
