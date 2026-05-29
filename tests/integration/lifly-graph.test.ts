import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { codegraphDbPath, openCodegraphDb } from '../../src/db/connect.js'
import { GraphService } from '../../src/graph/service.js'

const LIFLY = '/home/hills/projects/lifly'
const hasDb = existsSync(codegraphDbPath(LIFLY))

describe.skipIf(!hasDb)('archub graph on real lifly db', () => {
  const svc = new GraphService(openCodegraphDb(LIFLY))

  it('module overview contains real lifly backend modules', () => {
    const g = svc.getGraph('module', null)
    const ids = g.nodes.map((n) => n.id)
    expect(ids).toContain('server/identity')
    expect(ids).toContain('server/common')
    expect(g.edges.length).toBeGreaterThan(0)
    const idset = new Set(ids)
    expect(g.edges.every((e) => idset.has(e.source) && idset.has(e.target))).toBe(true)
  })

  it('drills from a module to its files', () => {
    const files = svc.getGraph('file', 'server/identity')
    expect(files.nodes.length).toBeGreaterThan(0)
    expect(files.nodes.every((n) => n.level === 'file')).toBe(true)
  })

  it('drills from a file to its functions', () => {
    const files = svc.getGraph('file', 'server/identity')
    const aFile = files.nodes[0].id
    const fns = svc.getGraph('function', aFile)
    expect(fns.nodes.length).toBeGreaterThan(0)
    expect(fns.nodes.every((n) => n.level === 'function' && n.childCount === 1)).toBe(true)
  })

  it('search finds a known Rust symbol', () => {
    const hits = svc.search('login')
    expect(hits.some((h) => h.name === 'login')).toBe(true)
  })
})
