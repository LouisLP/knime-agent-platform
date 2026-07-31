import path from 'node:path'
import process from 'node:process'
import { z } from 'zod'

/**
 * OpenRouter routes on a `vendor/model` slug — `anthropic/claude-sonnet-4.5`,
 * `openai/gpt-4o`. A bare model name is the most likely way to misconfigure
 * this, and the provider only reports it as a 404 on the first real request.
 */
export type ModelId = `${string}/${string}`

const modelIdSchema = z.string()
  .regex(/^[^/\s]+\/\S+$/, 'must be a "vendor/model" slug, e.g. anthropic/claude-sonnet-4.5')
  .transform(value => value as ModelId)

const mcpCommandRequired = 'MCP_COMMAND is required when MCP_TRANSPORT=stdio'

/** The committed demo sandbox, `<repo>/sandbox`, from `backend/src/config/`. */
const defaultSandboxDir = path.resolve(import.meta.dirname, '../../../sandbox')

/**
 * `MCP_ARGS` is a JSON array, not a space-separated string. The transport
 * spawns with `shell: false`, so argv is passed verbatim and a sandbox path
 * containing a space has to survive as a single element — quoting in `.env`
 * would land the quote characters *inside* the argument.
 */
const mcpArgsSchema = z.string()
  .default('[]')
  .transform((value, ctx) => {
    try {
      const parsed: unknown = JSON.parse(value)
      return z.array(z.string()).parse(parsed)
    }
    catch {
      ctx.addIssue('MCP_ARGS must be a JSON array of strings, e.g. ["-y","@scope/pkg@1.0.0"]')
      return z.NEVER
    }
  })

const baseSchema = z.object({
  PORT: z.coerce.number('PORT must be a number').int().positive().default(3000),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),

  OPENROUTER_API_KEY: z.string('OPENROUTER_API_KEY is required').min(1, 'OPENROUTER_API_KEY is required'),
  OPENROUTER_BASE_URL: z.url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL: modelIdSchema,

  MAX_TOOL_ITERATIONS: z.coerce.number('MAX_TOOL_ITERATIONS must be a number').int().min(1).max(20).default(5),
})

/**
 * The transport is a discriminated union, not four independent optionals: the
 * vars each transport needs are required *in its own branch*, so the MCP client
 * narrows on `MCP_TRANSPORT` instead of asserting non-null on a `string |
 * undefined` the schema already guaranteed.
 */
const mcpSchema = z.discriminatedUnion('MCP_TRANSPORT', [
  z.object({
    MCP_TRANSPORT: z.literal('http'),
    MCP_SERVER_URL: z.url('MCP_SERVER_URL is required when MCP_TRANSPORT=http'),
  }),
  z.object({
    MCP_TRANSPORT: z.literal('stdio'),
    MCP_COMMAND: z.string(mcpCommandRequired).min(1, mcpCommandRequired),
    MCP_ARGS: mcpArgsSchema,
    /**
     * The one directory the filesystem server is allowed to touch. Appended to
     * `MCP_ARGS` as the server's final positional argument, so it stays a named
     * setting instead of being buried in an argv blob.
     */
    MCP_SANDBOX_DIR: z.string()
      .default(defaultSandboxDir)
      // The server resolves relative args against *its own* cwd; resolving here
      // means the path in a log message is the path it actually opened.
      .transform(value => path.resolve(value)),
  }),
])

const schema = z.preprocess(
  (value) => {
    // `.env.example` ships every key present but blank, so an unfilled var
    // arrives as `''`. Dropping it lets `.default()` apply and keeps the boot
    // failure from naming a variable the operator was right to leave empty.
    const raw = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== ''),
    )
    // The union needs its discriminator present before it can pick a branch;
    // `.default()` on a discriminator does not run early enough to provide one.
    raw.MCP_TRANSPORT ??= 'stdio'
    return raw
  },
  z.intersection(baseSchema, mcpSchema),
)

export type Env = z.infer<typeof schema>

/** Fails fast at boot rather than at the first request. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source)

  if (!result.success) {
    const issues = result.error.issues
      .map(issue => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }

  return result.data
}
