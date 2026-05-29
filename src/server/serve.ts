import { openCodegraphDb } from '../db/connect.js'
import { GraphService } from '../graph/service.js'
import { DiffService } from '../diff/service.js'
import { GitRepo } from '../git/repo.js'
import { listSnapshots } from '../snapshot/store.js'
import { createApp } from './app.js'

export function startServer(projectRoot: string, port: number): void {
  const db = openCodegraphDb(projectRoot)
  const graph = new GraphService(db)
  const diff = new DiffService(projectRoot, db)
  const refs = async () => {
    const r = await new GitRepo(projectRoot).refs()
    return { ...r, snapshots: listSnapshots(projectRoot).map((m) => m.sha) }
  }
  const app = createApp(graph, { diff, refs })
  app.listen(port, () => {
    console.log(`archub serving ${projectRoot} on http://localhost:${port}`)
  })
}
