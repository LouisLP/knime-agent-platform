# Team notes — week of 2026-07-27

## Standup

- Chat UI renders tool calls inline; still no spinner while a tool is running.
- MCP session now opens once at boot instead of per request. Boot is ~2s slower cold
  because `npx` resolves the server package on first run.
- Agreed to keep parallel tool calls out of scope for the demo.

## Open questions

- Do we cap the tool loop at 5 rounds, or make it configurable per conversation?
  (Currently `MAX_TOOL_ITERATIONS=5`, env-driven.)
- Should a failed tool call end the turn, or go back to the model? Currently it goes
  back — the model usually recovers on the second try.

## Follow-ups

- Sanity-check the Q2 revenue numbers in `reports/quarterly-revenue.csv`.
- Write the release checklist. Done — see `reports/release-checklist.md`.
