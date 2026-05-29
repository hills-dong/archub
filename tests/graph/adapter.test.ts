import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { loadL0Graph, AMBIGUOUS_NAME_MIN_DEFS, UBIQUITOUS_NAMES } from '../../src/graph/adapter.js'

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

describe('loadL0Graph precision filters', () => {
  function precisionDb(): Database.Database {
    const db = new Database(':memory:')
    db.exec(`CREATE TABLE nodes (id TEXT, kind TEXT, name TEXT, qualified_name TEXT, file_path TEXT, language TEXT, start_line INT, end_line INT, signature TEXT, visibility TEXT, is_exported INT);`)
    db.exec(`CREATE TABLE edges (id INTEGER PRIMARY KEY, source TEXT, target TEXT, kind TEXT, metadata TEXT, line INT, col INT, provenance TEXT);`)
    const n = db.prepare(`INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    n.run('rs:handler', 'function', 'login_handler', 'login_handler', 'server/src/admin/h.rs', 'rust', 1, 2, null, null, 0)
    n.run('sw:state', 'enum', 'State', 'State', 'ios/Lifly/W.swift', 'swift', 1, 2, null, null, 0) // cross-language target
    n.run('rs:tok', 'function', 'create_token', 'create_token', 'server/src/common/auth.rs', 'rust', 1, 2, null, null, 0) // unique name
    for (let i = 0; i < 4; i++) n.run('rs:new' + i, 'method', 'new', 'new', 'server/src/m' + i + '.rs', 'rust', 1, 2, null, null, 0) // 4 同名 'new' (ambiguous)
    const e = db.prepare(`INSERT INTO edges (source,target,kind) VALUES (?,?,?)`)
    e.run('rs:handler', 'sw:state', 'references') // 跨语言 → 丢
    e.run('rs:handler', 'rs:tok', 'calls')         // 同语言 + 唯一名 → 保留
    e.run('rs:handler', 'rs:new0', 'calls')        // 同语言 + 歧义名 'new'(4 个定义)→ 丢
    return db
  }

  it('drops cross-language edges (rust → swift)', () => {
    const g = loadL0Graph(precisionDb())
    expect(g.edges.some((e) => e.target.includes(':State:'))).toBe(false)
  })

  it('drops calls/references whose target name is shared by >= the ambiguity threshold of nodes', () => {
    const g = loadL0Graph(precisionDb())
    expect(g.edges.some((e) => e.kind === 'calls' && /:new:/.test(e.target))).toBe(false)
  })

  it('keeps a same-language edge to a uniquely-named target', () => {
    const g = loadL0Graph(precisionDb())
    expect(g.edges.filter((e) => e.target.includes(':create_token:'))).toHaveLength(1)
  })

  it('drops calls/references to a ubiquitous stdlib name even when only one such node exists', () => {
    const db = new Database(':memory:')
    db.exec(`CREATE TABLE nodes (id TEXT, kind TEXT, name TEXT, qualified_name TEXT, file_path TEXT, language TEXT, start_line INT, end_line INT, signature TEXT, visibility TEXT, is_exported INT);`)
    db.exec(`CREATE TABLE edges (id INTEGER PRIMARY KEY, source TEXT, target TEXT, kind TEXT, metadata TEXT, line INT, col INT, provenance TEXT);`)
    const n = db.prepare(`INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    n.run('rs:caller', 'function', 'save_file', 'save_file', 'server/src/common/x.rs', 'rust', 1, 2, null, null, 0)
    n.run('rs:new', 'method', 'new', 'Engine::new', 'server/src/tool/e.rs', 'rust', 1, 2, null, null, 0) // 唯一的 'new' (count=1)
    n.run('rs:fs', 'struct', 'FileStorage', 'FileStorage', 'server/src/data/m.rs', 'rust', 1, 2, null, null, 0) // 真实域名
    const e = db.prepare(`INSERT INTO edges (source,target,kind) VALUES (?,?,?)`)
    e.run('rs:caller', 'rs:new', 'calls')       // 常用名 'new'(count=1)→ 仍应被词表丢弃
    e.run('rs:caller', 'rs:fs', 'references')   // 真实域名 → 保留
    const g = loadL0Graph(db)
    expect(g.edges.some((x) => /:new:/.test(x.target))).toBe(false)        // 'new' 边被丢
    expect(g.edges.filter((x) => x.target.includes(':FileStorage:'))).toHaveLength(1) // 真实边保留
  })
})
