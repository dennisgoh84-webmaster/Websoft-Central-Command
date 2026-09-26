/**
 * Date/time formatting — DD/MM/YYYY throughout the app (not the
 * browser-locale-dependent MM/DD/YYYY that `toLocaleString()` gives on
 * US-locale machines). Central Command's users are Singapore-based, so
 * this matches local convention.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** '2026-09-14T10:00:00Z' -> '14/09/2026'. Returns '—' for null/invalid. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  // A bare YYYY-MM-DD is formatted as-is: Date() would read it as UTC
  // midnight and could shift it a day in some browser timezones.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** '2026-09-14T10:00:00Z' -> '14/09/2026, 18:00'. Returns '—' for null/invalid. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return `${formatDate(value)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** First 7 characters of a commit -- the length both sides show. */
export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : '—'
}

/**
 * The version wording a client ERP prints on its login screen
 * (2026-09-26): its version number and the release's date in Singapore
 * time -- "Version 1.0.291 · 27/09/2026" -- as the client's upgrade
 * agent reports them (the ERP's deploy/version.sh works both out), so
 * the two tally whatever timezone this browser is in. An agent from
 * before version numbers reports only the commit, shown by its first
 * 7 characters until that client is upgraded.
 */
export function versionLabel(
  version: string | null | undefined,
  sha: string | null | undefined,
  committedAt: string | null | undefined,
): string {
  if (!version && !sha) return '—'
  const d = committedAt ? new Date(committedAt) : null
  const date = d && !isNaN(d.getTime())
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
    : ''
  return `Version ${version || shortSha(sha)}${date ? ` · ${date}` : ''}`
}
