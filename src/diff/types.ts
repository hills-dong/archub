import type { Level, GraphNodeDTO, GraphEdgeDTO } from '../graph/types.js'

export type NodeDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'
export type EdgeDiffStatus = 'added' | 'removed' | 'unchanged'

export interface DiffNode extends GraphNodeDTO { status: NodeDiffStatus }
export interface DiffEdge extends GraphEdgeDTO { status: EdgeDiffStatus }

export interface DiffSummary {
  addedNodes: number
  removedNodes: number
  changedNodes: number
  addedEdges: number
  removedEdges: number
}

export interface GraphDiff {
  level: Level
  scope: string | null
  base: string
  head: string
  nodes: DiffNode[]
  edges: DiffEdge[]
  summary: DiffSummary
}

export interface CommitInfo { sha: string; message: string; date: string }
export interface RefInfo {
  currentSha: string
  branches: string[]
  commits: CommitInfo[]
  snapshots: string[]
}
