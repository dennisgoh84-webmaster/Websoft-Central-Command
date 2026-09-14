/**
 * Central Command design system — shared tokens + style builders.
 *
 * The app renders everything with inline styles (no CSS-in-JS
 * library), so this module is the single source of truth for colors,
 * spacing and type instead of every page re-declaring its own hex
 * literals. Hover/focus states that inline styles can't express live
 * in index.css as a handful of small utility classes (`.btn`, `.tr`,
 * `.input`) that pair with the style objects below.
 */
import type { CSSProperties } from 'react'

export const color = {
  // Brand — Web Master Consultancy maroon. Used for primary actions
  // and the one or two accents per screen that should draw the eye;
  // everything else leans on the neutral scale below.
  brand: '#800020',
  brandDark: '#5c0017',
  brandSoftBg: '#fbeef1',

  // Neutrals
  ink: '#1a1d24',
  text: '#2b2f38',
  textMuted: '#667085',
  textFaint: '#98a2b3',
  border: '#e4e7ec',
  borderStrong: '#d0d5dd',
  surface: '#ffffff',
  page: '#f7f8fa',
  chip: '#f2f4f7',

  // Sidebar
  sidebarBg: '#14141f',
  sidebarBorder: '#26273a',
  sidebarText: '#9698ab',
  sidebarTextActive: '#ffffff',

  // Semantic — soft, desaturated tones (badges/panels use the *Soft
  // pair; solid buttons use the plain tone).
  success: '#15803d',
  successSoft: '#ecfdf3',
  successSolid: '#16a34a',
  danger: '#b42318',
  dangerSoft: '#fef3f2',
  dangerSolid: '#dc2626',
  info: '#1849a9',
  infoSoft: '#eff8ff',
  infoSolid: '#2563eb',
  warning: '#b54708',
  warningSoft: '#fffaeb',
  warningSolid: '#d97706',
  purple: '#6941c6',
  purpleSoft: '#f9f5ff',
  purpleSolid: '#7c3aed',
  neutral: '#475467',
  neutralSoft: '#f2f4f7',
} as const

export const radius = { sm: 6, md: 8, lg: 12, pill: 999 } as const

export const shadow = {
  card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)',
  popover: '0 4px 12px rgba(16,24,40,.10), 0 2px 4px rgba(16,24,40,.06)',
} as const

export const font = {
  sans: "'Inter Variable', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
} as const

// ── Layout ──────────────────────────────────────────────────────────

export function card(extra?: CSSProperties): CSSProperties {
  return {
    background: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    ...extra,
  }
}

export function pageHeader(): CSSProperties {
  return { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }
}

export function h1(): CSSProperties {
  return { margin: 0, fontSize: 22, fontWeight: 700, color: color.ink, letterSpacing: '-0.01em' }
}

export function h2(): CSSProperties {
  return { margin: 0, fontSize: 15, fontWeight: 600, color: color.ink }
}

export function label(): CSSProperties {
  return { display: 'block', fontSize: 12, fontWeight: 600, color: color.textMuted, marginBottom: 5 }
}

// ── Form controls ───────────────────────────────────────────────────

export function input(extra?: CSSProperties): CSSProperties {
  return {
    width: '100%',
    padding: '8px 10px',
    border: `1px solid ${color.borderStrong}`,
    borderRadius: radius.sm,
    fontSize: 13,
    fontFamily: font.sans,
    color: color.text,
    background: color.surface,
    boxSizing: 'border-box',
    ...extra,
  }
}

// ── Buttons ─────────────────────────────────────────────────────────
// Pair with className="btn" for hover/active handling (see index.css).

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md'

const buttonPalette: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: color.brand, fg: '#fff' },
  success: { bg: color.successSolid, fg: '#fff' },
  danger: { bg: color.dangerSolid, fg: '#fff' },
  secondary: { bg: color.chip, fg: color.text },
  ghost: { bg: 'transparent', fg: color.textMuted, border: color.borderStrong },
}

export function button(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): CSSProperties {
  const p = buttonPalette[variant]
  return {
    background: p.bg,
    color: p.fg,
    border: p.border ? `1px solid ${p.border}` : 'none',
    padding: size === 'sm' ? '5px 12px' : '9px 18px',
    borderRadius: radius.sm,
    cursor: 'pointer',
    fontSize: size === 'sm' ? 12 : 13,
    fontWeight: 600,
    fontFamily: font.sans,
    lineHeight: 1.4,
    transition: 'filter .12s ease, transform .04s ease',
  }
}

