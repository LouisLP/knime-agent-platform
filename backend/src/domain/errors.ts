import { ErrorCode } from './error-code.ts'

/**
 * Errors carrying an HTTP status and a stable `code`. The API layer maps these
 * to responses; the service layer maps them into `error` conversation items.
 *
 * Note: fields are declared explicitly rather than as TypeScript parameter
 * properties, which Node's type-stripping loader does not support.
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  override readonly cause?: unknown

  constructor(code: ErrorCode, message: string, status = 500, cause?: unknown) {
    super(message)
    this.name = new.target.name
    this.code = code
    this.status = status
    this.cause = cause
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(ErrorCode.NotFound, message, 404)
  }
}

export class ValidationError extends AppError {
  readonly details?: unknown

  constructor(message: string, details?: unknown) {
    super(ErrorCode.Validation, message, 400)
    this.details = details
  }
}

/** The model provider failed or answered with something unusable. */
export class ProviderError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(ErrorCode.Provider, message, 502, cause)
  }
}

/** The MCP server was unreachable, or a tool blew up. */
export class ToolError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(ErrorCode.Tool, message, 502, cause)
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError)
    return error

  return new AppError(
    ErrorCode.Internal,
    error instanceof Error ? error.message : 'Unexpected error',
    500,
    error,
  )
}
