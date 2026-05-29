import { openCodegraphDb } from '../db/connect.js'
import { GraphService } from '../graph/service.js'
import { createApp } from './app.js'

export function startServer(projectRoot: string, port: number): void {
  const db = openCodegraphDb(projectRoot)
  const svc = new GraphService(db)
  const app = createApp(svc)
  app.listen(port, () => {
    console.log(`archub serving ${projectRoot} on http://localhost:${port}`)
  })
}
