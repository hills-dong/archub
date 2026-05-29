import { describe, it, expect } from 'vitest'
import { aggregate } from '../../src/graph/aggregate.js'
import type { L0Graph } from '../../src/graph/types.js'
import { defaultModule } from '../../src/graph/modules.js'

const g: L0Graph = {
  nodes: [
    { id: 'rust:server/src/identity/service.rs:function:login:10', cgId: 'c1', kind: 'function', name: 'login', qualifiedName: 'login', filePath: 'server/src/identity/service.rs', language: 'rust', startLine: 10, endLine: 20, signature: null, visibility: 'public', isExported: false },
    { id: 'rust:server/src/common/auth.rs:function:create_token:5', cgId: 'c2', kind: 'function', name: 'create_token', qualifiedName: 'create_token', filePath: 'server/src/common/auth.rs', language: 'rust', startLine: 5, endLine: 9, signature: null, visibility: 'public', isExported: false },
    { id: 'rust:server/src/identity/service.rs:function:helper:30', cgId: 'c3', kind: 'function', name: 'helper', qualifiedName: 'helper', filePath: 'server/src/identity/service.rs', language: 'rust', startLine: 30, endLine: 35, signature: null, visibility: 'private', isExported: false },
  ],
  edges: [
    { source: 'rust:server/src/identity/service.rs:function:login:10', target: 'rust:server/src/common/auth.rs:function:create_token:5', kind: 'calls' },
    { source: 'rust:server/src/identity/service.rs:function:login:10', target: 'rust:server/src/identity/service.rs:function:helper:30', kind: 'calls' },
  ],
}
const mod = (fp: string) => defaultModule(fp)

describe('aggregate', () => {
  it('module level: nodes are modules with childCount, edges are cross-module deps with weight', () => {
    const r = aggregate(g, 'module', null, mod)
    expect(r.nodes.map((n) => n.id).sort()).toEqual(['server/common', 'server/identity'])
    const identity = r.nodes.find((n) => n.id === 'server/identity')!
    expect(identity.childCount).toBe(2) // login + helper
    expect(identity.level).toBe('module')
    // login->create_token 跨模块; login->helper 同模块(丢弃)
    expect(r.edges).toEqual([{ source: 'server/identity', target: 'server/common', weight: 1 }])
  })

  it('file level scoped to a module: only that module files, intra-module file edges', () => {
    const r = aggregate(g, 'file', 'server/identity', mod)
    expect(r.nodes.map((n) => n.id)).toEqual(['server/src/identity/service.rs'])
    expect(r.nodes[0].childCount).toBe(2)
    expect(r.edges).toEqual([]) // login->helper 同文件(自环丢弃); login->create_token 出了本模块(不计)
  })

  it('function level scoped to a file: symbols in file + intra-file edges', () => {
    const r = aggregate(g, 'function', 'server/src/identity/service.rs', mod)
    expect(r.nodes.map((n) => n.id).sort()).toEqual([
      'rust:server/src/identity/service.rs:function:helper:30',
      'rust:server/src/identity/service.rs:function:login:10',
    ])
    expect(r.nodes.every((n) => n.childCount === 1 && n.level === 'function')).toBe(true)
    expect(r.edges).toEqual([
      { source: 'rust:server/src/identity/service.rs:function:login:10', target: 'rust:server/src/identity/service.rs:function:helper:30', weight: 1 },
    ])
  })

  it('module level: accumulates weight across multiple L0 edges between the same module pair', () => {
    const g2: L0Graph = {
      nodes: [
        { id: 'rust:server/src/identity/a.rs:function:f1:1', cgId: 'x1', kind: 'function', name: 'f1', qualifiedName: 'f1', filePath: 'server/src/identity/a.rs', language: 'rust', startLine: 1, endLine: 2, signature: null, visibility: null, isExported: false },
        { id: 'rust:server/src/identity/b.rs:function:f2:1', cgId: 'x2', kind: 'function', name: 'f2', qualifiedName: 'f2', filePath: 'server/src/identity/b.rs', language: 'rust', startLine: 1, endLine: 2, signature: null, visibility: null, isExported: false },
        { id: 'rust:server/src/common/c.rs:function:g1:1', cgId: 'x3', kind: 'function', name: 'g1', qualifiedName: 'g1', filePath: 'server/src/common/c.rs', language: 'rust', startLine: 1, endLine: 2, signature: null, visibility: null, isExported: false },
        { id: 'rust:server/src/common/c.rs:function:g2:5', cgId: 'x4', kind: 'function', name: 'g2', qualifiedName: 'g2', filePath: 'server/src/common/c.rs', language: 'rust', startLine: 5, endLine: 6, signature: null, visibility: null, isExported: false },
      ],
      edges: [
        { source: 'rust:server/src/identity/a.rs:function:f1:1', target: 'rust:server/src/common/c.rs:function:g1:1', kind: 'calls' },
        { source: 'rust:server/src/identity/b.rs:function:f2:1', target: 'rust:server/src/common/c.rs:function:g2:5', kind: 'references' },
      ],
    }
    const r = aggregate(g2, 'module', null, mod)
    // 两条 identity→common 的 L0 边应合并为一条 weight=2 的模块边
    expect(r.edges).toEqual([{ source: 'server/identity', target: 'server/common', weight: 2 }])
  })
})
