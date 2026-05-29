import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { simpleGit } from 'simple-git'
import { writeSnapshot } from '../../src/snapshot/store.js'
import { DiffService, WORKING } from '../../src/diff/service.js'

function workingDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE nodes (id TEXT, kind TEXT, name TEXT, qualified_name TEXT, file_path TEXT, language TEXT, start_line INT, end_line INT, signature TEXT, visibility TEXT, is_exported INT);`)
  db.exec(`CREATE TABLE edges (id INTEGER PRIMARY KEY, source TEXT, target TEXT, kind TEXT, metadata TEXT, line INT, col INT, provenance TEXT);`)
  const n = db.prepare(`INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  n.run('c1', 'function', 'login', 'login', 'server/src/identity/service.rs', 'rust', 10, 20, null, 'public', 0)
  n.run('c2', 'function', 'create_token', 'create_token', 'server/src/common/auth.rs', 'rust', 5, 9, null, 'public', 0)
  db.prepare(`INSERT INTO edges (source,target,kind) VALUES (?,?,?)`).run('c1', 'c2', 'calls')
  return db
}

let dir = ''
let baseSha = ''
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'archub-diffsvc-'))
  const g = simpleGit(dir)
  await g.init(); await g.addConfig('user.email', 't@e.com'); await g.addConfig('user.name', 't')
  writeFileSync(join(dir, 'x.txt'), '1'); await g.add('.'); await g.commit('base')
  baseSha = (await g.revparse(['HEAD'])).trim()
  writeSnapshot(dir, { sha: baseSha, createdAt: 1, message: 'base', graph: { nodes: [
    { id: 'rust:server/src/identity/service.rs:function:login:10', cgId: 'c1', kind: 'function', name: 'login', qualifiedName: 'login', filePath: 'server/src/identity/service.rs', language: 'rust', startLine: 10, endLine: 20, signature: null, visibility: null, isExported: false },
  ], edges: [] } })
})
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

describe('DiffService', () => {
  it('diffs a stored base snapshot against the live WORKING tree', async () => {
    const svc = new DiffService(dir, workingDb())
    const d = await svc.diff(baseSha, WORKING, 'module', null)
    const byId = Object.fromEntries(d.nodes.map((n) => [n.id, n.status]))
    expect(byId['server/common']).toBe('added')
    expect(byId['server/identity']).toBe('changed')
    expect(d.edges.find((e) => e.source === 'server/identity' && e.target === 'server/common')!.status).toBe('added')
    expect(d.head).toContain('working')
  })

  it('throws a clear error when the base ref has no snapshot', async () => {
    const g = simpleGit(dir)
    writeFileSync(join(dir, 'y.txt'), '2'); await g.add('.'); await g.commit('second (no snapshot)')
    const svc = new DiffService(dir, workingDb())
    await expect(svc.diff('HEAD', WORKING, 'module', null)).rejects.toThrow(/No snapshot/)
  })
})
