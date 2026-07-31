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

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  OPENROUTER_BASE_URL: z.url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL: modelIdSchema,

  MAX_TOOL_ITERATIONS: z.coerce.number().int().min(1).max(20).default(5),

  MCP_TRANSPORT: z.enum(['http', 'stdio']).default('http'),
  MCP_SERVER_URL: z.url().optional(),
  MCP_COMMAND: z.string().optional(),
  MCP_ARGS: z.string().optional(),
})
  .refine(
    env => env.MCP_TRANSPORT !== 'http' || !!env.MCP_SERVER_URL,
    { message: 'MCP_SERVER_URL is required when MCP_TRANSPORT=http', path: ['MCP_SERVER_URL'] },
  )
  .refine(
    env => env.MCP_TRANSPORT !== 'stdio' || !!env.MCP_COMMAND,
    { message: 'MCP_COMMAND is required when MCP_TRANSPORT=stdio', path: ['MCP_COMMAND'] },
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
