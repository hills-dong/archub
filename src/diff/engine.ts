import { aggregate } from '../graph/aggregate.js'
import type { L0Graph, Level, GraphEdgeDTO } from '../graph/types.js'
import type { GraphDiff, DiffNode, DiffEdge } from './types.js'

type ResolveModule = (filePath: string) => string

function edgeKey(source: string, target: string): string {
  return `${source}\0${target}`
}

function outgoing(edges: GraphEdgeDTO[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>()
  for (const e of edges) {
    if (!m.has(e.source)) m.set(e.source, new Map())
    m.get(e.source)!.set(e.target, e.weight)
  }
  return m
}

function sameOutgoing(a: Map<string, number> | undefined, b: Map<string, number> | undefined): boolean {
  const am = a ?? new Map<string, number>()
  const bm = b ?? new Map<string, number>()
  if (am.size !== bm.size) return false
  for (const [t, w] of am) if (bm.get(t) !== w) return false
  return true
}

export function diffGraphs(
  baseL0: L0Graph,
  headL0: L0Graph,
  level: Level,
  scope: string | null,
  mod: ResolveModule,
  baseLabel: string,
  headLabel: string,
): GraphDiff {
  const A = aggregate(baseL0, level, scope, mod)
  const B = aggregate(headL0, level, scope, mod)

  const aNodes = new Map(A.nodes.map((n) => [n.id, n]))
  const bNodes = new Map(B.nodes.map((n) => [n.id, n]))
  const aOut = outgoing(A.edges)
  const bOut = outgoing(B.edges)

  const nodes: DiffNode[] = []
  for (const id of new Set([...aNodes.keys(), ...bNodes.keys()])) {
    const inA = aNodes.has(id)
    const inB = bNodes.has(id)
    const dto = bNodes.get(id) ?? aNodes.get(id)!
    let status: DiffNode['status']
    if (inA && !inB) status = 'removed'
    else if (!inA && inB) status = 'added'
    else status = sameOutgoing(aOut.get(id), bOut.get(id)) ? 'unchanged' : 'changed'
    nodes.push({ ...dto, status })
  }

  const aEdges = new Map(A.edges.map((e) => [edgeKey(e.source, e.target), e]))
  const bEdges = new Map(B.edges.map((e) => [edgeKey(e.source, e.target), e]))
  const edges: DiffEdge[] = []
  for (const k of new Set([...aEdges.keys(), ...bEdges.keys()])) {
    const inA = aEdges.has(k)
    const inB = bEdges.has(k)
    const e = bEdges.get(k) ?? aEdges.get(k)!
    const status: DiffEdge['status'] = inA && !inB ? 'removed' : !inA && inB ? 'added' : 'unchanged'
    edges.push({ ...e, status })
  }

  const summary = {
    addedNodes: nodes.filter((n) => n.status === 'added').length,
    removedNodes: nodes.filter((n) => n.status === 'removed').length,
    changedNodes: nodes.filter((n) => n.status === 'changed').length,
    addedEdges: edges.filter((e) => e.status === 'added').length,
    removedEdges: edges.filter((e) => e.status === 'removed').length,
  }

  return { level, scope, base: baseLabel, head: headLabel, nodes, edges, summary }
}
