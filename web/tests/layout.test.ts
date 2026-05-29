import { describe, it, expect } from 'vitest'
import { layoutGraph } from '../src/graph/layout'
import type { GraphResponse } from '../src/api/types'

const g: GraphResponse = {
  level: 'module', scope: null,
  nodes: [
    { id: 'a', label: 'a', level: 'module', kind: 'module', language: 'rust', childCount: 3, filePath: null },
    { id: 'b', label: 'b', level: 'module', kind: 'module', language: 'rust', childCount: 2, filePath: null },
    { id: 'c', label: 'c', level: 'module', kind: 'module', language: 'rust', childCount: 1, filePath: null },
  ],
  edges: [
    { source: 'a', target: 'b', weight: 5 },
    { source: 'b', target: 'c', weight: 1 },
  ],
}

describe('layoutGraph', () => {
  it('assigns positions to every node and carries data', () => {
    const { nodes } = layoutGraph(g)
    expect(nodes).toHaveLength(3)
    expect(nodes.every((n) => typeof n.position.x === 'number' && typeof n.position.y === 'number')).toBe(true)
    const a = nodes.find((n) => n.id === 'a')!
    expect(a.data.label).toBe('a')
    expect(a.data.childCount).toBe(3)
    expect(a.type).toBe('archubNode')
  })
  it('maps edges with ids, weight-based stroke width, and weight label only when >1', () => {
    const { edges } = layoutGraph(g)
    expect(edges).toHaveLength(2)
    const ab = edges.find((e) => e.id === 'a->b')!
    expect(ab.source).toBe('a')
    expect(ab.target).toBe('b')
    expect(ab.label).toBe('5')                          // weight 5 → labeled
    expect(ab.style?.strokeWidth).toBeCloseTo(1 + Math.log2(6), 5)
    const bc = edges.find((e) => e.id === 'b->c')!
    expect(bc.label).toBeUndefined()                    // weight 1 → no label
    expect(bc.style?.strokeWidth).toBe(2)               // 1 + log2(2) = 2
  })
})
