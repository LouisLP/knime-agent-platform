import type { Express } from 'express'
import type { Env } from '../config/env.ts'
import type { ChatController } from './controllers/chat.controller.ts'
import type { CreditsController } from './controllers/credits.controller.ts'
import cors from 'cors'
import express from 'express'
import { errorHandler, notFoundHandler } from './middleware/error-handler.ts'
import { createChatRouter } from './routes/chat.routes.ts'
import { createCreditsRouter } from './routes/credits.routes.ts'

export function createServer(
  env: Env,
  chatController: ChatController,
  creditsController: CreditsController,
): Express {
  const app = express()

  app.use(cors({ origin: env.CORS_ORIGIN }))
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', model: env.OPENROUTER_MODEL })
  })

  app.use('/api', createChatRouter(chatController))
  app.use('/api', createCreditsRouter(creditsController))

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
