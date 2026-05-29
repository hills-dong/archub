import { ReactFlow, Background, Controls, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { layoutGraph, type ArchubNodeData } from './layout'
import { nodeTypes } from './ModuleNode'
import type { GraphResponse } from '../api/types'

export function GraphCanvas({ graph, onNodeClick }: { graph: GraphResponse; onNodeClick: (node: ArchubNodeData) => void }) {
  const { nodes, edges } = layoutGraph(graph)
  return (
    <div style={{ width: '100%', height: '100%' }} data-testid="graph-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        onNodeClick={(_e, n: Node<ArchubNodeData>) => onNodeClick(n.data)}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
