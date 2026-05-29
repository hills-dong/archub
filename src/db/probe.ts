import { openCodegraphDb } from './connect.js'
import { introspectSchema, type TableInfo } from './introspect.js'

export function probe(projectRoot: string): TableInfo[] {
  const db = openCodegraphDb(projectRoot)
  try {
    return introspectSchema(db)
  } finally {
    db.close()
  }
}

export function formatProbe(tables: TableInfo[]): string {
  if (tables.length === 0) return 'No tables found.'
  return tables
    .map(
      (t) =>
        `${t.name} (${t.rowCount} rows)\n` +
        t.columns.map((c) => `  - ${c.name}: ${c.type || 'ANY'}`).join('\n'),
    )
    .join('\n\n')
}
