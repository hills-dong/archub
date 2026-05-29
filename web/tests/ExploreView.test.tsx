import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { GraphResponse } from '../src/api/types'
import type { ArchubNodeData } from '../src/graph/layout'

// mock GraphCanvas：把节点渲染成按钮，便于触发点击下钻
vi.mock('../src/graph/GraphCanvas', () => ({
  GraphCanvas: ({ graph, onNodeClick }: { graph: GraphResponse; onNodeClick: (n: ArchubNodeData) => void }) => (
    <div data-testid="canvas">
      {graph.nodes.map((n) => (
        <button key={n.id} data-testid={`node-${n.id}`} onClick={() => onNodeClick(n as ArchubNodeData)}>{n.label}</button>
      ))}
    </div>
  ),
}))

const calls: Array<[string, string | null]> = []
vi.mock('../src/api/client', () => ({
  fetchGraph: vi.fn((level: string, scope: string | null) => {
    calls.push([level, scope])
    if (level === 'module') return Promise.resolve({ level, scope, nodes: [{ id: 'server/identity', label: 'server/identity', level: 'module', kind: 'module', language: 'rust', childCount: 2, filePath: null }], edges: [] })
    return Promise.resolve({ level, scope, nodes: [], edges: [] })
  }),
  fetchNode: vi.fn(() => Promise.resolve({ name: 'x' })),
  search: vi.fn(() => Promise.resolve([])),
}))

import { ExploreView } from '../src/explore/ExploreView'

beforeEach(() => { calls.length = 0 })

describe('ExploreView', () => {
  it('loads module overview then drills into a module', async () => {
    render(<ExploreView />)
    await waitFor(() => expect(screen.getByTestId('node-server/identity')).toBeInTheDocument())
    expect(calls[0]).toEqual(['module', null])
    fireEvent.click(screen.getByTestId('node-server/identity'))
    await waitFor(() => expect(calls.some(([l, s]) => l === 'file' && s === 'server/identity')).toBe(true))
    expect(within(screen.getByTestId('breadcrumb')).getByText('server/identity')).toBeInTheDocument()
  })
})
