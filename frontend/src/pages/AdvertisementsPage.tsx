import { useEffect, useState, type FormEvent } from 'react'
import { api, type Advertisement, type ClientSummary, type PushResult, type VideoSetting, type VideoSlot } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { alert, badge, button, card, color, dismissButton, font, h1, input, label as fieldLabel, pageHeader, tabPill, table, td, th } from '../lib/theme'
import { ClientPicker, TargetChips } from '../components/ClientTargeting'

// Everything here is ONE-WAY to the clients (Dennis, 2026-09-24): a
// pushed announcement or video is read-only on the client ERP, so the
// edit / reorder / hide-show controls live here and are mirrored by
// the next push. Clients keep their own separately-editable "company
// announcements" that never come back to Central Command.

type Tab = 'ads' | 'video'

export default function AdvertisementsPage() {
  const [tab, setTab] = useState<Tab>('ads')
  const [ads, setAds] = useState<Advertisement[]>([])
  const [videos, setVideos] = useState<VideoSetting[]>([])
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [pushResult, setPushResult] = useState<PushResult | null>(null)
  const [error, setError] = useState('')

  const refresh = () => {
    api.listAds().then(setAds)
    api.listVideos().then(setVideos)
    api.listClients().then(setClients)
  }
  useEffect(() => { refresh() }, [])

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? id.slice(0, 8)

  return (
    <div>
      <div style={pageHeader()}>
        <h1 style={h1()}>Advertisements</h1>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        <button onClick={() => setTab('ads')} className="btn" style={tabPill(tab === 'ads')}>📢 Announcements</button>
        <button onClick={() => setTab('video')} className="btn" style={tabPill(tab === 'video')}>🎬 Video Banner</button>
      </div>

      {error && (
        <div style={alert('danger')}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={dismissButton()}>✕</button>
        </div>
      )}

      {pushResult && (
        <div style={{ ...card({ padding: 14, marginBottom: 18 }), background: color.successSoft, border: `1px solid #b6e5c7` }}>
          <strong style={{ fontSize: 13, color: color.success }}>Push Results</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
            {pushResult.results.map((r, i) => (
              <li key={i} style={{ color: r.success ? color.success : color.danger }}>
                {r.client}: {r.success ? `✓ OK${r.count ? ` (${r.count} items)` : ''}` : `✗ ${r.error}`}
              </li>
            ))}
          </ul>
          <button onClick={() => setPushResult(null)} style={{ ...dismissButton(), marginTop: 4 }}>Dismiss</button>
        </div>
      )}

      {tab === 'ads' ? (
        <AnnouncementsTab ads={ads} clients={clients} clientName={clientName} setError={setError} setPushResult={setPushResult} refresh={refresh} />
      ) : (
        <VideoBannerTab videos={videos} clients={clients} clientName={clientName} setError={setError} setPushResult={setPushResult} refresh={refresh} />
      )}
    </div>
  )
}

