import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { GitRepo } from '../../src/git/repo.js'

let dir = ''
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'archub-git-'))
  const g = simpleGit(dir)
  await g.init()
  await g.addConfig('user.email', 'test@example.com')
  await g.addConfig('user.name', 'test')
  writeFileSync(join(dir, 'a.txt'), 'one')
  await g.add('.'); await g.commit('first commit')
  writeFileSync(join(dir, 'a.txt'), 'two')
  await g.add('.'); await g.commit('second commit')
})
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

describe('GitRepo', () => {
  it('currentSha returns the HEAD sha (40 hex, no newline)', async () => {
    const sha = await new GitRepo(dir).currentSha()
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
  })
  it('resolveRef resolves HEAD and HEAD~1 to distinct shas', async () => {
    const repo = new GitRepo(dir)
    const head = await repo.resolveRef('HEAD')
    const prev = await repo.resolveRef('HEAD~1')
    expect(head).toMatch(/^[0-9a-f]{40}$/)
    expect(prev).not.toBe(head)
  })
  it('refs lists current sha, branches, and recent commits', async () => {
    const refs = await new GitRepo(dir).refs()
    expect(refs.currentSha).toMatch(/^[0-9a-f]{40}$/)
    expect(refs.branches.length).toBeGreaterThan(0)
    expect(refs.commits.map((c) => c.message)).toContain('second commit')
    expect(refs.commits[0].sha).toMatch(/^[0-9a-f]{40}$/)
  })
})
