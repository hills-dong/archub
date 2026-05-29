import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

export function codegraphDbPath(projectRoot: string): string {
  return join(resolve(projectRoot), '.codegraph', 'codegraph.db')
}

export function openCodegraphDb(projectRoot: string): Database.Database {
  const path = codegraphDbPath(projectRoot)
  if (!existsSync(path)) {
    throw new Error(
      `No codegraph database at ${path}. Run \`codegraph init -i\` in ${projectRoot} first.`,
    )
  }
  // 只读打开: codegraph 的 watcher 可能正持有写连接
  return new Database(path, { readonly: true, fileMustExist: true })
}
