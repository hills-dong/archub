import type { GraphDiff } from '../api/types'

function md(d: GraphDiff): string {
  const lines = [`# Architecture diff: ${d.base} → ${d.head} (${d.level} level)`, '']
  const s = d.summary
  if (s.addedNodes + s.removedNodes + s.changedNodes + s.addedEdges + s.removedEdges === 0) {
    lines.push('No architecture changes.')
    return lines.join('\n')
  }
  lines.push(`**Summary:** +${s.addedNodes} / -${s.removedNodes} nodes, ~${s.changedNodes} changed; +${s.addedEdges} / -${s.removedEdges} edges.`, '')
  const sec = (t: string, items: string[]) => { if (items.length) { lines.push(`## ${t}`); items.forEach((i) => lines.push(`- ${i}`)); lines.push('') } }
  sec('Added', d.nodes.filter((n) => n.status === 'added').map((n) => `+ ${n.label}`))
  sec('Removed', d.nodes.filter((n) => n.status === 'removed').map((n) => `- ${n.label}`))
  sec('Changed', d.nodes.filter((n) => n.status === 'changed').map((n) => `~ ${n.label} (dependencies changed)`))
  sec('Added edges', d.edges.filter((e) => e.status === 'added').map((e) => `+ ${e.source} → ${e.target} (×${e.weight})`))
  sec('Removed edges', d.edges.filter((e) => e.status === 'removed').map((e) => `- ${e.source} → ${e.target}`))
  return lines.join('\n')
}

export function DiffReport({ diff }: { diff: GraphDiff }) {
  const group = (status: string) => diff.nodes.filter((n) => n.status === status)
  const addedE = diff.edges.filter((e) => e.status === 'added')
  const removedE = diff.edges.filter((e) => e.status === 'removed')
  const copy = () => navigator.clipboard?.writeText(md(diff))
  return (
    <aside data-testid="diff-report" style={{ width: 340, borderLeft: '1px solid #ddd', padding: 12, fontSize: 13, overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b>{diff.base} → {diff.head}</b>
        <button data-testid="copy-md" onClick={copy}>复制 Markdown</button>
      </div>
      <p style={{ color: '#555' }}>
        +{diff.summary.addedNodes} / -{diff.summary.removedNodes} 节点, ~{diff.summary.changedNodes} 变化; +{diff.summary.addedEdges} / -{diff.summary.removedEdges} 边
      </p>
      <Group title="新增" color="#16a34a" items={group('added').map((n) => n.label)} />
      <Group title="删除" color="#dc2626" items={group('removed').map((n) => n.label)} />
      <Group title="变化" color="#ca8a04" items={group('changed').map((n) => n.label)} />
      <Group title="新增边" color="#16a34a" items={addedE.map((e) => `${e.source} → ${e.target}`)} />
      <Group title="删除边" color="#dc2626" items={removedE.map((e) => `${e.source} → ${e.target}`)} />
    </aside>
  )
}

function Group({ title, color, items }: { title: string; color: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontWeight: 600, color }}>{title} ({items.length})</div>
      <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  )
}
