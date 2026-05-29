import type Database from 'better-sqlite3'

export interface ColumnInfo {
  name: string
  type: string
}

export interface TableInfo {
  name: string
  columns: ColumnInfo[]
  rowCount: number
}

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}

export function introspectSchema(db: Database.Database): TableInfo[] {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all() as { name: string }[]

  return tables.map(({ name }) => {
    const columns = (
      db.prepare(`PRAGMA table_info(${quoteIdent(name)})`).all() as {
        name: string
        type: string
      }[]
    ).map((c) => ({ name: c.name, type: c.type }))

    const { n } = db
      .prepare(`SELECT COUNT(*) AS n FROM ${quoteIdent(name)}`)
      .get() as { n: number }

    return { name, columns, rowCount: n }
  })
}
