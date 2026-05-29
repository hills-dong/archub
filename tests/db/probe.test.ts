import { describe, it, expect } from 'vitest'
import { formatProbe } from '../../src/db/probe.js'
import type { TableInfo } from '../../src/db/introspect.js'

describe('formatProbe', () => {
  it('renders each table with row count and columns', () => {
    const tables: TableInfo[] = [
      {
        name: 'nodes',
        rowCount: 2,
        columns: [
          { name: 'id', type: 'INTEGER' },
          { name: 'name', type: 'TEXT' },
        ],
      },
    ]
    const out = formatProbe(tables)
    expect(out).toContain('nodes (2 rows)')
    expect(out).toContain('- id: INTEGER')
    expect(out).toContain('- name: TEXT')
  })

  it('handles an empty schema', () => {
    expect(formatProbe([])).toBe('No tables found.')
  })
})
