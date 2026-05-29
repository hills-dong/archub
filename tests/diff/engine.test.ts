import { describe, it, expect } from 'vitest'
import { diffGraphs } from '../../src/diff/engine.js'
import { defaultModule } from '../../src/graph/modules.js'
import type { L0Graph, L0Node } from '../../src/graph/types.js'

const mod = (fp: string) => defaultModule(fp)
function n(file: string, name: string, line: number): L0Node {
  return { id: `rust:${file}:function:${name}:${line}`, cgId: name, kind: 'function', name, qualifiedName: name, filePath: file, language: 'rust', startLine: line, endLine: line + 1, signature: null, visibility: null, isExported: false }
}
const A = n('server/src/identity/a.rs', 'a', 1)
const B = n('server/src/common/b.rs', 'b', 1)
const C = n('server/src/tool/c.rs', 'c', 1)

describe('diffGraphs (module level)', () => {
  it('detects added/removed modules and added/removed edges', () => {
    const base: L0Graph = { nodes: [A, B], edges: [{ source: A.id, target: B.id, kind: 'calls' }] }
    const head: L0Graph = { nodes: [A, C], edges: [{ source: A.id, target: C.id, kind: 'calls' }] }
    const d = diffGraphs(base, head, 'module', null, mod, 'base', 'head')
    const byId = Object.fromEntries(d.nodes.map((x) => [x.id, x.status]))
    expect(byId['server/common']).toBe('removed')
    expect(byId['server/tool']).toBe('added')
    expect(byId['server/identity']).toBe('changed')
    const edge = (s: string, t: string) => d.edges.find((e) => e.source === s && e.target === t)
    expect(edge('server/identity', 'server/common')!.status).toBe('removed')
    expect(edge('server/identity', 'server/tool')!.status).toBe('added')
    expect(d.summary).toEqual({ addedNodes: 1, removedNodes: 1, changedNodes: 1, addedEdges: 1, removedEdges: 1 })
  })

  it('marks a node unchanged when its out-edges are identical', () => {
    const g: L0Graph = { nodes: [A, B], edges: [{ source: A.id, target: B.id, kind: 'calls' }] }
    const d = diffGraphs(g, g, 'module', null, mod, 'base', 'head')
    expect(d.nodes.every((x) => x.status === 'unchanged')).toBe(true)
    expect(d.edges.every((e) => e.status === 'unchanged')).toBe(true)
    expect(d.summary).toEqual({ addedNodes: 0, removedNodes: 0, changedNodes: 0, addedEdges: 0, removedEdges: 0 })
  })

  it('marks a node changed when an out-edge weight changes (more underlying L0 edges)', () => {
    const A2 = n('server/src/identity/a.rs', 'a2', 5)
    const base: L0Graph = { nodes: [A, B], edges: [{ source: A.id, target: B.id, kind: 'calls' }] }
    const head: L0Graph = { nodes: [A, A2, B], edges: [{ source: A.id, target: B.id, kind: 'calls' }, { source: A2.id, target: B.id, kind: 'calls' }] }
    const d = diffGraphs(base, head, 'module', null, mod, 'base', 'head')
    expect(d.nodes.find((x) => x.id === 'server/identity')!.status).toBe('changed')
    expect(d.edges.find((e) => e.source === 'server/identity' && e.target === 'server/common')!.status).toBe('unchanged')
  })

  it('does not collide distinct edges when module names contain spaces', () => {
    // 自定义 resolver 产出带空格的模块名，验证 edgeKey 不会把两条不同边混为一条
    const spacedMod = (fp: string): string => {
      if (fp.includes('/x/')) return 'my server'
      if (fp.includes('/y/')) return 'auth'
      return 'my' // 使 "my" + "server auth" 等潜在碰撞场景成立
    }
    const p = (file: string, name: string, line: number): L0Node => ({ id: `rust:${file}:function:${name}:${line}`, cgId: name, kind: 'function', name, qualifiedName: name, filePath: file, language: 'rust', startLine: line, endLine: line + 1, signature: null, visibility: null, isExported: false })
    const s1 = p('pkg/x/a.rs', 'a', 1)   // module "my server"
    const t1 = p('pkg/y/b.rs', 'b', 1)   // module "auth"
    const s2 = p('pkg/z/c.rs', 'c', 1)   // module "my"
    const base: L0Graph = { nodes: [s1, t1, s2], edges: [] }
    // head 有两条边: "my server" -> "auth"  和  "my" -> "auth"（若用空格分隔 key 会与 "my" + "server auth" 之类相撞；此处验证两条边都各自保留）
    const head: L0Graph = { nodes: [s1, t1, s2], edges: [
      { source: s1.id, target: t1.id, kind: 'calls' }, // my server -> auth
      { source: s2.id, target: t1.id, kind: 'calls' }, // my -> auth
    ] }
    const d = diffGraphs(base, head, 'module', null, spacedMod, 'base', 'head')
    const added = d.edges.filter((e) => e.status === 'added')
    expect(added).toHaveLength(2) // 两条不同的新增边都在，没有相撞丢失
    expect(added.some((e) => e.source === 'my server' && e.target === 'auth')).toBe(true)
    expect(added.some((e) => e.source === 'my' && e.target === 'auth')).toBe(true)
  })
})
