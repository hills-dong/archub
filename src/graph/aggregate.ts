import type { L0Graph, L0Node, Level, GraphNodeDTO, GraphEdgeDTO } from './types.js'

type ResolveModule = (filePath: string) => string

/** 某个 L0 节点在目标粒度下的容器 id。null = 该节点不属于当前 scope。 */
function containerId(node: L0Node, level: Level, scope: string | null, mod: ResolveModule): string | null {
  if (level === 'module') return mod(node.filePath)
  if (level === 'file') {
    if (mod(node.filePath) !== scope) return null
    return node.filePath
  }
  // function
  if (node.filePath !== scope) return null
  return node.id
}

function nodeDTO(id: string, node: L0Node, level: Level): GraphNodeDTO {
  if (level === 'module') return { id, label: id, level, kind: 'module', language: node.language, childCount: 0, filePath: null }
  if (level === 'file') {
    const label = id.split('/').pop() ?? id
    return { id, label, level, kind: 'file', language: node.language, childCount: 0, filePath: id }
  }
  return { id, label: node.name, level, kind: node.kind, language: node.language, childCount: 1, filePath: node.filePath }
}

export function aggregate(l0: L0Graph, level: Level, scope: string | null, mod: ResolveModule): { nodes: GraphNodeDTO[]; edges: GraphEdgeDTO[] } {
  // 1) 建节点 + childCount + L0 节点 id → 容器 id 映射
  const containerOf = new Map<string, string>() // L0 node id -> container id
  const nodes = new Map<string, GraphNodeDTO>()
  for (const n of l0.nodes) {
    const cid = containerId(n, level, scope, mod)
    if (cid === null) continue
    containerOf.set(n.id, cid)
    const existing = nodes.get(cid)
    if (existing) {
      existing.childCount += level === 'function' ? 0 : 1
    } else {
      nodes.set(cid, nodeDTO(cid, n, level))
      if (level !== 'function') nodes.get(cid)!.childCount = 1
    }
  }

  // 2) 边 roll-up：跨容器的依赖边按 (src,tgt) 累加，丢自环
  const weights = new Map<string, GraphEdgeDTO>()
  for (const e of l0.edges) {
    const s = containerOf.get(e.source)
    const t = containerOf.get(e.target)
    if (s === undefined || t === undefined) continue // 端点不在当前 scope
    if (s === t) continue // 同容器自环丢弃
    const key = `${s}\0${t}`
    const w = weights.get(key)
    if (w) w.weight += 1
    else weights.set(key, { source: s, target: t, weight: 1 })
  }

  return { nodes: [...nodes.values()], edges: [...weights.values()] }
}
