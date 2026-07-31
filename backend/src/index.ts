import process from 'node:process'
import { createServer } from './api/server.ts'
import { loadEnv } from './config/env.ts'
import { createContainer } from './container.ts'

async function main(): Promise<void> {
  const env = loadEnv()
  const { chatController, toolProvider } = createContainer(env)

  // Connect once at boot so tool discovery is not on the request path.
  const source = env.MCP_TRANSPORT === 'stdio' ? env.MCP_SANDBOX_DIR : env.MCP_SERVER_URL
  console.info(`Connecting to the MCP server over ${env.MCP_TRANSPORT} — ${source}`)
  await toolProvider.connect()
  const tools = await toolProvider.listTools()
  console.info(`MCP connected — ${tools.length} tool(s): ${tools.map(t => t.function.name).join(', ')}`)

  const server = createServer(env, chatController).listen(env.PORT, () => {
    console.info(`Backend listening on http://localhost:${env.PORT} (model: ${env.OPENROUTER_MODEL})`)
  })

  const shutdown = () => {
    server.close(() => {
      void toolProvider.close().finally(() => process.exit(0))
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
