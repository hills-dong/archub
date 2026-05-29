import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { ArchubFlowNode } from './layout'

export function ModuleNode({ data }: NodeProps<ArchubFlowNode>) {
  const drillable = data.level !== 'function'
  return (
    <div
      data-testid="graph-node"
      style={{
        padding: '8px 12px', border: '1px solid #888', borderRadius: 8,
        background: data.level === 'module' ? '#eef3ff' : data.level === 'file' ? '#f3f9ee' : '#fff',
        minWidth: 140, cursor: drillable ? 'pointer' : 'default',
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 600, fontSize: 13 }}>{data.label}</div>
      <div style={{ fontSize: 11, color: '#666' }}>
        {data.kind}{data.level !== 'function' ? ` · ${data.childCount}` : ''}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export const nodeTypes = { archubNode: ModuleNode }
