import type { RefInfo } from '../api/types'

export function RefSelector({ label, value, onChange, refs, testid }: { label: string; value: string; onChange: (v: string) => void; refs: RefInfo; testid: string }) {
  return (
    <label style={{ fontSize: 13, marginRight: 12 }}>
      {label}{' '}
      <select data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="WORKING">当前工作区</option>
        <optgroup label="分支">
          {refs.branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </optgroup>
        <optgroup label="快照 commit">
          {refs.commits.filter((c) => refs.snapshots.includes(c.sha)).map((c) => (
            <option key={c.sha} value={c.sha}>{c.sha.slice(0, 8)} {c.message.slice(0, 40)}</option>
          ))}
        </optgroup>
      </select>
    </label>
  )
}
