import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { getVersion } from '../src/version.js'

const require = createRequire(import.meta.url)
const pkg = require('../package.json') as { version: string }

describe('getVersion', () => {
  it('returns the version declared in package.json', () => {
    expect(getVersion()).toBe(pkg.version)
  })

  it('returns a semver-shaped string', () => {
    expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/)
  })
})
