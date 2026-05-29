import { ReactFlow, Background, Controls, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useState } from 'react'
import { fetchRefs, fetchDiff } from '../api/client'
import type { GraphDiff, RefInfo } from '../api/types'
import { layoutDiff, type DiffNodeData } from '../graph/diffLayout'
import { diffNodeTypes } from '../graph/DiffNode'
import { RefSelector } from './RefSelector'
import { DiffReport } from './DiffReport'
import { Breadcrumb, type Crumb } from '../explore/Breadcrumb'

const ROOT: Crumb = { label: '全部模块', level: 'module', scope: null }

export function CompareView() {
  const [refs, setRefs] = useState<RefInfo | null>(null)
  const [base, setBase] = useState('')
  const [head, setHead] = useState('WORKING')
  const [crumbs, setCrumbs] = useState<Crumb[]>([ROOT])
  const [diff, setDiff] = useState<GraphDiff | null>(null)
  const [error, setError] = useState<string | null>(null)
  const top = crumbs[crumbs.length - 1]

  useEffect(() => {
    fetchRefs().then((r) => {
      setRefs(r)
      const firstSnap = r.commits.find((c) => r.snapshots.includes(c.sha))
      if (firstSnap) setBase(firstSnap.sha)
    }).catch((e) => setError(String(e.message ?? e)))
  }, [])

  useEffect(() => { setCrumbs([ROOT]) }, [base, head])

  useEffect(() => {
    if (!base) return
    let live = true
    setError(null)
    fetchDiff(base, head, top.level, top.scope)
      .then((d) => { if (live) setDiff(d) })
      .catch((e) => { if (live) { setDiff(null); setError(String(e.message ?? e)) } })
    return () => { live = false }
  }, [base, head, top.level, top.scope])

  if (!refs) return <div style={{ padding: 16 }}>{error ? <span data-testid="diff-error">{error}</span> : '加载 refs…'}</div>
  const layout = diff ? layoutDiff(diff) : null

  function drill(node: { id: string; label: string }) {
    if (top.level === 'module') setCrumbs((c) => [...c, { label: node.label, level: 'file', scope: node.id }])
    else if (top.level === 'file') setCrumbs((c) => [...c, { label: node.label, level: 'function', scope: node.id }])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header data-testid="compare-controls" style={{ padding: 8, borderBottom: '1px solid #ddd' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <RefSelector label="base" value={base} onChange={setBase} refs={refs} testid="base-select" />
          <RefSelector label="head" value={head} onChange={setHead} refs={refs} testid="head-select" />
        </div>
        <Breadcrumb crumbs={crumbs} onJump={(i) => setCrumbs((c) => c.slice(0, i + 1))} />
      </header>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1 }}>
          {error && <div data-testid="diff-error" style={{ padding: 16, color: '#b91c1c' }}>{error}</div>}
          {!error && layout && (
            <ReactFlow
              nodes={layout.nodes}
              edges={layout.edges}
              nodeTypes={diffNodeTypes}
              fitView
              onNodeClick={(_e, n: Node<DiffNodeData>) => drill({ id: n.id, label: n.data.label })}
            >
              <Background /><Controls />
            </ReactFlow>
          )}
          {!error && !layout && base && <div style={{ padding: 16 }}>计算 diff…</div>}
          {!base && <div style={{ padding: 16 }}>暂无可用快照作为 base。先运行 <code>archub snapshot</code>。</div>}
        </div>
        {diff && <DiffReport diff={diff} />}
      </div>
    </div>
  )
}
