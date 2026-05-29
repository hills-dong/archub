export type Level = 'module' | 'file' | 'function'
export interface GraphNodeDTO { id: string; label: string; level: Level; kind: string; language: string | null; childCount: number; filePath: string | null }
export interface GraphEdgeDTO { source: string; target: string; weight: number }
export interface GraphResponse { level: Level; scope: string | null; nodes: GraphNodeDTO[]; edges: GraphEdgeDTO[] }
export interface NodeDetail { id: string; name: string; qualifiedName: string; kind: string; filePath: string; language: string; startLine: number; endLine: number; signature: string | null; visibility: string | null; isExported: boolean }
export interface SearchHit { id: string; name: string; qualifiedName: string; kind: string; filePath: string; module: string }

export type NodeDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'
export type EdgeDiffStatus = 'added' | 'removed' | 'unchanged'
export interface DiffNode extends GraphNodeDTO { status: NodeDiffStatus }
export interface DiffEdge extends GraphEdgeDTO { status: EdgeDiffStatus }
export interface DiffSummary { addedNodes: number; removedNodes: number; changedNodes: number; addedEdges: number; removedEdges: number }
export interface GraphDiff { level: Level; scope: string | null; base: string; head: string; nodes: DiffNode[]; edges: DiffEdge[]; summary: DiffSummary }
export interface CommitInfo { sha: string; message: string; date: string }
export interface RefInfo { currentSha: string; branches: string[]; commits: CommitInfo[]; snapshots: string[] }