// ── Badges ──────────────────────────────────────────────────────────

export type Tone = 'brand' | 'success' | 'danger' | 'info' | 'warning' | 'purple' | 'neutral'

const tonePalette: Record<Tone, { solid: string; soft: string; text: string }> = {
  brand: { solid: color.brand, soft: color.brandSoftBg, text: color.brandDark },
  success: { solid: color.successSolid, soft: color.successSoft, text: color.success },
  danger: { solid: color.dangerSolid, soft: color.dangerSoft, text: color.danger },
  info: { solid: color.infoSolid, soft: color.infoSoft, text: color.info },
  warning: { solid: color.warningSolid, soft: color.warningSoft, text: color.warning },
  purple: { solid: color.purpleSolid, soft: color.purpleSoft, text: color.purple },
  neutral: { solid: color.neutral, soft: color.neutralSoft, text: color.textMuted },
}

/** Soft pill badge (light tint bg + dark text) — the default, used for status/role/tag chips. */
export function badge(tone: Tone): CSSProperties {
  const p = tonePalette[tone]
  return {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: radius.pill,
    fontSize: 11,
    fontWeight: 600,
    color: p.text,
    background: p.soft,
    whiteSpace: 'nowrap',
  }
}

/** Solid badge (color fill + white text) — reserved for the one or two states that should pop (e.g. LATEST). */
export function badgeSolid(tone: Tone): CSSProperties {
  const p = tonePalette[tone]
  return {
    display: 'inline-block',
    padding: '2px 9px',
    borderRadius: radius.sm,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '.03em',
    textTransform: 'uppercase',
    color: '#fff',
    background: p.solid,
    whiteSpace: 'nowrap',
  }
}

// ── Tables ──────────────────────────────────────────────────────────

export function th(): CSSProperties {
  return {
    textAlign: 'left',
    padding: '11px 16px',
    color: color.textMuted,
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '.04em',
    borderBottom: `1px solid ${color.border}`,
  }
}

export function td(extra?: CSSProperties): CSSProperties {
  return { padding: '11px 16px', fontSize: 13, color: color.text, ...extra }
}

export function table(): CSSProperties {
  return { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
}

// ── Tabs ────────────────────────────────────────────────────────────

/** Pill-style tab button (Staff / Version Control / Advertisements sub-tabs). */
export function tabPill(active: boolean): CSSProperties {
  return {
    padding: '7px 16px',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    fontFamily: font.sans,
    background: active ? color.brand : color.chip,
    color: active ? '#fff' : color.textMuted,
    borderRadius: radius.pill,
  }
}

/** Underline-style tab button (Client detail page). */
export function tabUnderline(active: boolean): CSSProperties {
  return {
    padding: '10px 18px',
    border: 'none',
    borderBottom: active ? `2px solid ${color.brand}` : '2px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    fontFamily: font.sans,
    color: active ? color.brand : color.textMuted,
  }
}

// ── Alerts ──────────────────────────────────────────────────────────

export function alert(tone: 'success' | 'danger' | 'warning' | 'info'): CSSProperties {
  const p = tonePalette[tone]
  return {
    background: p.soft,
    color: p.text,
    padding: '9px 14px',
    borderRadius: radius.sm,
    fontSize: 13,
    marginBottom: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  }
}

export function dismissButton(): CSSProperties {
  return { border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, fontSize: 13, flexShrink: 0 }
}

// ── Modals ──────────────────────────────────────────────────────────

export function modalOverlay(): CSSProperties {
  return {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15,17,21,.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 20,
  }
}

export function modalPanel(width = 440): CSSProperties {
  return {
    ...card({ padding: 0 }),
    width,
    maxWidth: '100%',
    maxHeight: '86vh',
    overflowY: 'auto',
    boxShadow: shadow.popover,
  }
}

// ── Client-target chip picker (Advertisements / Video Banner forms) ──

export function targetChip(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    fontWeight: 500,
    background: active ? color.brand : color.chip,
    color: active ? '#fff' : color.text,
    padding: '5px 12px',
    borderRadius: radius.pill,
    cursor: 'pointer',
    userSelect: 'none',
  }
}
