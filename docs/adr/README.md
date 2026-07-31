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
