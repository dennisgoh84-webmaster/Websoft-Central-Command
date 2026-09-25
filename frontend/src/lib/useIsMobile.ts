import { useEffect, useState } from 'react'

/** Phone-width screens (Dennis, 2026-09-25: CC on mobile Safari). Matches index.css's @media (max-width: 760px). */
export const MOBILE_QUERY = '(max-width: 760px)'

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}
