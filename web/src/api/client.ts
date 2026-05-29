import type { GraphResponse, Level, NodeDetail, SearchHit } from './types'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`request failed: ${res.status}`)
  return (await res.json()) as T
}

export function fetchGraph(level: Level, scope: string | null): Promise<GraphResponse> {
  if (level === 'file') return getJson(`/api/graph?level=file&module=${encodeURIComponent(scope ?? '')}`)
  if (level === 'function') return getJson(`/api/graph?level=function&file=${encodeURIComponent(scope ?? '')}`)
  return getJson('/api/graph?level=module')
}

export function fetchNode(id: string): Promise<NodeDetail> {
  return getJson(`/api/node?id=${encodeURIComponent(id)}`)
}

export function search(q: string): Promise<SearchHit[]> {
  return getJson(`/api/search?q=${encodeURIComponent(q)}`)
}
