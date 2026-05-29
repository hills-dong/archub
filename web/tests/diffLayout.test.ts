import { describe, it, expect } from 'vitest'
import { layoutDiff, STATUS_COLOR } from '../src/graph/diffLayout'
import type { GraphDiff } from '../src/api/types'

const d: GraphDiff = {
  level: 'module', scope: null, base: 'b', head: 'h',
  nodes: [
    { id: 'a', label: 'a', level: 'module', kind: 'module', language: 'rust', childCount: 1, filePath: null, status: 'added' },
    { id: 'b', label: 'b', level: 'module', kind: 'module', language: 'rust', childCount: 1, filePath: null, status: 'removed' },
    { id: 'c', label: 'c', level: 'module', kind: 'module', language: 'rust', childCount: 1, filePath: null, status: 'changed' },
    { id: 'u', label: 'u', level: 'module', kind: 'module', language: 'rust', childCount: 1, filePath: null, status: 'unchanged' },
  ],
  edges: [
    { source: 'a', target: 'c', weight: 1, status: 'added' },
    { source: 'b', target: 'c', weight: 1, status: 'removed' },
    { source: 'u', target: 'c', weight: 1, status: 'unchanged' },
  ],
  summary: { addedNodes: 1, removedNodes: 1, changedNodes: 1, addedEdges: 1, removedEdges: 1 },
}

describe('layoutDiff', () => {
  it('positions every node with finite coordinates and colors by status', () => {
    const { nodes } = layoutDiff(d)
    expect(nodes).toHaveLength(4)
    expect(nodes.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y))).toBe(true)
    expect(nodes.every((n) => n.type === 'diffNode')).toBe(true)
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n.data]))
    expect(byId.a.status).toBe('added')
    expect(byId.a.color).toBe(STATUS_COLOR.added)
    expect(byId.b.color).toBe(STATUS_COLOR.removed)
    expect(byId.c.color).toBe(STATUS_COLOR.changed)
    expect(byId.u.color).toBe(STATUS_COLOR.unchanged) // exercises the unchanged color path
  })

  it('colors edges by status; removed edges are dashed and others are not', () => {
    const { edges } = layoutDiff(d)
    const removed = edges.find((e) => e.id === 'b->c')!
    expect(removed.style?.stroke).toBe(STATUS_COLOR.removed)
    expect(removed.style?.strokeDasharray).toBe('6 4') // exact dash pattern
    const added = edges.find((e) => e.id === 'a->c')!
    expect(added.style?.stroke).toBe(STATUS_COLOR.added)
    expect(added.style?.strokeDasharray).toBeUndefined() // non-removed: no dash
    const unchanged = edges.find((e) => e.id === 'u->c')!
    expect(unchanged.style?.stroke).toBe(STATUS_COLOR.unchanged)
    expect(unchanged.style?.strokeDasharray).toBeUndefined()
  })
})
