import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeSnapshot, readSnapshot, listSnapshots } from '../../src/snapshot/store.js'
import type { L0Graph } from '../../src/graph/types.js'

let dir = ''
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = '' })

const graph: L0Graph = {
  nodes: [{ id: 'rust:a.rs:function:f:1', cgId: 'c1', kind: 'function', name: 'f', qualifiedName: 'f', filePath: 'a.rs', language: 'rust', startLine: 1, endLine: 2, signature: null, visibility: null, isExported: false }],
  edges: [],
}

describe('snapshot store', () => {
  it('writes a gzipped snapshot + index and reads it back', () => {
    dir = mkdtempSync(join(tmpdir(), 'archub-snap-'))
    writeSnapshot(dir, { sha: 'abc123', createdAt: 1000, message: 'msg', graph })
    expect(existsSync(join(dir, '.archub', 'snapshots', 'abc123.json.gz'))).toBe(true)
    const back = readSnapshot(dir, 'abc123')
    expect(back?.graph.nodes[0].name).toBe('f')
    expect(back?.message).toBe('msg')
  })

  it('writes a .archub/.gitignore so the target repo ignores snapshots', () => {
    dir = mkdtempSync(join(tmpdir(), 'archub-snap-'))
    writeSnapshot(dir, { sha: 'abc123', createdAt: 1000, message: 'm', graph })
    expect(readFileSync(join(dir, '.archub', '.gitignore'), 'utf8')).toContain('*')
  })

  it('listSnapshots returns metas; re-writing the same sha de-dups', () => {
    dir = mkdtempSync(join(tmpdir(), 'archub-snap-'))
    writeSnapshot(dir, { sha: 's1', createdAt: 1, message: 'a', graph })
    writeSnapshot(dir, { sha: 's2', createdAt: 2, message: 'b', graph })
    writeSnapshot(dir, { sha: 's1', createdAt: 3, message: 'a2', graph }) // 覆盖 s1
    const metas = listSnapshots(dir)
    expect(metas.map((m) => m.sha).sort()).toEqual(['s1', 's2'])
    expect(metas.find((m) => m.sha === 's1')!.message).toBe('a2')
  })

  it('readSnapshot returns null for a missing sha', () => {
    dir = mkdtempSync(join(tmpdir(), 'archub-snap-'))
    expect(readSnapshot(dir, 'nope')).toBeNull()
  })
})
