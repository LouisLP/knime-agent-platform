<script setup lang="ts">
import SurfaceCard from '@/components/ui/SurfaceCard.vue'
</script>

<template>
  <div class="walkthrough">
    <SurfaceCard title="Decision slides land here">
      Hand-picked excerpts of the build — prose beside Shiki-highlighted code — arrive with
      the walkthrough ticket. This pane scrolls independently of the chat.
    </SurfaceCard>
  </div>
</template>

<style scoped>
.walkthrough {
  display: grid;
  gap: var(--space-lg);
  align-content: start;
  max-inline-size: 72ch;
  margin-inline: auto;
}
</style>
