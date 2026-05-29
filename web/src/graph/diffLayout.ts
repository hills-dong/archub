import * as dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'
import type { GraphDiff, NodeDiffStatus, EdgeDiffStatus } from '../api/types'

export const STATUS_COLOR: Record<NodeDiffStatus, string> = {
  added: '#16a34a',     // green
  removed: '#dc2626',   // red
  changed: '#ca8a04',   // yellow
  unchanged: '#9ca3af', // gray
}

export type DiffNodeData = { label: string; status: NodeDiffStatus; color: string; childCount: number } & Record<string, unknown>
export type DiffFlowNode = Node<DiffNodeData>

const NODE_W = 180
const NODE_H = 48

export function layoutDiff(d: GraphDiff): { nodes: Node<DiffNodeData>[]; edges: Edge[] } {
  const dg = new dagre.graphlib.Graph()
  dg.setDefaultEdgeLabel(() => ({}))
  dg.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80 })
  for (const n of d.nodes) dg.setNode(n.id, { width: NODE_W, height: NODE_H })
  for (const e of d.edges) dg.setEdge(e.source, e.target)
  dagre.layout(dg)

  const nodes: Node<DiffNodeData>[] = d.nodes.map((n) => {
    const p = dg.node(n.id)
    return {
      id: n.id,
      type: 'diffNode',
      position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
      data: { label: n.label, status: n.status, color: STATUS_COLOR[n.status], childCount: n.childCount },
    }
  })

  const edgeColor: Record<EdgeDiffStatus, string> = { added: STATUS_COLOR.added, removed: STATUS_COLOR.removed, unchanged: STATUS_COLOR.unchanged }
  const edges: Edge[] = d.edges.map((e) => ({
    id: `${e.source}->${e.target}`,
    source: e.source,
    target: e.target,
    style: {
      stroke: edgeColor[e.status],
      strokeWidth: Math.min(1 + Math.log2(e.weight + 1), 6),
      strokeDasharray: e.status === 'removed' ? '6 4' : undefined,
    },
  }))

  return { nodes, edges }
}
