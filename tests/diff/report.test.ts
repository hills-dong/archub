import { describe, it, expect } from 'vitest'
import { toMarkdown } from '../../src/diff/report.js'
import type { GraphDiff } from '../../src/diff/types.js'

const diff: GraphDiff = {
  level: 'module', scope: null, base: 'main@aaaa', head: 'working tree',
  nodes: [
    { id: 'server/tool', label: 'server/tool', level: 'module', kind: 'module', language: 'rust', childCount: 3, filePath: null, status: 'added' },
    { id: 'server/legacy', label: 'server/legacy', level: 'module', kind: 'module', language: 'rust', childCount: 1, filePath: null, status: 'removed' },
    { id: 'server/capability', label: 'server/capability', level: 'module', kind: 'module', language: 'rust', childCount: 2, filePath: null, status: 'changed' },
    { id: 'server/common', label: 'server/common', level: 'module', kind: 'module', language: 'rust', childCount: 9, filePath: null, status: 'unchanged' },
  ],
  edges: [
    { source: 'server/capability', target: 'server/intelligence', weight: 1, status: 'added' },
    { source: 'server/tool', target: 'server/data', weight: 2, status: 'removed' },
    { source: 'server/identity', target: 'server/common', weight: 5, status: 'unchanged' },
  ],
  summary: { addedNodes: 1, removedNodes: 1, changedNodes: 1, addedEdges: 1, removedEdges: 1 },
}

describe('toMarkdown', () => {
  it('renders a grouped report with a summary line', () => {
    const md = toMarkdown(diff)
    expect(md).toContain('main@aaaa → working tree')
    expect(md).toContain('+1 / -1 nodes')
    expect(md).toContain('## Added')
    expect(md).toContain('+ server/tool')
    expect(md).toContain('## Removed')
    expect(md).toContain('- server/legacy')
    expect(md).toContain('## Changed')
    expect(md).toContain('~ server/capability')
    expect(md).toContain('## Added edges')
    expect(md).toContain('server/capability → server/intelligence')
    expect(md).toContain('## Removed edges')
    expect(md).toContain('server/tool → server/data')
  })

  it('omits empty sections and reports no changes', () => {
    const empty: GraphDiff = { ...diff, nodes: diff.nodes.filter((n) => n.status === 'unchanged'), edges: diff.edges.filter((e) => e.status === 'unchanged'), summary: { addedNodes: 0, removedNodes: 0, changedNodes: 0, addedEdges: 0, removedEdges: 0 } }
    const md = toMarkdown(empty)
    expect(md).toContain('No architecture changes')
    expect(md).not.toContain('## Added')
  })
})
