import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { Readable } from 'node:stream'
import type { Env } from '../../config/env.ts'
import type { ChatTool } from '../llm/openrouter.types.ts'
import { statSync } from 'node:fs'
import { createInterface } from 'node:readline'
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
 * Tools withheld from the model. `read_file` is a deprecated alias whose
 * handler is literally `read_text_file`'s — offering both invites the wrong
 * pick and costs tokens on every request.
 */
const HIDDEN_TOOLS = new Set(['read_file'])

/** Block types whose payload is base64 and must never reach the model. */
const OPAQUE_BLOCK_TYPES = new Set(['image', 'audio'])

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
    // Outside the try: a misconfigured transport should report its own reason,
    // not be re-wrapped as a connection failure.
    const transport = this.#createTransport()

    try {
      await client.connect(transport)
    }
    catch (cause) {
      // The reason is the useful part and `main()` only prints `message`, so
      // fold it in rather than leaving it on `cause` for nobody to read.
      throw new ToolError(`Could not connect to the MCP server: ${describeCause(cause)}`, cause)
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
      this.#tools = tools
        .filter(tool => !HIDDEN_TOOLS.has(tool.name))
        .map(tool => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            ...(tool.description ? { description: tool.description } : {}),
            parameters: toParameters(tool.inputSchema),
          },
        }))
    }
    catch (cause) {
      throw new ToolError(`Could not list MCP tools: ${describeCause(cause)}`, cause)
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
        content: renderResult(result),
        isError: result.isError === true,
      }
    }
    catch (cause) {
      // A failing tool is a conversation event, not a server fault: hand the
      // message back so the model can recover or explain itself.
      return { content: describeCause(cause), isError: true }
    }
  }

  #requireClient(): Client {
    if (!this.#client)
      throw new ToolError('MCP client is not connected')

    return this.#client
  }

  #createTransport(): Transport {
    const env = this.#env

    if (env.MCP_TRANSPORT !== 'stdio')
      return new StreamableHTTPClientTransport(new URL(env.MCP_SERVER_URL))

    // The filesystem server exits 1 on an inaccessible directory, which reaches
    // us as an opaque closed connection. Check first, so the failure names it.
    requireDirectory(env.MCP_SANDBOX_DIR)

    const transport = new StdioClientTransport({
      command: env.MCP_COMMAND,
      // The sandbox is the server's last positional arg — its allowed root.
      args: [...env.MCP_ARGS, env.MCP_SANDBOX_DIR],
      // The default, 'inherit', interleaves npx warnings and server diagnostics
      // with our own logs unlabelled. Piping makes them greppable.
      stderr: 'pipe',
    })

    // Non-null because we asked for 'pipe' above; the SDK types the pipe as the
    // base `Stream`, but it is the child's stdout pipe, i.e. a `Readable`.
    createInterface({ input: transport.stderr as Readable })
      .on('line', line => console.error(`[mcp] ${line}`))

    return transport
  }
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function requireDirectory(dir: string): void {
  const stats = statSync(dir, { throwIfNoEntry: false })

  if (!stats?.isDirectory())
    throw new ToolError(`MCP sandbox directory does not exist: ${dir}`)
}

/**
 * An MCP input schema is JSON Schema already, so this is a pass-through minus
 * the `$schema` key the server emits — harmless for OpenRouter, but an
 * unexpected key for stricter gateways and dead weight on every request.
 */
function toParameters(inputSchema: unknown): Record<string, unknown> {
  if (typeof inputSchema !== 'object' || inputSchema === null)
    return { type: 'object', properties: {} }

  const { $schema: _ignored, ...rest } = inputSchema as Record<string, unknown>
  return rest
}

/**
 * Typed `unknown` rather than `CallToolResult`: the SDK's result type is a
 * union that still carries the pre-`content` shape, so narrowing it costs more
 * than reading the two fields defensively.
 */
function renderResult(result: unknown): string {
  const { content, structuredContent } = result as Record<string, unknown>
  const rendered = renderContent(content)

  // The spec says a tool returning structured content SHOULD also serialise it
  // as a text block, so the fallback only fires for servers that don't.
  if (rendered)
    return rendered

  return structuredContent === undefined ? '' : JSON.stringify(structuredContent)
}

function renderContent(content: unknown): string {
  if (!Array.isArray(content))
    return ''

  return content.map(renderBlock).join('\n')
}

/**
 * Text passes through; anything carrying a binary payload is reduced to a
 * placeholder. Inlining a base64 image would turn a 1 MB PNG into ~1.4 MB of
 * context, and the model can do nothing with the bytes anyway.
 */
function renderBlock(block: unknown): string {
  if (typeof block !== 'object' || block === null)
    return JSON.stringify(block)

  const { type, text, mimeType, data, uri, name, resource } = block as Record<string, unknown>

  if (type === 'text')
    return String(text ?? '')

  if (typeof type === 'string' && OPAQUE_BLOCK_TYPES.has(type))
    return `[${type} ${mimeType ?? 'unknown'}, ${describeSize(data)}]`

  if (type === 'resource_link')
    return `[resource_link ${[name, uri].filter(Boolean).join(' — ')}]`

  if (type === 'resource')
    return renderEmbeddedResource(resource)

  return JSON.stringify(block)
}

function renderEmbeddedResource(resource: unknown): string {
  if (typeof resource !== 'object' || resource === null)
    return JSON.stringify(resource)

  const { text, uri, mimeType, blob } = resource as Record<string, unknown>

  if (typeof text === 'string')
    return text

  return `[resource ${uri ?? ''} ${mimeType ?? 'unknown'}, ${describeSize(blob)}]`
}

function describeSize(base64: unknown): string {
  if (typeof base64 !== 'string')
    return 'unknown size'

  // Four base64 characters encode three bytes; close enough for a label.
  return `${Math.round((base64.length * 3) / 4 / 1024)} KB`
}
