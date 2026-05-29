import type Database from 'better-sqlite3'
import { loadL0Graph } from './adapter.js'
import { resolveModule, type ArchubConfig } from './modules.js'
import { aggregate } from './aggregate.js'
import type { L0Graph, Level, GraphResponse, NodeDetail, SearchHit } from './types.js'

export class GraphService {
  private readonly l0: L0Graph
  private readonly mod: (fp: string) => string

  constructor(db: Database.Database, config?: ArchubConfig) {
    this.l0 = loadL0Graph(db)
    this.mod = (fp: string) => resolveModule(fp, config)
  }

  getGraph(level: Level, scope: string | null): GraphResponse {
    const { nodes, edges } = aggregate(this.l0, level, scope, this.mod)
    return { level, scope, nodes, edges }
  }

  getNode(id: string): NodeDetail | null {
    const n = this.l0.nodes.find((x) => x.id === id)
    if (!n) return null
    return {
      id: n.id, name: n.name, qualifiedName: n.qualifiedName, kind: n.kind,
      filePath: n.filePath, language: n.language, startLine: n.startLine, endLine: n.endLine,
      signature: n.signature, visibility: n.visibility, isExported: n.isExported,
    }
  }

  search(q: string, limit = 50): SearchHit[] {
    const needle = q.toLowerCase()
    const hits: SearchHit[] = []
    for (const n of this.l0.nodes) {
      if (n.name.toLowerCase().includes(needle) || n.qualifiedName.toLowerCase().includes(needle)) {
        hits.push({ id: n.id, name: n.name, qualifiedName: n.qualifiedName, kind: n.kind, filePath: n.filePath, module: this.mod(n.filePath) })
        if (hits.length >= limit) break
      }
    }
    return hits
  }
}
