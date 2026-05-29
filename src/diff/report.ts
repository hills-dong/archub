import type { GraphDiff } from './types.js'

export function toMarkdown(d: GraphDiff): string {
  const lines: string[] = []
  lines.push(`# Architecture diff: ${d.base} → ${d.head} (${d.level} level)`)
  lines.push('')
  const s = d.summary
  const total = s.addedNodes + s.removedNodes + s.changedNodes + s.addedEdges + s.removedEdges
  if (total === 0) {
    lines.push('No architecture changes.')
    return lines.join('\n')
  }
  lines.push(`**Summary:** +${s.addedNodes} / -${s.removedNodes} nodes, ~${s.changedNodes} changed; +${s.addedEdges} / -${s.removedEdges} edges.`)
  lines.push('')

  const section = (title: string, items: string[]) => {
    if (items.length === 0) return
    lines.push(`## ${title}`)
    for (const it of items) lines.push(`- ${it}`)
    lines.push('')
  }

  section('Added', d.nodes.filter((n) => n.status === 'added').map((n) => `+ ${n.label}`))
  section('Removed', d.nodes.filter((n) => n.status === 'removed').map((n) => `- ${n.label}`))
  section('Changed', d.nodes.filter((n) => n.status === 'changed').map((n) => `~ ${n.label} (dependencies changed)`))
  section('Added edges', d.edges.filter((e) => e.status === 'added').map((e) => `+ ${e.source} → ${e.target} (×${e.weight})`))
  section('Removed edges', d.edges.filter((e) => e.status === 'removed').map((e) => `- ${e.source} → ${e.target}`))

  return lines.join('\n')
}
