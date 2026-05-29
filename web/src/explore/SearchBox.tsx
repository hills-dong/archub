import { useRef, useState } from 'react'
import { search } from '../api/client'
import type { SearchHit } from '../api/types'

export function SearchBox({ onPick }: { onPick: (hit: SearchHit) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const seq = useRef(0)
  async function run(value: string) {
    setQ(value)
    if (value.trim().length < 2) { setHits([]); return }
    const mySeq = ++seq.current
    const results = await search(value.trim())
    if (mySeq === seq.current) setHits(results)
  }
  return (
    <div data-testid="search-box" style={{ padding: 8, position: 'relative' }}>
      <input placeholder="搜索符号…" value={q} onChange={(e) => run(e.target.value)} style={{ width: '100%', padding: 6 }} />
      {hits.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, position: 'absolute', background: '#fff', border: '1px solid #ddd', width: '95%', zIndex: 10, maxHeight: 240, overflow: 'auto' }}>
          {hits.map((h) => (
            <li key={h.id}>
              <button data-testid="search-hit" onClick={() => { onPick(h); setHits([]) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 6, border: 'none', background: 'none', cursor: 'pointer' }}>
                <b>{h.name}</b> <span style={{ color: '#888', fontSize: 11 }}>{h.module} · {h.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
