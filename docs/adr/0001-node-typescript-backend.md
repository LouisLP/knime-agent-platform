# 0001 — Node + TypeScript backend rather than Go or Java

Status: Accepted

## Context

The brief prefers Go or Java on the backend and TypeScript/Vue on the frontend, inside a
4–6 hour timebox. The thing actually being evaluated is the orchestration of a model and an
MCP server, the separation of concerns, and the frontend–backend contract.

## Decision

Use Node 22 with TypeScript on the backend, running on Node's built-in type stripping — no
build step and no `tsx`. I'm not that experienced with Go, and I'd need a Java refresher,
so going with something I'm more familiar with buys more time.

## Consequences

- The conversation-item union is defined once and mirrored on the frontend with no
  translation layer, which is where most of the contract risk in this exercise lives.
- No language context switching, so more of the timebox goes to the agentic loop.
- The layering (`api → service → repository → domain`, interfaces at every seam, a single
  composition root) is the transferable part and is deliberately framework-agnostic; the
  same structure maps onto Spring or a Go service.
- Type stripping means non-erasable TypeScript syntax is unavailable — no `enum`, no
  constructor parameter properties, no decorators, no namespaces. `erasableSyntaxOnly` in
  `tsconfig.json` turns that into a type-check error rather than a `SyntaxError` at boot.
- This is a stated deviation from the preferred stack, not an oversight, and it is the first
  thing to discuss if the reviewers want to see the Go or Java version of the same design.
