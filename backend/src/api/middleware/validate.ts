import type { RequestHandler } from 'express'
import type { ZodType } from 'zod'
import { ValidationError } from '../../domain/errors.ts'

type Source = 'body' | 'params' | 'query'

/** Parses one part of the request and replaces it with the typed result. */
export function validate(source: Source, schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source])

    if (!result.success) {
      next(new ValidationError(`Invalid request ${source}`, result.error.issues))
      return
    }

    Object.defineProperty(req, source, { value: result.data, writable: true })
    next()
  }
}
