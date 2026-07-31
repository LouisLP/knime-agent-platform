# frontend

Vue 3 + TypeScript on Vite. Styling is plain CSS on the Kabuki token system in
`src/styles/` — semantic tokens only, no Tailwind, no raw primitives in components.
Headless behaviour comes from [Reka UI](https://reka-ui.com).

## The shell

`App.vue` is the layout, not a page: a fixed narrow chat pane beside a scrollable
walkthrough pane, split by a decorative Reka `Separator`. Routes only decide what fills
the walkthrough pane, so the chat pane stays mounted across navigation.

```
src/
  App.vue                     split-screen shell
  components/chat/            chat pane (placeholder until the chat ticket)
  components/ui/              shared surfaces
  views/WalkthroughView.vue   routed content of the walkthrough pane
```

Each pane owns its own overflow — the shell itself never scrolls. Under 900px there is no
room for two columns, so the panes stack: the chat takes the first screen (it is the app,
with a sticky header), the walkthrough follows beneath it, and the page scrolls instead of
the panes.

`pnpm-workspace.yaml` exists only to approve `vue-demi`'s postinstall, which reka-ui pulls
in; without the approval pnpm exits non-zero and blocks every script. The eslint rule that
polices that file is switched off in `eslint.config.js` because it also demands
`trustPolicy: no-downgrade`, which the current dependency tree cannot satisfy (`@babel/core`,
via `vite-plugin-vue-devtools`, resolves `semver@6.3.1`, published without provenance).

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
pnpm install
```

### Compile and Hot-Reload for Development

```sh
pnpm dev
```

### Type-Check, Compile and Minify for Production

```sh
pnpm build
```
