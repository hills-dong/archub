import { describe, it, expect } from 'vitest'
import { defaultModule, resolveModule } from '../../src/graph/modules.js'

describe('defaultModule', () => {
  it('uses top + first segment under src', () => {
    expect(defaultModule('server/src/identity/service.rs')).toBe('server/identity')
    expect(defaultModule('web/src/pages/Login.tsx')).toBe('web/pages')
  })
  it('treats a root-level file under src as its own module', () => {
    expect(defaultModule('server/src/main.rs')).toBe('server/main.rs')
  })
  it('handles lib as a source root', () => {
    expect(defaultModule('pkg/lib/core/x.ts')).toBe('pkg/core')
  })
  it('falls back to first two segments when no src/lib', () => {
    expect(defaultModule('server/tests/integration.rs')).toBe('server/tests')
  })
  it('falls back to the only segment for a bare filename', () => {
    expect(defaultModule('README.md')).toBe('README.md')
  })
})

describe('resolveModule with config', () => {
  it('matches the first glob rule', () => {
    const config = { modules: [{ glob: 'server/src/identity/**', name: 'auth' }] }
    expect(resolveModule('server/src/identity/service.rs', config)).toBe('auth')
  })
  it('falls back to defaultModule when no rule matches', () => {
    const config = { modules: [{ glob: 'web/**', name: 'frontend' }] }
    expect(resolveModule('server/src/data/x.rs', config)).toBe('server/data')
  })
})
