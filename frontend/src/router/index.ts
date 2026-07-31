import { createRouter, createWebHistory } from 'vue-router'
import WalkthroughView from '@/views/WalkthroughView.vue'

/**
 * The layout lives in App.vue, so routes only decide what fills the
 * walkthrough pane — the chat pane is always mounted.
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'walkthrough',
      component: WalkthroughView,
    },
  ],
})

export default router
