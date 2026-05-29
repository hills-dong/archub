import express, { type Express } from 'express'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { GraphService } from '../graph/service.js'
import { apiRouter } from './routes.js'

export function createApp(svc: GraphService): Express {
  const app = express()
  app.use('/api', apiRouter(svc))

  const here = dirname(fileURLToPath(import.meta.url))
  const webDist = join(here, '..', '..', 'web', 'dist')
  if (existsSync(webDist)) {
    app.use(express.static(webDist))
    // SPA fallback。注意 express 5 不再支持 `app.get('*')`; 用中间件兜底 GET 非 /api 请求。
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) res.sendFile(join(webDist, 'index.html'))
      else next()
    })
  }
  return app
}
