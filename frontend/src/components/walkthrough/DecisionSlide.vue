<script setup lang="ts">
import type { DecisionSlide, CodeExcerpt as Excerpt } from './slides'
import CodeExcerpt from './CodeExcerpt.vue'

/**
 * One decision, at a size meant to be talked over: a claim in the heading, the
 * reasoning in the list, and the code that backs it up beside them.
 *
 * `highlighted` is the whole page's map rather than this slide's share of it —
 * the view highlights once and every slide reads from the same result.
 */
defineProps<{
  slide: DecisionSlide
  /** 1-based, for the printed slide number. */
  index: number
  total: number
  highlighted: ReadonlyMap<Excerpt, string>
}>()
</script>

<template>
  <section :id="slide.id" class="slide" :aria-labelledby="`${slide.id}-title`">
    <header class="slide__header">
      <p class="slide__kicker">
        <span class="slide__number">{{ String(index).padStart(2, '0') }}</span>
        {{ slide.kicker }}
        <span class="visually-hidden">— slide {{ index }} of {{ total }}</span>
      </p>
      <h3 :id="`${slide.id}-title`" class="slide__title">
        {{ slide.title }}
      </h3>
      <p class="slide__lede">
        {{ slide.lede }}
      </p>
    </header>

    <div class="slide__body">
      <ul class="slide__points">
        <li v-for="point in slide.points" :key="point">
          {{ point }}
        </li>
      </ul>

      <div class="slide__excerpts">
        <CodeExcerpt
          v-for="excerpt in slide.excerpts"
          :key="excerpt.source"
          :excerpt="excerpt"
          :html="highlighted.get(excerpt)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
/**
 * The slide is its own container: prose and code sit side by side when the
 * walkthrough pane is wide enough for two readable columns, and stack when the
 * chat pane, a narrow window or the stacked mobile layout takes that away.
 * A container query, not a media query — the pane's width is what decides,
 * and it is not the viewport's.
 */
.slide {
  container-type: inline-size;
  display: grid;
  gap: var(--space-lg);
  align-content: start;
  padding-block: var(--space-xl);
  scroll-snap-align: start;
}

.slide + .slide {
  border-block-start: var(--border-width-thin) solid var(--color-border-subtle);
}

.slide__header {
  display: grid;
  gap: var(--space-xs);
  max-inline-size: 68ch;
}

.slide__kicker {
  display: flex;
  gap: var(--space-xs);
  align-items: baseline;
  color: var(--color-accent-subtle-fg);
  font-size: var(--font-size-sm);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

.slide__number {
  color: var(--color-text-muted);
  font-family: var(--font-code);
}

.slide__title {
  font-size: var(--font-size-2xl);
  text-wrap: balance;
}

.slide__lede {
  color: var(--color-text-secondary);
  font-size: var(--font-size-lg);
  text-wrap: pretty;
}

.slide__body {
  display: grid;
  gap: var(--space-lg);
  align-items: start;
}

@container (min-width: 62rem) {
  /* The code column takes the larger share: prose reflows, an 80-column
     excerpt does not. */
  .slide__body {
    grid-template-columns: minmax(0, 4fr) minmax(0, 5fr);
    gap: var(--space-xl);
  }

  /* Code is the reference, prose is the argument: let the code scroll past
     while the reasoning it supports stays on screen. */
  .slide__excerpts {
    position: sticky;
    inset-block-start: var(--space-lg);
  }
}

.slide__points {
  display: grid;
  gap: var(--space-sm);
  max-inline-size: 68ch;
  padding-inline-start: var(--space-md);
  color: var(--color-text-secondary);
  list-style: disc;
  text-wrap: pretty;
}

.slide__points li::marker {
  color: var(--color-secondary-default);
}

.slide__excerpts {
  display: grid;
  gap: var(--space-md);
  min-inline-size: 0;
}
</style>
