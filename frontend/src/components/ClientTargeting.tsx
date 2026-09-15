// Shared by every "author once, target clients, push, see who's got it"
// screen (Advertisements, Video Banner, System Mail): the client
// checkbox-chip picker used on the create/edit form, and the read-only
// chip list showing which clients an item is assigned to and whether
// each has actually received it yet (a ✓ once pushed_at is set).
import type { ClientSummary } from '../lib/api'
import { color, label as fieldLabel, targetChip } from '../lib/theme'

export function ClientPicker({ clients, selected, onToggle }: { clients: ClientSummary[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div>
      <label style={fieldLabel()}>Target Clients</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {clients.map((c) => (
          <label key={c.id} style={targetChip(selected.includes(c.id))}>
            <input type="checkbox" checked={selected.includes(c.id)} onChange={() => onToggle(c.id)} style={{ display: 'none' }} />
            {c.name}
          </label>
        ))}
        {clients.length === 0 && <span style={{ color: color.textMuted, fontSize: 12 }}>No clients registered</span>}
      </div>
    </div>
  )
}

export function TargetChips({ assignments, clientName }: { assignments: { client_id: string; pushed_at: string | null }[]; clientName: (id: string) => string }) {
  if (assignments.length === 0) return <span style={{ color: color.textFaint }}>none</span>
  return (
    <>
      {assignments.map((a) => (
        <span key={a.client_id} style={{ display: 'inline-block', background: color.chip, padding: '2px 8px', borderRadius: 4, marginRight: 5, marginBottom: 3, color: color.text }}>
          {clientName(a.client_id)}
          {a.pushed_at && <span style={{ color: color.success, marginLeft: 4 }}>✓</span>}
        </span>
      ))}
    </>
  )
}
