import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { simpleGit } from 'simple-git'
import { GraphService } from '../../src/graph/service.js'
import { DiffService, WORKING } from '../../src/diff/service.js'
import { GitRepo } from '../../src/git/repo.js'
import { writeSnapshot, listSnapshots } from '../../src/snapshot/store.js'
import { createApp } from '../../src/server/app.js'

function db() {
  const d = new Database(':memory:')
  d.exec(`CREATE TABLE nodes (id TEXT, kind TEXT, name TEXT, qualified_name TEXT, file_path TEXT, language TEXT, start_line INT, end_line INT, signature TEXT, visibility TEXT, is_exported INT);`)
  d.exec(`CREATE TABLE edges (id INTEGER PRIMARY KEY, source TEXT, target TEXT, kind TEXT, metadata TEXT, line INT, col INT, provenance TEXT);`)
  const n = d.prepare(`INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  n.run('c1', 'function', 'login', 'login', 'server/src/identity/service.rs', 'rust', 10, 20, null, 'public', 0)
  n.run('c2', 'function', 'create_token', 'create_token', 'server/src/common/auth.rs', 'rust', 5, 9, null, 'public', 0)
  d.prepare(`INSERT INTO edges (source,target,kind) VALUES (?,?,?)`).run('c1', 'c2', 'calls')
  return d
}

let dir = ''
let baseSha = ''
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'archub-diffapi-'))
  const g = simpleGit(dir)
  await g.init(); await g.addConfig('user.email', 't@e.com'); await g.addConfig('user.name', 't')
  writeFileSync(join(dir, 'x.txt'), '1'); await g.add('.'); await g.commit('base')
  baseSha = (await g.revparse(['HEAD'])).trim()
  writeSnapshot(dir, { sha: baseSha, createdAt: 1, message: 'base', graph: { nodes: [
    { id: 'rust:server/src/identity/service.rs:function:login:10', cgId: 'c1', kind: 'function', name: 'login', qualifiedName: 'login', filePath: 'server/src/identity/service.rs', language: 'rust', startLine: 10, endLine: 20, signature: null, visibility: null, isExported: false },
  ], edges: [] } })
})
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

function app() {
  const sharedDb = db()
  const graph = new GraphService(sharedDb)
  const diff = new DiffService(dir, sharedDb)
  const refs = async () => {
    const r = await new GitRepo(dir).refs()
    return { ...r, snapshots: listSnapshots(dir).map((m) => m.sha) }
  }
  return createApp(graph, { diff, refs })
}

describe('diff REST API', () => {
  it('GET /api/refs returns branches/commits/snapshots/currentSha', async () => {
    const res = await request(app()).get('/api/refs')
    expect(res.status).toBe(200)
    expect(res.body.currentSha).toMatch(/^[0-9a-f]{40}$/)
    expect(res.body.snapshots).toContain(baseSha)
    expect(Array.isArray(res.body.branches)).toBe(true)
  })

  it('GET /api/diff?base=<sha>&head=WORKING returns a diff', async () => {
    const res = await request(app()).get('/api/diff').query({ base: baseSha, head: WORKING, level: 'module' })
    expect(res.status).toBe(200)
    const byId = Object.fromEntries(res.body.nodes.map((n: { id: string; status: string }) => [n.id, n.status]))
    expect(byId['server/common']).toBe('added')
  })

  it('GET /api/diff with a base that has no snapshot returns 400', async () => {
    const res = await request(app()).get('/api/diff').query({ base: 'HEAD~99', head: WORKING, level: 'module' })
    expect(res.status).toBe(400)
  })

  it('GET /api/diff requires base & head', async () => {
    const res = await request(app()).get('/api/diff').query({ level: 'module' })
    expect(res.status).toBe(400)
  })
})
