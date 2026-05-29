import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { GraphService } from '../../src/graph/service.js'

function fixture() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE nodes (id TEXT, kind TEXT, name TEXT, qualified_name TEXT, file_path TEXT, language TEXT, start_line INT, end_line INT, signature TEXT, visibility TEXT, is_exported INT);`)
  db.exec(`CREATE TABLE edges (id INTEGER PRIMARY KEY, source TEXT, target TEXT, kind TEXT, metadata TEXT, line INT, col INT, provenance TEXT);`)
  const n = db.prepare(`INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  n.run('c1', 'function', 'login', 'login', 'server/src/identity/service.rs', 'rust', 10, 20, '() -> R', 'public', 0)
  n.run('c2', 'function', 'create_token', 'create_token', 'server/src/common/auth.rs', 'rust', 5, 9, null, 'public', 0)
  db.prepare(`INSERT INTO edges (source,target,kind) VALUES (?,?,?)`).run('c1', 'c2', 'calls')
  return db
}

describe('GraphService', () => {
  it('getGraph module overview', () => {
    const svc = new GraphService(fixture())
    const r = svc.getGraph('module', null)
    expect(r.level).toBe('module')
    expect(r.nodes.map((n) => n.id).sort()).toEqual(['server/common', 'server/identity'])
    expect(r.edges).toEqual([{ source: 'server/identity', target: 'server/common', weight: 1 }])
  })

  it('getNode returns L0 detail by archub id', () => {
    const svc = new GraphService(fixture())
    const d = svc.getNode('rust:server/src/identity/service.rs:function:login:10')
    expect(d?.name).toBe('login')
    expect(d?.signature).toBe('() -> R')
    expect(svc.getNode('nope')).toBeNull()
  })

  it('search matches name/qualified_name and includes module', () => {
    const svc = new GraphService(fixture())
    const hits = svc.search('token')
    expect(hits).toHaveLength(1)
    expect(hits[0].name).toBe('create_token')
    expect(hits[0].module).toBe('server/common')
  })
})
