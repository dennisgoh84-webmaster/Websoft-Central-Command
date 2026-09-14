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
