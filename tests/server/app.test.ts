import { describe, it, expect } from 'vitest'
import request from 'supertest'
import Database from 'better-sqlite3'
import { GraphService } from '../../src/graph/service.js'
import { createApp } from '../../src/server/app.js'

function svc() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE nodes (id TEXT, kind TEXT, name TEXT, qualified_name TEXT, file_path TEXT, language TEXT, start_line INT, end_line INT, signature TEXT, visibility TEXT, is_exported INT);`)
  db.exec(`CREATE TABLE edges (id INTEGER PRIMARY KEY, source TEXT, target TEXT, kind TEXT, metadata TEXT, line INT, col INT, provenance TEXT);`)
  const n = db.prepare(`INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  n.run('c1', 'function', 'login', 'login', 'server/src/identity/service.rs', 'rust', 10, 20, null, 'public', 0)
  n.run('c2', 'function', 'create_token', 'create_token', 'server/src/common/auth.rs', 'rust', 5, 9, null, 'public', 0)
  db.prepare(`INSERT INTO edges (source,target,kind) VALUES (?,?,?)`).run('c1', 'c2', 'calls')
  return new GraphService(db)
}

describe('REST API', () => {
  const app = createApp(svc())

  it('GET /api/graph?level=module returns module graph', async () => {
    const res = await request(app).get('/api/graph?level=module')
    expect(res.status).toBe(200)
    expect(res.body.level).toBe('module')
    expect(res.body.nodes.map((n: { id: string }) => n.id).sort()).toEqual(['server/common', 'server/identity'])
  })

  it('GET /api/graph?level=file requires module param', async () => {
    const res = await request(app).get('/api/graph?level=file')
    expect(res.status).toBe(400)
  })

  it('GET /api/node returns detail or 404', async () => {
    const ok = await request(app).get('/api/node').query({ id: 'rust:server/src/identity/service.rs:function:login:10' })
    expect(ok.status).toBe(200)
    expect(ok.body.name).toBe('login')
    const miss = await request(app).get('/api/node').query({ id: 'nope' })
    expect(miss.status).toBe(404)
  })

  it('GET /api/search returns hits', async () => {
    const res = await request(app).get('/api/search').query({ q: 'login' })
    expect(res.status).toBe(200)
    expect(res.body[0].name).toBe('login')
  })
})
