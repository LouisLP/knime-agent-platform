import type { Env } from '../../config/env.ts'
import type { ChatTool } from '../llm/openrouter.types.ts'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ToolError } from '../../domain/errors.ts'

export interface ToolExecutionResult {
  /** Text rendering of the MCP content blocks, safe to feed back to the model. */
  content: string
  isError: boolean
}

export interface ToolProvider {
  connect: () => Promise<void>
  close: () => Promise<void>
  /** MCP tools translated into the provider's function-calling schema. */
  listTools: () => Promise<ChatTool[]>
  callTool: (name: string, args: unknown) => Promise<ToolExecutionResult>
}

/**
 * Owns the MCP session lifecycle: connected once at boot, reused across
 * requests, closed on shutdown. Tool discovery is cached after the first call
 * since the server's tool list is static for the life of the session.
 */
export class McpToolProvider implements ToolProvider {
  readonly #env: Env
  #client: Client | undefined
  #tools: ChatTool[] | undefined

  constructor(env: Env) {
    this.#env = env
  }

  async connect(): Promise<void> {
    if (this.#client)
      return

    const client = new Client({ name: 'knime-agent-platform', version: '0.0.0' })

    try {
      await client.connect(this.#createTransport())
    }
    catch (cause) {
      throw new ToolError('Could not connect to the MCP server', cause)
    }

    this.#client = client
  }

  async close(): Promise<void> {
    await this.#client?.close()
    this.#client = undefined
    this.#tools = undefined
  }

  async listTools(): Promise<ChatTool[]> {
    if (this.#tools)
      return this.#tools

    const client = this.#requireClient()

    try {
      const { tools } = await client.listTools()
      this.#tools = tools.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          ...(tool.description ? { description: tool.description } : {}),
          parameters: (tool.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
        },
      }))
    }
    catch (cause) {
      throw new ToolError('Could not list MCP tools', cause)
    }

    return this.#tools
  }

  async callTool(name: string, args: unknown): Promise<ToolExecutionResult> {
    const client = this.#requireClient()

    try {
      const result = await client.callTool({
        name,
        arguments: (args ?? {}) as Record<string, unknown>,
      })

      return {
        content: renderContent(result.content),
        isError: result.isError === true,
      }
    }
    catch (cause) {
      // A failing tool is a conversation event, not a server fault: hand the
      // message back so the model can recover or explain itself.
      return {
        content: cause instanceof Error ? cause.message : String(cause),
        isError: true,
      }
    }
  }

  #requireClient(): Client {
    if (!this.#client)
      throw new ToolError('MCP client is not connected')

    return this.#client
  }

  #createTransport() {
    const env = this.#env

    if (env.MCP_TRANSPORT === 'stdio')
      return new StdioClientTransport({ command: env.MCP_COMMAND, args: env.MCP_ARGS })

    return new StreamableHTTPClientTransport(new URL(env.MCP_SERVER_URL))
  }
}

function renderContent(content: unknown): string {
  if (!Array.isArray(content))
    return JSON.stringify(content ?? null)

  return content
    .map((block: unknown) => {
      if (typeof block === 'object' && block !== null && 'type' in block && block.type === 'text')
        return String((block as { text?: unknown }).text ?? '')

      return JSON.stringify(block)
    })
    .join('\n')
}
