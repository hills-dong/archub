import { describe, it, expect } from 'vitest'
import type { execFileSync } from 'node:child_process'
import { syncCodegraph } from '../../src/codegraph/sync.js'

describe('syncCodegraph', () => {
  it('runs `codegraph sync` in the project dir and reports ok', () => {
    const calls: Array<[string, readonly string[] | undefined, unknown]> = []
    const fakeExec = ((cmd: string, args?: readonly string[], opts?: unknown) => {
      calls.push([cmd, args, opts]); return Buffer.from('')
    }) as unknown as typeof execFileSync
    const r = syncCodegraph('/some/proj', fakeExec)
    expect(r.ok).toBe(true)
    expect(calls[0][0]).toBe('codegraph')
    expect(calls[0][1]).toEqual(['sync'])
    expect((calls[0][2] as { cwd?: string }).cwd).toBe('/some/proj')
    expect((calls[0][2] as { stdio?: string }).stdio).toBe('ignore')
  })

  it('returns ok:false with the error message when codegraph is unavailable (does not throw)', () => {
    const fakeExec = (() => { throw new Error('spawn codegraph ENOENT') }) as unknown as typeof execFileSync
    const r = syncCodegraph('/some/proj', fakeExec)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/ENOENT/)
  })
})
