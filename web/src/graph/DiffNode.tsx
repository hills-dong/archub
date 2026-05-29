import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { DiffFlowNode } from './diffLayout'

export function DiffNode({ data }: NodeProps<DiffFlowNode>) {
  return (
    <div
      data-testid="diff-node"
      data-status={data.status}
      style={{
        padding: '8px 12px', borderRadius: 8,
        border: `2px solid ${data.color}`, background: '#fff', minWidth: 140,
        opacity: data.status === 'removed' ? 0.6 : 1,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 600, fontSize: 13 }}>{data.label}</div>
      <div style={{ fontSize: 11, color: data.color }}>{data.status}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export const diffNodeTypes = { diffNode: DiffNode }
