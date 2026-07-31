# Full-Stack Software Engineer (m/f/d) at KNIME

> Verbatim transcription of `Full-Stack Software Engineer_Exercise.pdf`, kept in the repo so
> the brief and the implementation stay side by side.

This exercise is designed to give you a chance to show how you approach challenges that are
similar to what KNIMErs work on. We're not looking for perfection, but for your thought
process and problem-solving style.

## Instructions

Design and implement an end-to-end agentic chat application. We are evaluating your
problem-solving process, architectural decisions, and ability to prioritize within a **four
to six hour timebox**.

## Objective

Build a vertical slice of a chat app that handles user input, communicates with an AI
provider (OpenRouter), and executes an MCP tool.

## Technical requirements

- **Frontend:** TypeScript and Vue.js are preferred. Minimal chat interface (submission,
  display, tool usage indicator, error states).
- **Backend:** Go or Java preferred. Expose an API to the frontend, orchestrate the model and
  MCP calls, and return structured conversation items.
- **AI Provider:** Use OpenRouter (OpenAI-compatible API). The model must be configurable via
  environment variables and support tool calling. Use the provided API key with $10 in
  credits.
- **MCP Integration:** Connect to an existing MCP server. Backend must discover/load tools,
  execute them, and return results to the model.
- **Communication:** Define distinct item types: User message, Assistant message, Tool call,
  Tool result, Error.

## Out of scope

Authentication, persistent storage, multiple users/conversations, multiple providers,
UI-based config, token streaming, parallel tool calls, human approval, file uploads,
production deployment, K8s, and extensive test coverage.

You may implement these if time permits but prioritize the core flow.

## Deliverables

Submit a repository link or zip file containing:

- Frontend and Backend source code.
- Instructions for running the app (commands, setup).
- README: Include model/MCP tool used, design decisions/trade-offs, API config, orchestration
  flow, and time allocation breakdown.
- **Note:** Do not commit credentials. Use `.env.example`.

## Evaluation

We evaluate:

- Functionality of the core end-to-end flow.
- Architectural clarity (separation of concerns).
- Frontend-Backend communication design.
- Correct handling of model/MCP lifecycles.
- Code readability and maintainability.
- Prioritization and decision-making documentation.
- Adaptability to changing requirements.

## What's next

1. Submit your project via email (repo link or zip).
2. Share a couple of time slots where you're available to present the exercise on-site:
   - Duration ~90 minutes: 30 minutes welcome and office tour + 60 minutes presentation and
     discussion.
   - The following KNIMErs will be invited depending on availability: Ivan (Software
     Engineer), Adrian (Team Lead AI), Serge (Software Engineer), Seray (Junior Software
     Engineer), Carsten (Director Platform), Nicola (Team Lead Journey & Commercial
     Architecture), Marc (Director User Facing), Helian (Senior Software Engineer).
   - If you don't disagree, we'll record the session in case a KNIMEr won't be able to join.
3. We'll set up an on-site visit depending on your availability.
