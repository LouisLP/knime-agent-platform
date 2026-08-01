import type { RequestHandler } from 'express'
import type { CreditsReader } from '../../service/llm/credits.client.ts'

/** Thin HTTP adapter over the provider's spend figures. */
export class CreditsController {
  readonly #credits: CreditsReader

  constructor(credits: CreditsReader) {
    this.#credits = credits
  }

  getCredits: RequestHandler = async (_req, res, next) => {
    try {
      res.json(await this.#credits.read())
    }
    catch (error) {
      next(error)
    }
  }
}
