import type Database from 'better-sqlite3'
import { archubId } from './id.js'
import type { L0Graph, L0Node, L0Edge } from './types.js'

interface RawNode {
  id: string
  kind: string
  name: string
  qualified_name: string
  file_path: string
  language: string
  start_line: number
  end_line: number
  signature: string | null
  visibility: string | null
  is_exported: number
}
interface RawEdge {
  source: string
  target: string
  kind: string
}

export function loadL0Graph(db: Database.Database): L0Graph {
  // 只取符号节点：排除 file / import 类节点（结构/导入语句节点，不进架构图）
  const rawNodes = db
    .prepare(
      `SELECT id, kind, name, qualified_name, file_path, language,
              start_line, end_line, signature, visibility, is_exported
       FROM nodes WHERE kind NOT IN ('file', 'import')`,
    )
    .all() as RawNode[]

  const byCgId = new Map<string, L0Node>()
  const nodes: L0Node[] = rawNodes.map((r) => {
    const node: L0Node = {
      id: archubId({
        language: r.language,
        filePath: r.file_path,
        kind: r.kind,
        qualifiedName: r.qualified_name,
        startLine: r.start_line,
      }),
      cgId: r.id,
      kind: r.kind,
      name: r.name,
      qualifiedName: r.qualified_name,
      filePath: r.file_path,
      language: r.language,
      startLine: r.start_line,
      endLine: r.end_line,
      signature: r.signature,
      visibility: r.visibility,
      isExported: r.is_exported === 1,
    }
    byCgId.set(r.id, node)
    return node
  })

  // 依赖边只取 calls / references / instantiates；排除 contains（结构嵌套）与 imports（指向本地 import 节点，无依赖语义）
  const rawEdges = db
    .prepare(`SELECT source, target, kind FROM edges WHERE kind IN ('calls', 'references', 'instantiates')`)
    .all() as RawEdge[]

  const edges: L0Edge[] = []
  for (const e of rawEdges) {
    const s = byCgId.get(e.source)
    const t = byCgId.get(e.target)
    if (!s || !t) continue // 端点指向被排除的节点(如 import) → 丢弃
    edges.push({ source: s.id, target: t.id, kind: e.kind })
  }

  return { nodes, edges }
}
