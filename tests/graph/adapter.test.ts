import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { loadL0Graph } from '../../src/graph/adapter.js'

function fixture(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE nodes (id TEXT, kind TEXT, name TEXT, qualified_name TEXT, file_path TEXT,
    language TEXT, start_line INT, end_line INT, signature TEXT, visibility TEXT, is_exported INT);`)
  db.exec(`CREATE TABLE edges (id INTEGER PRIMARY KEY, source TEXT, target TEXT, kind TEXT, metadata TEXT, line INT, col INT, provenance TEXT);`)
  const n = db.prepare(`INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  n.run('function:h1', 'function', 'login', 'login', 'a.rs', 'rust', 10, 20, '() -> R', 'public', 0)
  n.run('function:h2', 'function', 'create_token', 'create_token', 'b.rs', 'rust', 5, 9, null, 'public', 0)
  n.run('file:a.rs', 'file', 'a.rs', 'a.rs', 'a.rs', 'rust', 1, 1, null, null, 0)         // 应被排除
  n.run('import:h3', 'import', 'axum', 'axum', 'a.rs', 'rust', 1, 1, null, null, 0)        // 应被排除
  const e = db.prepare(`INSERT INTO edges (source,target,kind) VALUES (?,?,?)`)
  e.run('function:h1', 'function:h2', 'calls')        // 保留 (login -> create_token)
  e.run('file:a.rs', 'function:h1', 'contains')       // 丢弃 (contains)
  e.run('file:a.rs', 'import:h3', 'imports')          // 丢弃 (imports)
  e.run('function:h1', 'import:h3', 'references')     // 丢弃 (target 是被排除的 import 节点)
  return db
}

describe('loadL0Graph', () => {
  it('keeps only symbol nodes (drops file/import)', () => {
    const g = loadL0Graph(fixture())
    expect(g.nodes.map((x) => x.name).sort()).toEqual(['create_token', 'login'])
  })

  it('maps node id to 5-part archub id', () => {
    const g = loadL0Graph(fixture())
    const login = g.nodes.find((x) => x.name === 'login')!
    expect(login.id).toBe('rust:a.rs:function:login:10')
    expect(login.cgId).toBe('function:h1')
  })

  it('keeps only calls/references/instantiates edges with both endpoints retained, translated to archub ids', () => {
    const g = loadL0Graph(fixture())
    expect(g.edges).toEqual([
      { source: 'rust:a.rs:function:login:10', target: 'rust:b.rs:function:create_token:5', kind: 'calls' },
    ])
  })
})
