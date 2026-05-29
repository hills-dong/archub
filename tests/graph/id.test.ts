import { describe, it, expect } from 'vitest'
import { archubId } from '../../src/graph/id.js'

describe('archubId', () => {
  it('builds a 5-part stable id', () => {
    expect(
      archubId({ language: 'rust', filePath: 'server/src/identity/service.rs', kind: 'function', qualifiedName: 'login', startLine: 13 }),
    ).toBe('rust:server/src/identity/service.rs:function:login:13')
  })

  it('disambiguates same-name imports by start line', () => {
    const a = archubId({ language: 'rust', filePath: 'a.rs', kind: 'import', qualifiedName: 'axum', startLine: 1 })
    const b = archubId({ language: 'rust', filePath: 'a.rs', kind: 'import', qualifiedName: 'axum', startLine: 2 })
    expect(a).not.toBe(b)
  })
})
