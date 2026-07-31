# Sandbox

The only directory the MCP filesystem server is allowed to touch. It is passed as the
server's last positional argument at boot (`MCP_SANDBOX_DIR`), and the server rejects any
path outside it — including symlinks that point out.

The files here are seed data for the demo, committed so a fresh clone has something to read
and list. The server can also write, move and delete in here, so treat anything you add as
disposable.

Things worth asking the assistant:

- "What's in the sandbox?"
- "Which region had the highest Q2 revenue?"
- "Summarise the notes file."
- "Is the release checklist done?"
