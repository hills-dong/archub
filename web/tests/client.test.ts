import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchGraph, fetchNode, search } from '../src/api/client'

afterEach(() => vi.restoreAllMocks())

function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body }))
}

describe('api client', () => {
  it('fetchGraph builds module url', async () => {
    mockFetch({ level: 'module', scope: null, nodes: [], edges: [] })
    await fetchGraph('module', null)
    expect(fetch).toHaveBeenCalledWith('/api/graph?level=module')
  })
  it('fetchGraph builds file url with module scope', async () => {
    mockFetch({ level: 'file', scope: 'server/identity', nodes: [], edges: [] })
    await fetchGraph('file', 'server/identity')
    expect(fetch).toHaveBeenCalledWith('/api/graph?level=file&module=server%2Fidentity')
  })
  it('fetchNode encodes id', async () => {
    mockFetch({ name: 'login' })
    await fetchNode('rust:a.rs:function:login:10')
    expect(fetch).toHaveBeenCalledWith('/api/node?id=rust%3Aa.rs%3Afunction%3Alogin%3A10')
  })
  it('search builds query', async () => {
    mockFetch([])
    await search('tok en')
    expect(fetch).toHaveBeenCalledWith('/api/search?q=tok%20en')
  })
})
