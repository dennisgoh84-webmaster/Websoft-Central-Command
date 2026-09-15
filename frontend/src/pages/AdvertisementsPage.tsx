import { useEffect, useState, type FormEvent } from 'react'
import { api, type Advertisement, type ClientSummary, type PushResult, type VideoSetting } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { alert, badge, button, card, color, dismissButton, font, h1, input, label as fieldLabel, pageHeader, tabPill, table, td, th, targetChip } from '../lib/theme'

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
  const [form, setForm] = useState({ tag: '', text: '', sort_order: 0, client_ids: [] as string[] })

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.createAd(form)
      setShowForm(false)
      setForm({ tag: '', text: '', sort_order: 0, client_ids: [] })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function onPush(adId: string) {
    setPushResult(null)
    try {
      setPushResult(await api.pushAd(adId))
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push failed')
    }
  }

  async function onPushAll() {
    setPushResult(null)
    try {
      setPushResult(await api.pushAllAds())
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push failed')
    }
  }

  async function onDelete(adId: string) {
    if (!window.confirm('Delete this advertisement?')) return
    await api.deleteAd(adId)
    refresh()
  }

  function toggleClient(cid: string) {
    setForm((f) => ({
      ...f,
      client_ids: f.client_ids.includes(cid) ? f.client_ids.filter((x) => x !== cid) : [...f.client_ids, cid],
    }))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
        <button onClick={onPushAll} className="btn" style={button('success')}>Push All Active</button>
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
            <ClientPicker clients={clients} selected={form.client_ids} onToggle={toggleClient} />
            <button type="submit" className="btn" style={{ ...button('primary'), marginTop: 14 }}>Create</button>
          </form>
        </div>
      )}

      <div style={card({ padding: 0, overflow: 'hidden' })}>
        <table style={table()}>
          <thead>
            <tr>
              <th style={th()}>Tag</th>
              <th style={th()}>Text</th>
              <th style={th()}>Active</th>
              <th style={th()}>Targeted Clients</th>
              <th style={th()}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ads.map((ad) => (
              <tr key={ad.id} className="tr" style={{ borderBottom: `1px solid ${color.border}` }}>
                <td style={td()}>{ad.tag && <span style={badge('info')}>{ad.tag}</span>}</td>
                <td style={td()}>{ad.text}</td>
                <td style={td({ color: ad.is_active ? color.success : color.danger, fontWeight: 500 })}>{ad.is_active ? 'Yes' : 'No'}</td>
                <td style={td({ fontSize: 11 })}>
                  <TargetChips assignments={ad.assignments} clientName={clientName} />
                </td>
                <td style={td()}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => onPush(ad.id)} className="btn" style={button('success', 'sm')}>Push</button>
                    <button onClick={() => onDelete(ad.id)} className="btn" style={button('danger', 'sm')}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {ads.length === 0 && (
              <tr><td colSpan={5} style={td({ padding: 26, textAlign: 'center', color: color.textMuted })}>No advertisements yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Video Banner ────────────────────────────────────────────────────

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
  const [form, setForm] = useState({ video_url: '', label: 'Default', client_ids: [] as string[] })

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.createVideo(form)
      setShowForm(false)
      setForm({ video_url: '', label: 'Default', client_ids: [] })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function onPush(videoId: string) {
    setPushResult(null)
    try {
      setPushResult(await api.pushVideo(videoId))
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push failed')
    }
  }

  function toggleClient(cid: string) {
    setForm((f) => ({
      ...f,
      client_ids: f.client_ids.includes(cid) ? f.client_ids.filter((x) => x !== cid) : [...f.client_ids, cid],
    }))
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: color.textMuted, margin: '0 0 14px', maxWidth: 640 }}>
        Sets the promo video URL shown on each client's login/dashboard banner
        (writes to their <code style={{ fontFamily: font.mono }}>ad_banner_settings</code> table). Only the
        most recently pushed video per client takes effect there.
      </p>

      <div style={{ background: color.infoSoft, border: `1px solid ${color.info}22`, borderRadius: 8, padding: '12px 16px', marginBottom: 20, maxWidth: 640 }}>
        <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 600, color: color.info }}>ℹ️ About the video URL</p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: color.text, lineHeight: 1.7 }}>
          <li>
            <strong>No size or resolution limit is enforced.</strong> It's a URL the viewer's browser
            streams directly — not a file uploaded to this app — so Central Command never sees or checks it.
          </li>
          <li>
            It plays <strong>muted and looped in a narrow column</strong> — 220px wide on the Login page,
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
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={fieldLabel()}>Video URL</label>
                <input
                  value={form.video_url}
                  onChange={(e) => setForm({ ...form, video_url: e.target.value })}
                  placeholder="https://cdn.example.com/promo.mp4"
                  style={input()}
                />
              </div>
              <div>
                <label style={fieldLabel()}>Label</label>
                <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required style={input()} />
              </div>
            </div>
            <ClientPicker clients={clients} selected={form.client_ids} onToggle={toggleClient} />
            <button type="submit" className="btn" style={{ ...button('primary'), marginTop: 14 }}>Create</button>
          </form>
        </div>
      )}

      <div style={card({ padding: 0, overflow: 'hidden' })}>
        <table style={table()}>
          <thead>
            <tr>
              <th style={th()}>Label</th>
              <th style={th()}>Video URL</th>
              <th style={th()}>Active</th>
              <th style={th()}>Targeted Clients</th>
              <th style={th()}>Created</th>
              <th style={th()}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v) => (
              <tr key={v.id} className="tr" style={{ borderBottom: `1px solid ${color.border}` }}>
                <td style={td({ fontWeight: 500 })}>{v.label}</td>
                <td style={td({ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
                  {v.video_url ? (
                    <a href={v.video_url} target="_blank" rel="noreferrer" style={{ color: color.info, textDecoration: 'none' }}>{v.video_url}</a>
                  ) : (
                    <span style={{ color: color.textFaint }}>(cleared)</span>
                  )}
                </td>
                <td style={td({ color: v.is_active ? color.success : color.danger, fontWeight: 500 })}>{v.is_active ? 'Yes' : 'No'}</td>
                <td style={td({ fontSize: 11 })}>
                  <TargetChips assignments={v.assignments} clientName={clientName} />
                </td>
                <td style={td({ color: color.textMuted })}>{formatDateTime(v.created_at)}</td>
                <td style={td()}>
                  <button onClick={() => onPush(v.id)} className="btn" style={button('success', 'sm')}>Push</button>
                </td>
              </tr>
            ))}
            {videos.length === 0 && (
              <tr><td colSpan={6} style={td({ padding: 26, textAlign: 'center', color: color.textMuted })}>No video banners yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Shared bits ──────────────────────────────────────────────────────

function ClientPicker({ clients, selected, onToggle }: { clients: ClientSummary[]; selected: string[]; onToggle: (id: string) => void }) {
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

function TargetChips({ assignments, clientName }: { assignments: { client_id: string; pushed_at: string | null }[]; clientName: (id: string) => string }) {
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
