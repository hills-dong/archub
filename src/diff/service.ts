import type Database from 'better-sqlite3'
import { loadL0Graph } from '../graph/adapter.js'
import { resolveModule, type ArchubConfig } from '../graph/modules.js'
import { diffGraphs } from './engine.js'
import { readSnapshot, listSnapshots } from '../snapshot/store.js'
import { GitRepo } from '../git/repo.js'
import type { L0Graph, Level } from '../graph/types.js'
import type { GraphDiff } from './types.js'

export const WORKING = 'WORKING'

export class DiffService {
  private readonly mod: (fp: string) => string
  constructor(
    private readonly projectRoot: string,
    private readonly db: Database.Database,
    config?: ArchubConfig,
  ) {
    this.mod = (fp: string) => resolveModule(fp, config)
  }

  private async resolveGraph(ref: string): Promise<{ label: string; graph: L0Graph }> {
    if (ref === WORKING) return { label: 'working tree', graph: loadL0Graph(this.db) }
    const sha = await new GitRepo(this.projectRoot).resolveRef(ref)
    const snap = readSnapshot(this.projectRoot, sha)
    if (!snap) {
      const have = listSnapshots(this.projectRoot).map((m) => m.sha.slice(0, 8))
      throw new Error(
        `No snapshot for ${ref} (${sha.slice(0, 8)}). ` +
          (have.length ? `Snapshots exist for: ${have.join(', ')}.` : 'No snapshots yet.') +
          ' Snapshots are recorded going forward — run `archub snapshot` or install the post-commit hook.',
      )
    }
    return { label: `${ref}@${sha.slice(0, 8)}`, graph: snap.graph }
  }

  async diff(base: string, head: string, level: Level, scope: string | null): Promise<GraphDiff> {
    const b = await this.resolveGraph(base)
    const h = await this.resolveGraph(head)
    return diffGraphs(b.graph, h.graph, level, scope, this.mod, b.label, h.label)
  }
}
