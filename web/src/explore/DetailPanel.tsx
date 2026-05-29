import type { NodeDetail } from '../api/types'

export function DetailPanel({ detail, onClose }: { detail: NodeDetail | null; onClose: () => void }) {
  if (!detail) return null
  return (
    <aside data-testid="detail-panel" style={{ width: 320, borderLeft: '1px solid #ddd', padding: 12, fontSize: 13, overflow: 'auto' }}>
      <button onClick={onClose} style={{ float: 'right' }}>×</button>
      <h3 style={{ marginTop: 0 }}>{detail.name}</h3>
      <div><b>kind:</b> {detail.kind}</div>
      <div><b>file:</b> {detail.filePath}:{detail.startLine}</div>
      <div><b>language:</b> {detail.language}</div>
      <div><b>visibility:</b> {detail.visibility ?? '—'}</div>
      {detail.signature && <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f6f6', padding: 8 }}>{detail.signature}</pre>}
    </aside>
  )
}
