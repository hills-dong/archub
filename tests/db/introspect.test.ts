import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { introspectSchema } from '../../src/db/introspect.js'

describe('introspectSchema', () => {
  it('reports tables, their columns, and row counts', () => {
    const db = new Database(':memory:')
    db.exec(`CREATE TABLE nodes (id INTEGER PRIMARY KEY, name TEXT, file TEXT);`)
    db.exec(`CREATE TABLE edges (src INTEGER, dst INTEGER, kind TEXT);`)
    db.prepare(`INSERT INTO nodes (name, file) VALUES (?, ?)`).run('login', 'a.rs')
    db.prepare(`INSERT INTO nodes (name, file) VALUES (?, ?)`).run('logout', 'a.rs')

    const schema = introspectSchema(db)

    const nodes = schema.find((t) => t.name === 'nodes')
    expect(nodes).toBeDefined()
    expect(nodes!.rowCount).toBe(2)
    expect(nodes!.columns.map((c) => c.name)).toEqual(['id', 'name', 'file'])

    const edges = schema.find((t) => t.name === 'edges')
    expect(edges!.rowCount).toBe(0)
    expect(edges!.columns.map((c) => c.name)).toEqual(['src', 'dst', 'kind'])
    db.close()
  })

  it('skips internal sqlite_ tables', () => {
    const db = new Database(':memory:')
    // AUTOINCREMENT forces SQLite to create the internal `sqlite_sequence` table
    db.exec(`CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, x INTEGER);`)
    db.prepare(`INSERT INTO t (x) VALUES (?)`).run(1) // ensure sqlite_sequence is populated
    const names = introspectSchema(db).map((t) => t.name)
    expect(names).toContain('t')
    expect(names).not.toContain('sqlite_sequence')
    expect(names.some((n) => n.startsWith('sqlite_'))).toBe(false)
    db.close()
  })
})
