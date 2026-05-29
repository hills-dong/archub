import { useState } from 'react'
import { ExploreView } from './explore/ExploreView'
import { CompareView } from './compare/CompareView'

export function App() {
  const [mode, setMode] = useState<'explore' | 'compare'>('explore')
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 6, borderBottom: '1px solid #eee', display: 'flex', gap: 8 }}>
        <button data-testid="mode-explore" onClick={() => setMode('explore')} style={{ fontWeight: mode === 'explore' ? 700 : 400 }}>探索</button>
        <button data-testid="mode-compare" onClick={() => setMode('compare')} style={{ fontWeight: mode === 'compare' ? 700 : 400 }}>对比</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {mode === 'explore' ? <ExploreView /> : <CompareView />}
      </div>
    </div>
  )
}
