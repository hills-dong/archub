import type Database from 'better-sqlite3'
import { archubId } from './id.js'
import type { L0Graph, L0Node, L0Edge } from './types.js'

// A bare symbol name shared by at least this many nodes can't be reliably resolved by
// codegraph's name-based reference resolution, so calls/references to it are dropped as noise.
export const AMBIGUOUS_NAME_MIN_DEFS = 4

// Stdlib/trait method & conversion names that codegraph cannot resolve to a meaningful
// architectural target (it collapses all `x.new()` / `.get()` calls onto one arbitrary node).
// calls/references edges TO these names are dropped as noise regardless of how many nodes share them.
export const UBIQUITOUS_NAMES = new Set<string>([
  'new', 'default', 'from', 'into', 'try_from', 'try_into', 'clone', 'to_string', 'to_owned',
  'as_ref', 'as_str', 'as_mut', 'borrow', 'borrow_mut', 'deref', 'fmt', 'eq', 'ne', 'hash',
  'cmp', 'partial_cmp', 'get', 'get_mut', 'set', 'len', 'is_empty', 'iter', 'into_iter',
  'next', 'unwrap', 'expect', 'parse', 'drop',
])

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

  // 名字频率: 同名节点过多 → codegraph 裸名解析不可靠
  const nameCount = new Map<string, number>()
  for (const n of nodes) nameCount.set(n.name, (nameCount.get(n.name) ?? 0) + 1)

  // 依赖边只取 calls / references / instantiates；排除 contains（结构嵌套）与 imports（指向本地 import 节点，无依赖语义）
  const rawEdges = db
    .prepare(`SELECT source, target, kind FROM edges WHERE kind IN ('calls', 'references', 'instantiates')`)
    .all() as RawEdge[]

  const edges: L0Edge[] = []
  for (const e of rawEdges) {
    const s = byCgId.get(e.source)
    const t = byCgId.get(e.target)
    if (!s || !t) continue // 端点指向被排除的节点(如 import) → 丢弃
    // 精度过滤 1: 跨语言边几乎必为裸名误配(进程内调用不跨语言)
    if (s.language !== t.language) continue
    // 精度过滤 2: calls/references 指向"歧义名"(被很多节点共享)或普遍 stdlib/trait 名 → codegraph 无法可靠解析 → 丢
    if (
      (e.kind === 'calls' || e.kind === 'references') &&
      (UBIQUITOUS_NAMES.has(t.name) || (nameCount.get(t.name) ?? 0) >= AMBIGUOUS_NAME_MIN_DEFS)
    ) continue
    edges.push({ source: s.id, target: t.id, kind: e.kind })
  }

  return { nodes, edges }
}
