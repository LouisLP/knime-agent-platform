/**
 * The closed set of error codes the frontend may switch on.
 *
 * A union type plus an `as const` lookup, not a TS `enum`: enums are not
 * erasable syntax and so cannot run under Node's type stripping, and the values
 * need to survive `JSON.stringify` as the exact strings written here.
 */
export const ErrorCode = {
  NotFound: 'not_found',
  Validation: 'validation_error',
  Provider: 'provider_error',
  Tool: 'tool_error',
  Internal: 'internal_error',
  /** Not an `AppError` — raised by the orchestrator's iteration budget. */
  ToolIterationLimit: 'tool_iteration_limit',
} as const

// Sharing the name is the point: `ErrorCode.NotFound` for the value,
// `ErrorCode` for the type — the ergonomics of an enum, fully erasable.
// eslint-disable-next-line ts/no-redeclare
export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode]
