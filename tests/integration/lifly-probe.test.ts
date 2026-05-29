import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { codegraphDbPath } from '../../src/db/connect.js'
import { probe } from '../../src/db/probe.js'

const LIFLY = '/home/hills/projects/lifly'
const hasDb = existsSync(codegraphDbPath(LIFLY))

describe.skipIf(!hasDb)('codegraph schema on real lifly db', () => {
  it('exposes at least one non-empty table (the node store)', () => {
    const tables = probe(LIFLY)
    expect(tables.length).toBeGreaterThan(0)
    expect(tables.some((t) => t.rowCount > 0)).toBe(true)
  })

  it('contains a node-like table (has a name/symbol column and a file/path column)', () => {
    const tables = probe(LIFLY)
    const nodeLike = tables.find(
      (t) =>
        t.columns.some((c) => /name|symbol/i.test(c.name)) &&
        t.columns.some((c) => /file|path/i.test(c.name)),
    )
    expect(nodeLike, 'expected a node-like table with name + file columns').toBeDefined()
  })

  it('contains an edge-like table (has two reference columns)', () => {
    const tables = probe(LIFLY)
    const edgeLike = tables.find(
      (t) =>
        t.columns.filter((c) =>
          /src|source|from|target|dst|dest|to|caller|callee|ref/i.test(c.name),
        ).length >= 2,
    )
    expect(edgeLike, 'expected an edge-like table with two reference columns').toBeDefined()
  })
})
