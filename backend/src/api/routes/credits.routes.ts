import type { CreditsController } from '../controllers/credits.controller.ts'
import { Router } from 'express'

export function createCreditsRouter(controller: CreditsController): Router {
  const router = Router()

  router.get('/credits', controller.getCredits)

  return router
}
