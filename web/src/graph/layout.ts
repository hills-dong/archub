import * as dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'
import type { GraphResponse, GraphNodeDTO } from '../api/types'

export type ArchubNodeData = GraphNodeDTO & Record<string, unknown>
export type ArchubFlowNode = Node<ArchubNodeData> // React Flow v12 node type (NodeProps takes the Node type, not the data type)

const NODE_W = 180
const NODE_H = 48

export function layoutGraph(g: GraphResponse): { nodes: Node<ArchubNodeData>[]; edges: Edge[] } {
  const dg = new dagre.graphlib.Graph()
  dg.setDefaultEdgeLabel(() => ({}))
  dg.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80 })
  for (const n of g.nodes) dg.setNode(n.id, { width: NODE_W, height: NODE_H })
  for (const e of g.edges) dg.setEdge(e.source, e.target)
  dagre.layout(dg)

  const nodes: Node<ArchubNodeData>[] = g.nodes.map((n) => {
    const p = dg.node(n.id)
    return {
      id: n.id,
      type: 'archubNode',
      position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
      data: { ...n },
    }
  })

  const edges: Edge[] = g.edges.map((e) => ({
    id: `${e.source}->${e.target}`,
    source: e.source,
    target: e.target,
    label: e.weight > 1 ? String(e.weight) : undefined,
    style: { strokeWidth: Math.min(1 + Math.log2(e.weight + 1), 6) },
  }))

  return { nodes, edges }
}
