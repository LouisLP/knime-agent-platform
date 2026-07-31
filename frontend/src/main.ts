import { Icon } from '@iconify/vue'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

import '@fontsource-variable/bricolage-grotesque/index.css'
import './styles/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.component('Icon', Icon)

app.mount('#app')
