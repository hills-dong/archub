import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { codegraphDbPath, openCodegraphDb } from '../../src/db/connect.js'
import { loadL0Graph } from '../../src/graph/adapter.js'
import { diffGraphs } from '../../src/diff/engine.js'
import { defaultModule } from '../../src/graph/modules.js'

const LIFLY = '/home/hills/projects/lifly'
const hasDb = existsSync(codegraphDbPath(LIFLY))
const mod = (fp: string) => defaultModule(fp)

describe.skipIf(!hasDb)('diff on real lifly graph', () => {
  it('reports a module as added when it is absent from the base graph', () => {
    const head = loadL0Graph(openCodegraphDb(LIFLY))
    const dropped = new Set(head.nodes.filter((n) => mod(n.filePath) === 'server/identity').map((n) => n.id))
    expect(dropped.size).toBeGreaterThan(0)
    const base = {
      nodes: head.nodes.filter((n) => !dropped.has(n.id)),
      edges: head.edges.filter((e) => !dropped.has(e.source) && !dropped.has(e.target)),
    }
    const d = diffGraphs(base, head, 'module', null, mod, 'base', 'head')
    expect(d.nodes.find((n) => n.id === 'server/identity')!.status).toBe('added')
    expect(d.summary.addedNodes).toBeGreaterThanOrEqual(1)
  })

  it('reports no changes when diffing the live graph against itself', () => {
    const g = loadL0Graph(openCodegraphDb(LIFLY))
    const d = diffGraphs(g, g, 'module', null, mod, 'base', 'head')
    expect(d.summary).toEqual({ addedNodes: 0, removedNodes: 0, changedNodes: 0, addedEdges: 0, removedEdges: 0 })
  })
})
