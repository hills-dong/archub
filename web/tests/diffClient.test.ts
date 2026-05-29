import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchRefs, fetchDiff } from '../src/api/client'

afterEach(() => vi.restoreAllMocks())
function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body }))
}

describe('diff api client', () => {
  it('fetchRefs hits /api/refs', async () => {
    mockFetch({ currentSha: 'x', branches: [], commits: [], snapshots: [] })
    await fetchRefs()
    expect(fetch).toHaveBeenCalledWith('/api/refs')
  })
  it('fetchDiff builds module-level query', async () => {
    mockFetch({ level: 'module', scope: null, base: 'b', head: 'h', nodes: [], edges: [], summary: {} })
    await fetchDiff('abc', 'WORKING', 'module', null)
    expect(fetch).toHaveBeenCalledWith('/api/diff?base=abc&head=WORKING&level=module')
  })
  it('fetchDiff adds module scope at file level', async () => {
    mockFetch({})
    await fetchDiff('abc', 'WORKING', 'file', 'server/identity')
    expect(fetch).toHaveBeenCalledWith('/api/diff?base=abc&head=WORKING&level=file&module=server%2Fidentity')
  })
  it('fetchDiff adds file scope at function level', async () => {
    mockFetch({})
    await fetchDiff('abc', 'WORKING', 'function', 'server/src/identity/service.rs')
    expect(fetch).toHaveBeenCalledWith('/api/diff?base=abc&head=WORKING&level=function&file=server%2Fsrc%2Fidentity%2Fservice.rs')
  })
})
