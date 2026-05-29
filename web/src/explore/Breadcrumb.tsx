export interface Crumb { label: string; level: 'module' | 'file' | 'function'; scope: string | null }

export function Breadcrumb({ crumbs, onJump }: { crumbs: Crumb[]; onJump: (index: number) => void }) {
  return (
    <nav data-testid="breadcrumb" style={{ display: 'flex', gap: 6, padding: 8, fontSize: 13 }}>
      {crumbs.map((c, i) => (
        <span key={i}>
          {i > 0 && <span style={{ color: '#aaa' }}> / </span>}
          <button onClick={() => onJump(i)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0 }}>
            {c.label}
          </button>
        </span>
      ))}
    </nav>
  )
}
