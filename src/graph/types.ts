export type Level = 'module' | 'file' | 'function'

// ---- L0 内部类型（不出 API） ----
export interface L0Node {
  id: string            // archub 稳定 ID
  cgId: string          // codegraph nodes.id（用于翻译边）
  kind: string
  name: string
  qualifiedName: string
  filePath: string
  language: string
  startLine: number
  endLine: number
  signature: string | null
  visibility: string | null
  isExported: boolean
}
export interface L0Edge {
  source: string        // archub 稳定 ID
  target: string        // archub 稳定 ID
  kind: string          // calls | references | instantiates
}
export interface L0Graph {
  nodes: L0Node[]
  edges: L0Edge[]
}

// ---- API DTO ----
export interface GraphNodeDTO {
  id: string
  label: string
  level: Level
  kind: string
  language: string | null
  childCount: number
  filePath: string | null
}
export interface GraphEdgeDTO {
  source: string
  target: string
  weight: number
}
export interface GraphResponse {
  level: Level
  scope: string | null
  nodes: GraphNodeDTO[]
  edges: GraphEdgeDTO[]
}
export interface NodeDetail {
  id: string
  name: string
  qualifiedName: string
  kind: string
  filePath: string
  language: string
  startLine: number
  endLine: number
  signature: string | null
  visibility: string | null
  isExported: boolean
}
export interface SearchHit {
  id: string
  name: string
  qualifiedName: string
  kind: string
  filePath: string
  module: string
}
