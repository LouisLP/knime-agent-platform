# 0005 — A walkthrough pane shipped beside the chat

Status: Accepted

## Context

The brief asks for a minimal chat interface, and it's explicit that what's being evaluated is
the thought process, the architectural decisions, and the prioritisation, rather than
perfection. Step two of "what's next" is a 60-minute presentation of the exercise to a room of
KNIMErs.

So there are two audiences here. One is a reviewer opening the app to see whether the loop
works, and the other is a room of people who want to know why it was built this way. A chat
window on its own answers the first and nothing at all for the second, which leaves the
reasoning stranded in the README and the ADRs where it competes with the demo for attention.

## Decision

Ship a split-screen shell: a fixed narrow chat pane on the right, and a scrollable walkthrough
pane beside it holding seven slides: one opening on the approach, one for each of the four
technical requirements in the brief, one on what was deliberately left out, and one on what
would come next.

Each slide is a claim, the reasoning as talking points, and the code that backs it up sitting
next to them. It's the argument, not a tour of the file tree.

## Consequences

- The demo and its justification are the same artifact. During the presentation the chat stays
  live on the right while the discussion moves down the left, so nobody has to alt-tab between
  a running app and a document.
- This is scope beyond "minimal chat interface", and it was built last, after the whole loop
  worked end to end. That ordering is the point: it never competed with the core flow for time.
- Excerpts are pasted by hand rather than imported with `?raw`. An excerpt is an edited quote,
  trimmed to the lines carrying the decision, and a live import would drag in the imports and
  error handling that make a file work but make a slide unreadable. The cost is that rewriting
  quoted code leaves the quote stale, so every excerpt names its source path in the caption.
- Syntax highlighting is Shiki behind a dynamic `import()`, with four grammars and the
  JavaScript regex engine instead of the ~1MB Oniguruma WASM. None of it reaches the entry
  chunk, because the chat must not wait on the walkthrough. If it never resolves, the code
  renders as plain monospace and the pane still works.
- Routes only decide what fills the walkthrough pane, so the chat pane stays mounted across
  navigation and a conversation survives moving around.
- Below 900px there's no room for two columns, so the panes stack with the chat first. The
  walkthrough is the part that degrades, which is the right way round.
