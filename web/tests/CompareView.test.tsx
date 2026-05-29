import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: unknown }) => <div data-testid="rf">{children as never}</div>,
  Background: () => null, Controls: () => null,
  Handle: () => null, Position: { Top: 'top', Bottom: 'bottom' },
}))

const calls: Array<[string, string]> = []
vi.mock('../src/api/client', () => ({
  fetchRefs: vi.fn(() => Promise.resolve({ currentSha: 'a'.repeat(40), branches: ['main'], commits: [{ sha: 'b'.repeat(40), message: 'base commit', date: '' }], snapshots: ['b'.repeat(40)] })),
  fetchDiff: vi.fn((base: string, head: string) => {
    calls.push([base, head])
    return Promise.resolve({ level: 'module', scope: null, base, head, nodes: [{ id: 'server/common', label: 'server/common', level: 'module', kind: 'module', language: 'rust', childCount: 1, filePath: null, status: 'added' }], edges: [], summary: { addedNodes: 1, removedNodes: 0, changedNodes: 0, addedEdges: 0, removedEdges: 0 } })
  }),
}))

import { CompareView } from '../src/compare/CompareView'

beforeEach(() => { calls.length = 0 })

describe('CompareView', () => {
  it('loads refs, picks a snapshot base, fetches diff, shows the report', async () => {
    render(<CompareView />)
    await waitFor(() => expect(screen.getByTestId('diff-report')).toBeInTheDocument())
    expect(calls.some(([b, h]) => b === 'b'.repeat(40) && h === 'WORKING')).toBe(true)
    expect(within(screen.getByTestId('diff-report')).getByText('server/common')).toBeInTheDocument()
  })
})
