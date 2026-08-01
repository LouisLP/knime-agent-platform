# frontend

Vue 3 + TypeScript on Vite. Styling is plain CSS on the Kabuki token system in
`src/styles/` — semantic tokens only, no Tailwind, no raw primitives in components.
Headless behaviour comes from [Reka UI](https://reka-ui.com).

Failure states needed a hue no interactive role owned — kaki is the primary action and
seiji the secondary one — so the palette gained an `aka` (lacquer red) scale and
`--color-danger-*` semantics. Red in this UI always means something failed, never
something you can press.

## The shell

`App.vue` is the layout, not a page: a scrollable walkthrough pane beside a fixed narrow
chat pane on the right, split by a decorative Reka `Separator`. Routes only decide what
fills the walkthrough pane, so the chat pane stays mounted across navigation.

```
src/
  App.vue                     split-screen shell
  api/chat.client.ts          the only module that knows the backend exists
  types/conversation.ts       the wire contract, mirrored from the backend
  stores/chat.ts              conversation + turn state (Pinia setup store)
  components/chat/            pane, composer, indicator, transport banner
  components/chat/items/      one component per conversation-item type
  components/walkthrough/     decision slides, their content, and Shiki
  views/WalkthroughView.vue   routed content of the walkthrough pane
```

The chat is first in the DOM and last in the columns: it is the app, so it should be the
first thing a keyboard or screen reader reaches, but a reading column pushed off the left
edge reads worse than one that starts there. Only the columns are reordered, in CSS.

Each pane owns its own overflow — the shell itself never scrolls. Under 900px there is no
room for two columns, so the panes stack: the chat takes the first screen (it is the app,
with a sticky header and composer), the walkthrough follows beneath it, and the page
scrolls instead of the panes.

## The chat pane

`src/types/conversation.ts` mirrors `backend/src/domain/conversation-item.ts` field for
field. The API hands back exactly those shapes and components render them directly, so
there is no mapping layer to drift — the price is that a backend change has to be copied
across, which a single shared package would solve in a longer-lived codebase.

`ConversationItemView.vue` is the only place that switches on `type`. A `v-if` chain, not
a component lookup table, because it is what keeps each child's props type-checked against
its own member of the union. A `tool_call` renders its name always and its arguments
behind a Reka `Collapsible`; the matching `tool_result` sits indented beneath it, links
back via `aria-describedby` (both sides derive the id from `toolCallId`), and switches to
the danger tokens when `isError`.

Two kinds of failure, deliberately shown differently:

|                       |                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **`error` item**      | The backend recorded it in the transcript — a provider outage, a dead tool, the iteration budget. Rendered in the flow, where it happened. |
| **Transport failure** | The request never landed, so nothing exists server-side. A strip above the composer with Retry and Dismiss — never a transcript item.      |

The one transport failure retrying cannot fix is a `not_found`: conversations live in the
backend's memory, so a restart invalidates the id the tab is holding. The store flags that
case and the banner offers a new conversation instead of a retry.

Responses are not streamed, so while a turn is in flight the pane cannot say _which_ tool
is running. It shows the user's message immediately (the backend only echoes it back when
the whole turn completes), disables the composer, and runs a `role="status"` indicator
that says the assistant is working and may be calling tools. The calls and results then
appear in the order they happened.

Assistant text renders as plain text. The model sometimes replies in Markdown, which shows
its syntax literally — rendering it properly means a Markdown parser plus sanitisation,
which is more surface area than this slice needs.

The backend origin comes from `VITE_API_BASE_URL` and defaults to `http://localhost:3000`.
Keep it in step with the backend's `CORS_ORIGIN`.

## The walkthrough pane

Seven slides — one per technical requirement, plus two on what was left out and what comes
next — in `components/walkthrough/slides.ts`. They are the thought process behind the
build, not a tour of the files: each one is a claim, the reasoning as talking points, and
the code that backs it up beside them. `DecisionSlide.vue` is a container query, so prose
and code sit side by side when the pane is wide and stack when it is not, and the pane
scroll-snaps at `proximity` so slides read as steps without trapping a long one.

Excerpts are pasted by hand rather than imported with `?raw`. An excerpt is an edited
quote — trimmed to the lines that carry the decision, sometimes reflowed to fit the column
— and a live import would drag in the imports and error handling that make the file work
but make the slide unreadable. The cost is that a rewrite of the quoted code leaves the
quote stale, so each excerpt names its source path in the caption.

Highlighting is [Shiki](https://shiki.style) in its fine-grained form: four grammars
(TypeScript, Vue, CSS, Markdown), the JavaScript regex engine instead of the ~1MB
Oniguruma WASM, and the whole module behind a dynamic `import()` so none of it reaches the
entry chunk — the chat must not wait on the walkthrough. `WalkthroughView.vue` highlights
every excerpt once after mount and hands the result down as a map; the slides never call
Shiki, so re-rendering costs nothing. Until it resolves (or if it fails) the same code
renders as plain monospace, which is also the whole error strategy for this pane.

The theme is Kanagawa — Wave for dark, Lotus for light, both emitted at once as
`--shiki-light` / `--shiki-dark` custom properties and resolved in CSS with `light-dark()`.
Switching themes re-colours the code without re-highlighting it, and the block frame uses
Kabuki's own surface and border tokens rather than the theme's background.

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
