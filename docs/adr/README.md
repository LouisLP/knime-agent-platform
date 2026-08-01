# Architecture decision records

One file per decision that was not obvious, in the format: context → decision →
consequences. Numbered sequentially, never renumbered. A superseded ADR stays in place with
a pointer to the one that replaced it — the reasoning that was true at the time is the
point.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-node-typescript-backend.md) | Node + TypeScript backend rather than Go or Java | Accepted |
| [0002](0002-turn-shaped-responses.md) | Turn-shaped responses instead of token streaming | Accepted |
| [0003](0003-errors-as-conversation-items.md) | Errors modelled as conversation items | Accepted |
| [0004](0004-filesystem-mcp-over-stdio.md) | The filesystem MCP server over stdio, rooted at a committed sandbox | Accepted |
| [0005](0005-walkthrough-pane.md) | A walkthrough pane shipped beside the chat | Accepted |
