import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { openCodegraphDb, codegraphDbPath } from '../../src/db/connect.js'

let tmp = ''
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  tmp = ''
})

describe('openCodegraphDb', () => {
  it('opens an existing codegraph db read-only', () => {
    tmp = mkdtempSync(join(tmpdir(), 'archub-'))
    mkdirSync(join(tmp, '.codegraph'))
    new Database(codegraphDbPath(tmp)).close() // 先创建该文件
    const db = openCodegraphDb(tmp)
    expect(db.open).toBe(true)
    db.close()
  })

  it('throws a clear error when the db is missing', () => {
    tmp = mkdtempSync(join(tmpdir(), 'archub-'))
    expect(() => openCodegraphDb(tmp)).toThrow(/No codegraph database/)
  })
})
