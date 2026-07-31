import type { ErrorRequestHandler, RequestHandler } from 'express'
import { NotFoundError, toAppError, ValidationError } from '../../domain/errors.ts'

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`No route for ${req.method} ${req.path}`))
}

/** Single place where an error becomes an HTTP response. */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const appError = toAppError(error)

  if (appError.status >= 500)
    console.error(appError.code, appError.message, appError.cause ?? '')

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError instanceof ValidationError && appError.details
        ? { details: appError.details }
        : {}),
    },
  })
}
