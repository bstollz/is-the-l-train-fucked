'use client'

import { useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// localStorage helpers — persist seen alert IDs for the current week
// ---------------------------------------------------------------------------

function getMondayKey(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

interface LocalData {
  week: string
  ids: string[]
}

function readLocal(): LocalData {
  try {
    const raw = localStorage.getItem('ltrain-weekly')
    if (raw) {
      const parsed: LocalData = JSON.parse(raw)
      if (parsed.week === getMondayKey()) return parsed
    }
  } catch { /* ignore */ }
  return { week: getMondayKey(), ids: [] }
}

function mergeLocal(incomingIds: string[]): number {
  const local = readLocal()
  const merged = new Set([...local.ids, ...incomingIds])
  try {
    localStorage.setItem('ltrain-weekly', JSON.stringify({ week: local.week, ids: [...merged] }))
  } catch { /* ignore */ }
  return merged.size
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TallyCounter({ textColor }: { textColor: string }) {
  const [displayCount, setDisplayCount] = useState(0)
  const [finalCount, setFinalCount]     = useState<number | null>(null)
  const [isPressed, setIsPressed]       = useState(false)
  const animFrameRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch + localStorage merge on mount
  useEffect(() => {
    let cancelled = false

    async function load() {
      // Seed from localStorage immediately so we have *something* before the fetch
      const localCount = readLocal().ids.length

      let serverIds: string[] = []
      try {
        const res = await fetch('/api/weekly-count')
        if (res.ok) {
          const data = await res.json()
          serverIds = data.alertIds ?? []
        }
      } catch { /* network error — fall back to local only */ }

      if (cancelled) return

      const count = Math.max(localCount, mergeLocal(serverIds))
      setFinalCount(count)
    }

    load()
    return () => { cancelled = true }
  }, [])

  // Animate when finalCount is known and > 0
  useEffect(() => {
    if (finalCount === null || finalCount === 0) return

    // Decide step size so the animation is always ≤ ~3.5 seconds
    const totalSteps = Math.min(finalCount, 60)
    const stepSize   = Math.ceil(finalCount / totalSteps)
    const interval   = finalCount <= 15 ? 220 : finalCount <= 40 ? 110 : 60

    let current = 0

    function tick() {
      current = Math.min(current + stepSize, finalCount as number)

      // Press button down
      setIsPressed(true)
      setDisplayCount(current)

      // Release button after 55ms
      animFrameRef.current = setTimeout(() => {
        setIsPressed(false)

        if (current < (finalCount as number)) {
          animFrameRef.current = setTimeout(tick, interval - 55)
        }
      }, 55)
    }

    // Small initial delay so the page has settled
    animFrameRef.current = setTimeout(tick, 600)

    return () => {
      if (animFrameRef.current) clearTimeout(animFrameRef.current)
    }
  }, [finalCount])

  // Before we know the count, show nothing
  if (finalCount === null) return null

  const isZero = finalCount === 0
  const padded = String(displayCount).padStart(4, '0')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        marginTop: '2rem',
        marginBottom: '0.5rem',
      }}
    >
      {/* ── SVG clicker counter ── */}
      <svg
        viewBox="0 0 100 168"
        width="110"
        height="185"
        aria-label={`Tally counter showing ${displayCount}`}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="tc-body" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#2e2e2e"/>
            <stop offset="20%"  stopColor="#555"/>
            <stop offset="50%"  stopColor="#606060"/>
            <stop offset="80%"  stopColor="#505050"/>
            <stop offset="100%" stopColor="#2e2e2e"/>
          </linearGradient>
          <linearGradient id="tc-btn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#909090"/>
            <stop offset="100%" stopColor="#555"/>
          </linearGradient>
          <linearGradient id="tc-display" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#0a0a0a"/>
            <stop offset="100%" stopColor="#111"/>
          </linearGradient>
          <filter id="tc-glow" x="-20%" y="-30%" width="140%" height="160%">
            <feGaussianBlur stdDeviation="1.5" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* ── Finger loop (behind body) ── */}
        <circle cx="50" cy="152" r="16" fill="none" stroke="#1a1a1a" strokeWidth="12"/>
        <circle cx="50" cy="152" r="16" fill="none" stroke="#555"    strokeWidth="7"/>
        {/* loop highlight arc */}
        <path
          d="M 38 148 A 16 16 0 0 1 50 136"
          fill="none" stroke="#888" strokeWidth="2.5" strokeLinecap="round"
        />

        {/* ── Body drop-shadow ── */}
        <rect x="13" y="17" width="74" height="113" rx="22" fill="#000" opacity="0.45"/>

        {/* ── Main body ── */}
        <rect x="10" y="14" width="74" height="113" rx="22" fill="url(#tc-body)"/>

        {/* top-edge sheen */}
        <rect x="14" y="14" width="66" height="7" rx="14" fill="rgba(255,255,255,0.07)"/>
        {/* left-edge sheen */}
        <rect x="10" y="22" width="4" height="88" rx="2" fill="rgba(255,255,255,0.05)"/>

        {/* ── Rivets ── */}
        {[
          [23, 28], [73, 28],
          [23, 110], [73, 110],
        ].map(([cx, cy]) => (
          <g key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy} r="3.2" fill="#3a3a3a" stroke="#666" strokeWidth="0.6"/>
            <circle cx={cx - 0.8} cy={cy - 0.8} r="1" fill="rgba(255,255,255,0.35)"/>
          </g>
        ))}

        {/* ── Label above display ── */}
        <text
          x="47" y="42"
          textAnchor="middle"
          fontFamily="'Courier New', Courier, monospace"
          fontSize="5"
          fill="#666"
          letterSpacing="2.5"
        >
          DISRUPTIONS
        </text>

        {/* ── Display bezel ── */}
        <rect x="17" y="47" width="62" height="34" rx="5"
          fill="#111" stroke="#2a2a2a" strokeWidth="1.5"/>
        {/* ── Display screen ── */}
        <rect x="19" y="49" width="58" height="30" rx="3" fill="url(#tc-display)"/>
        {/* subtle inner top-edge reflection */}
        <rect x="19" y="49" width="58" height="6" rx="3" fill="rgba(245,184,0,0.05)"/>

        {/* ── Number ── */}
        <text
          x="48" y="69"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="'Courier New', Courier, monospace"
          fontSize="20"
          fontWeight="900"
          fill={isZero ? '#555' : '#f5b800'}
          filter={isZero ? undefined : 'url(#tc-glow)'}
          style={{ letterSpacing: '0.12em' }}
        >
          {padded}
        </text>

        {/* ── Thumb button (translates down when pressed) ── */}
        <g
          transform={`translate(0, ${isPressed ? 3 : 0})`}
          style={{ transition: 'transform 55ms ease-in' }}
        >
          {/* button shadow */}
          <rect x="27" y="9"  width="46" height="17" rx="8" fill="#111" opacity="0.5"/>
          {/* button body */}
          <rect x="25" y="7"  width="46" height="17" rx="8"
            fill="url(#tc-btn)" stroke="#888" strokeWidth="0.6"/>
          {/* button top highlight */}
          <rect x="30" y="9"  width="36" height="5" rx="3"
            fill="rgba(255,255,255,0.22)"/>
          {/* button bottom shadow line */}
          <rect x="28" y="21" width="40" height="2" rx="1"
            fill="rgba(0,0,0,0.25)"/>
        </g>
      </svg>

      {/* ── Caption ── */}
      <p
        style={{
          fontFamily: 'monospace',
          fontSize: '0.82rem',
          letterSpacing: '0.04em',
          color: textColor,
          opacity: isZero ? 0.75 : 0.85,
          textAlign: 'center',
          margin: 0,
          maxWidth: '260px',
          lineHeight: 1.5,
        }}
      >
        {isZero
          ? "the L hasn't been fucked yet this week... 🤞"
          : `the L has been fucked ${finalCount} time${finalCount === 1 ? '' : 's'} this week`
        }
      </p>
    </div>
  )
}