function errMsg(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

const iconButton = { ...button('secondary', 'sm'), padding: '4px 8px', minWidth: 30 } as const

// ── Announcements ──────────────────────────────────────────────────

function AnnouncementsTab({
  ads, clients, clientName, setError, setPushResult, refresh,
}: {
  ads: Advertisement[]
  clients: ClientSummary[]
  clientName: (id: string) => string
  setError: (e: string) => void
  setPushResult: (r: PushResult | null) => void
  refresh: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ tag: '', text: '', client_ids: [] as string[] })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState({ tag: '', text: '', client_ids: [] as string[] })

  const sorted = [...ads].sort((a, b) => a.sort_order - b.sort_order)

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.createAd({ ...form, sort_order: sorted.length })
      setShowForm(false)
      setForm({ tag: '', text: '', client_ids: [] })
      refresh()
    } catch (err) {
      setError(errMsg(err, 'Failed'))
    }
  }

  function startEdit(ad: Advertisement) {
    setEditingId(ad.id)
    setEdit({ tag: ad.tag ?? '', text: ad.text, client_ids: ad.assignments.map((a) => a.client_id) })
  }

  async function onSaveEdit(adId: string) {
    setError('')
    try {
      await api.updateAd(adId, { tag: edit.tag || null, text: edit.text, client_ids: edit.client_ids })
      setEditingId(null)
      refresh()
    } catch (err) {
      setError(errMsg(err, 'Failed to save'))
    }
  }

  async function onToggleActive(ad: Advertisement) {
    setError('')
    try {
      await api.updateAd(ad.id, { is_active: !ad.is_active })
      refresh()
    } catch (err) {
      setError(errMsg(err, 'Failed to update'))
    }
  }

  // Swap with the neighbour, then write back the index of every row
  // whose position changed -- this also repairs stale ties (older rows
  // were all created with sort_order 0).
  async function onMove(ad: Advertisement, direction: -1 | 1) {
    const index = sorted.findIndex((a) => a.id === ad.id)
    const target = index + direction
    if (target < 0 || target >= sorted.length) return
    const next = [...sorted]
    ;[next[index], next[target]] = [next[target], next[index]]
    setError('')
    try {
      await Promise.all(
        next.map((row, i) => (row.sort_order === i ? Promise.resolve() : api.updateAd(row.id, { sort_order: i }))),
      )
      refresh()
    } catch (err) {
      setError(errMsg(err, 'Failed to reorder'))
    }
  }

  async function onPush(adId: string) {
    setPushResult(null)
    try {
      setPushResult(await api.pushAd(adId))
      refresh()
    } catch (err) {
      setError(errMsg(err, 'Push failed'))
    }
  }

  async function onPushAll() {
    setPushResult(null)
    try {
      setPushResult(await api.pushAllAds())
      refresh()
    } catch (err) {
      setError(errMsg(err, 'Push failed'))
    }
  }

  async function onDelete(adId: string) {
    if (!window.confirm('Delete this advertisement here? (It stays on any client it was already pushed to -- hide it and push first if it should disappear there.)')) return
    await api.deleteAd(adId)
    refresh()
  }

  const toggleIn = (list: string[], cid: string) => (list.includes(cid) ? list.filter((x) => x !== cid) : [...list, cid])

  return (
    <div>
      <p style={{ fontSize: 12.5, color: color.textMuted, margin: '0 0 14px', maxWidth: 640 }}>
        Order, text and hidden/shown state are all set here and mirrored to the clients on the next
        push -- a pushed announcement is read-only on the client's own screen. Hidden items are still
        pushed (as hidden) so a hide here hides it there too.
      </p>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
        <button onClick={onPushAll} className="btn" style={button('success')}>Push All</button>
        <button onClick={() => setShowForm(!showForm)} className="btn" style={button('primary')}>
          {showForm ? 'Cancel' : '+ New Ad'}
        </button>
      </div>

      {showForm && (
        <div style={card({ padding: 22, marginBottom: 20 })}>
          <form onSubmit={onCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={fieldLabel()}>Tag</label>
                <input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="e.g. New" style={input()} />
              </div>
              <div>
                <label style={fieldLabel()}>Text</label>
                <input value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} required style={input()} />
              </div>
            </div>
            <ClientPicker clients={clients} selected={form.client_ids} onToggle={(cid) => setForm((f) => ({ ...f, client_ids: toggleIn(f.client_ids, cid) }))} />
            <button type="submit" className="btn" style={{ ...button('primary'), marginTop: 14 }}>Create</button>
          </form>
        </div>
      )}

      <div style={card({ padding: 0, overflow: 'hidden' })}>
        <table style={table()}>
          <thead>
            <tr>
              <th style={{ ...th(), width: 70 }}>Order</th>
              <th style={th()}>Tag</th>
              <th style={th()}>Text</th>
              <th style={th()}>Status</th>
              <th style={th()}>Targeted Clients</th>
              <th style={th()}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((ad, i) => {
              const editing = editingId === ad.id
              return (
                <tr key={ad.id} className="tr" style={{ borderBottom: `1px solid ${color.border}`, opacity: ad.is_active ? 1 : 0.6, verticalAlign: 'top' }}>
                  <td style={td()}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => onMove(ad, -1)} disabled={i === 0} className="btn" style={iconButton} title="Move up">↑</button>
                      <button onClick={() => onMove(ad, 1)} disabled={i === sorted.length - 1} className="btn" style={iconButton} title="Move down">↓</button>
                    </div>
                  </td>
                  <td style={td()}>
                    {editing ? (
                      <input value={edit.tag} onChange={(e) => setEdit({ ...edit, tag: e.target.value })} placeholder="Tag" style={input({ width: 100 })} />
                    ) : (
                      ad.tag && <span style={badge('info')}>{ad.tag}</span>
                    )}
                  </td>
                  <td style={td()}>
                    {editing ? (
                      <input value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} style={input({ minWidth: 320 })} />
                    ) : (
                      ad.text
                    )}
                  </td>
                  <td style={td()}>
                    <span style={badge(ad.is_active ? 'success' : 'warning')}>{ad.is_active ? 'Shown' : 'Hidden'}</span>
                  </td>
                  <td style={td({ fontSize: 11 })}>
                    {editing ? (
                      <ClientPicker clients={clients} selected={edit.client_ids} onToggle={(cid) => setEdit((f) => ({ ...f, client_ids: toggleIn(f.client_ids, cid) }))} />
                    ) : (
                      <TargetChips assignments={ad.assignments} clientName={clientName} />
                    )}
                  </td>
                  <td style={td()}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {editing ? (
                        <>
                          <button onClick={() => onSaveEdit(ad.id)} className="btn" style={button('primary', 'sm')}>Save</button>
                          <button onClick={() => setEditingId(null)} className="btn" style={button('secondary', 'sm')}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(ad)} className="btn" style={button('secondary', 'sm')}>Edit</button>
                          <button onClick={() => onToggleActive(ad)} className="btn" style={button('secondary', 'sm')}>{ad.is_active ? 'Hide' : 'Show'}</button>
                          <button onClick={() => onPush(ad.id)} className="btn" style={button('success', 'sm')}>Push</button>
                          <button onClick={() => onDelete(ad.id)} className="btn" style={button('danger', 'sm')}>Delete</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={6} style={td({ padding: 26, textAlign: 'center', color: color.textMuted })}>No advertisements yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Video Banner ────────────────────────────────────────────────────

const emptyVideoForm = { video_url: '', label: 'Default', slot: 'login' as VideoSlot, client_ids: [] as string[] }

function VideoBannerTab({
  videos, clients, clientName, setError, setPushResult, refresh,
}: {
  videos: VideoSetting[]
  clients: ClientSummary[]
  clientName: (id: string) => string
  setError: (e: string) => void
  setPushResult: (r: PushResult | null) => void
  refresh: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...emptyVideoForm })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState({ ...emptyVideoForm })

  const toggleIn = (list: string[], cid: string) => (list.includes(cid) ? list.filter((x) => x !== cid) : [...list, cid])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.createVideo(form)
      setShowForm(false)
      setForm({ ...emptyVideoForm })
      refresh()
    } catch (err) {
      setError(errMsg(err, 'Failed'))
    }
  }

  function startEdit(v: VideoSetting) {
    setEditingId(v.id)
    setEdit({ video_url: v.video_url ?? '', label: v.label, slot: v.slot, client_ids: v.assignments.map((a) => a.client_id) })
  }

  async function onSaveEdit(videoId: string) {
    setError('')
    try {
      await api.updateVideo(videoId, { video_url: edit.video_url || null, label: edit.label, slot: edit.slot, client_ids: edit.client_ids })
      setEditingId(null)
      refresh()
    } catch (err) {
      setError(errMsg(err, 'Failed to save'))
    }
  }

  async function onToggleActive(v: VideoSetting) {
    setError('')
    try {
      await api.updateVideo(v.id, { is_active: !v.is_active })
      refresh()
    } catch (err) {
      setError(errMsg(err, 'Failed to update'))
    }
  }

  async function onPush(videoId: string) {
    setPushResult(null)
    try {
      setPushResult(await api.pushVideo(videoId))
      refresh()
    } catch (err) {
      setError(errMsg(err, 'Push failed'))
    }
  }

  async function onDelete(videoId: string) {
    if (!window.confirm('Delete this video setting here? (Clients keep whatever was last pushed -- hide it and push first to clear it there.)')) return
    await api.deleteVideo(videoId)
    refresh()
  }

  function videoFields(state: typeof emptyVideoForm, set: (s: typeof emptyVideoForm) => void) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={fieldLabel()}>Video URL</label>
          <input value={state.video_url} onChange={(e) => set({ ...state, video_url: e.target.value })} placeholder="https://cdn.example.com/promo.mp4" style={input()} />
        </div>
        <div>
          <label style={fieldLabel()}>Label</label>
          <input value={state.label} onChange={(e) => set({ ...state, label: e.target.value })} required style={input()} />
        </div>
        <div>
          <label style={fieldLabel()}>Slot</label>
          <select value={state.slot} onChange={(e) => set({ ...state, slot: e.target.value as VideoSlot })} style={input()}>
            <option value="login">Login page</option>
            <option value="app">In-app banner</option>
          </select>
        </div>
      </div>
    )
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: color.textMuted, margin: '0 0 14px', maxWidth: 640 }}>
        Sets the promo video URL shown on each client's Login page or in-app banner
        (writes to the matching slot in their <code style={{ fontFamily: font.mono }}>ad_banner_settings</code> row).
        Each slot pushes independently. Once pushed, that slot is <strong>locked on the client</strong> --
        they can't change or remove it themselves. Hide a video and push it again to clear the slot
        on the client and hand it back to them. Pushing a URL always clears anything the client
        uploaded locally for that slot (there's no way to transfer an uploaded file's bytes from here).
      </p>

      <div style={{ background: color.infoSoft, border: `1px solid ${color.info}22`, borderRadius: 8, padding: '12px 16px', marginBottom: 20, maxWidth: 640 }}>
        <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 600, color: color.info }}>ℹ️ About the video URL</p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: color.text, lineHeight: 1.7 }}>
          <li>
            <strong>No size or resolution limit is enforced.</strong> It's a URL the viewer's browser
            streams directly — not a file uploaded to this app — so Central Command never sees or checks it.
          </li>
          <li>
            It plays <strong>muted and looped in a narrow column</strong> — 480px wide on the Login page,
            150px on every other page — so 720p is more than enough; anything larger just costs bandwidth
            on every page load. A short loop of a few MB is the sweet spot.
          </li>
          <li>
            <strong>Must be a direct <code style={{ fontFamily: font.mono }}>.mp4</code> (H.264) or{' '}
            <code style={{ fontFamily: font.mono }}>.webm</code> link</strong> — one that plays when pasted
            straight into a browser tab.
          </li>
          <li>
            A YouTube, Vimeo, or Google Drive <em>page</em> link won't play — the panel quietly hides the
            video rather than showing an error, so a bad link can go unnoticed until someone checks the
            client's banner.
          </li>
        </ul>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={() => setShowForm(!showForm)} className="btn" style={button('primary')}>
          {showForm ? 'Cancel' : '+ New Video'}
        </button>
      </div>

      {showForm && (
        <div style={card({ padding: 22, marginBottom: 20 })}>
          <form onSubmit={onCreate}>
            {videoFields(form, setForm)}
            <ClientPicker clients={clients} selected={form.client_ids} onToggle={(cid) => setForm((f) => ({ ...f, client_ids: toggleIn(f.client_ids, cid) }))} />
            <button type="submit" className="btn" style={{ ...button('primary'), marginTop: 14 }}>Create</button>
          </form>
        </div>
      )}

      {editingId && (
        <div style={card({ padding: 22, marginBottom: 20 })}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Edit video</h3>
          {videoFields(edit, setEdit)}
          <ClientPicker clients={clients} selected={edit.client_ids} onToggle={(cid) => setEdit((f) => ({ ...f, client_ids: toggleIn(f.client_ids, cid) }))} />
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => onSaveEdit(editingId)} className="btn" style={button('primary')}>Save</button>
            <button onClick={() => setEditingId(null)} className="btn" style={button('secondary')}>Cancel</button>
          </div>
        </div>
      )}

      <div style={card({ padding: 0, overflow: 'hidden' })}>
        <table style={table()}>
          <thead>
            <tr>
              <th style={th()}>Label</th>
              <th style={th()}>Slot</th>
              <th style={th()}>Video URL</th>
              <th style={th()}>Status</th>
              <th style={th()}>Targeted Clients</th>
              <th style={th()}>Created</th>
              <th style={th()}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v) => (
              <tr key={v.id} className="tr" style={{ borderBottom: `1px solid ${color.border}`, opacity: v.is_active ? 1 : 0.6 }}>
                <td style={td({ fontWeight: 500 })}>{v.label}</td>
                <td style={td()}>{v.slot === 'app' ? 'In-app banner' : 'Login page'}</td>
                <td style={td({ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
                  {v.video_url ? (
                    <a href={v.video_url} target="_blank" rel="noreferrer" style={{ color: color.info, textDecoration: 'none' }}>{v.video_url}</a>
                  ) : (
                    <span style={{ color: color.textFaint }}>(cleared)</span>
                  )}
                </td>
                <td style={td()}>
                  <span style={badge(v.is_active ? 'success' : 'warning')}>{v.is_active ? 'Shown' : 'Hidden'}</span>
                </td>
                <td style={td({ fontSize: 11 })}>
                  <TargetChips assignments={v.assignments} clientName={clientName} />
                </td>
                <td style={td({ color: color.textMuted })}>{formatDateTime(v.created_at)}</td>
                <td style={td()}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => startEdit(v)} className="btn" style={button('secondary', 'sm')}>Edit</button>
                    <button onClick={() => onToggleActive(v)} className="btn" style={button('secondary', 'sm')}>{v.is_active ? 'Hide' : 'Show'}</button>
                    <button onClick={() => onPush(v.id)} className="btn" style={button('success', 'sm')} title={v.is_active ? 'Push this URL' : 'Push as cleared (releases the slot to the client)'}>Push</button>
                    <button onClick={() => onDelete(v.id)} className="btn" style={button('danger', 'sm')}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {videos.length === 0 && (
              <tr><td colSpan={7} style={td({ padding: 26, textAlign: 'center', color: color.textMuted })}>No video banners yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
