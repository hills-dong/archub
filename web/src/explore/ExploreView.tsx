import { useCallback, useEffect, useState } from 'react'
import { fetchGraph, fetchNode } from '../api/client'
import type { GraphResponse, NodeDetail, SearchHit } from '../api/types'
import type { ArchubNodeData } from '../graph/layout'
import { GraphCanvas } from '../graph/GraphCanvas'
import { Breadcrumb, type Crumb } from './Breadcrumb'
import { SearchBox } from './SearchBox'
import { DetailPanel } from './DetailPanel'

const ROOT: Crumb = { label: '全部模块', level: 'module', scope: null }

export function ExploreView() {
  const [crumbs, setCrumbs] = useState<Crumb[]>([ROOT])
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [detail, setDetail] = useState<NodeDetail | null>(null)
  const top = crumbs[crumbs.length - 1]

  useEffect(() => {
    let live = true
    fetchGraph(top.level, top.scope).then((g) => { if (live) setGraph(g) })
    return () => { live = false }
  }, [top.level, top.scope])

  const onNodeClick = useCallback(async (n: ArchubNodeData) => {
    if (n.level === 'module') setCrumbs((c) => [...c, { label: n.label, level: 'file', scope: n.id }])
    else if (n.level === 'file') setCrumbs((c) => [...c, { label: n.label, level: 'function', scope: n.id }])
    else {
      try { setDetail(await fetchNode(n.id)) } catch (e) { console.error(e) }
    }
  }, [])

  const onPickHit = useCallback(async (h: SearchHit) => {
    try { setDetail(await fetchNode(h.id)) } catch (e) { console.error(e) }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ borderBottom: '1px solid #ddd' }}>
        <SearchBox onPick={onPickHit} />
        <Breadcrumb crumbs={crumbs} onJump={(i) => { setCrumbs((c) => c.slice(0, i + 1)); setDetail(null) }} />
      </header>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1 }}>
          {graph ? <GraphCanvas graph={graph} onNodeClick={onNodeClick} /> : <div style={{ padding: 16 }}>加载中…</div>}
        </div>
        <DetailPanel detail={detail} onClose={() => setDetail(null)} />
      </div>
    </div>
  )
}
