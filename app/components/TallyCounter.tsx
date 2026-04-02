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
      {/* ── SVG: round handheld tally counter, icon style ── */}
      <svg
        viewBox="0 0 100 132"
        width="110"
        height="145"
        aria-label={`Tally counter showing ${displayCount}`}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <radialGradient id="tc-body" cx="36%" cy="32%" r="68%">
            <stop offset="0%"   stopColor="#686868"/>
            <stop offset="55%"  stopColor="#383838"/>
            <stop offset="100%" stopColor="#202020"/>
          </radialGradient>
          <linearGradient id="tc-btn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#c8c8c8"/>
            <stop offset="55%"  stopColor="#888888"/>
            <stop offset="100%" stopColor="#585858"/>
          </linearGradient>
          <filter id="tc-glow" x="-30%" y="-40%" width="160%" height="180%">
            <feGaussianBlur stdDeviation="1.5" result="b"/>
            <feMerge>
              <feMergeNode in="b"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* ── Finger loop + stem ── */}
        {/* Stem connecting counter bottom to ring */}
        <rect x="43" y="97" width="14" height="14" rx="3"
          fill="#2e2e2e" stroke="#484848" strokeWidth="0.8"/>
        {/* Loop shadow */}
        <circle cx="50" cy="119" r="12" fill="none" stroke="#111"    strokeWidth="8"/>
        {/* Loop body */}
        <circle cx="50" cy="119" r="12" fill="none" stroke="#505050" strokeWidth="5"/>
        {/* Loop inner edge */}
        <circle cx="50" cy="119" r="12" fill="none" stroke="#383838" strokeWidth="2.5"/>
        {/* Loop top-left highlight */}
        <path d="M 41,115 A 12 12 0 0 1 50,107"
          fill="none" stroke="#888" strokeWidth="1.8" strokeLinecap="round"/>

        {/* ── Counter body ── */}
        {/* Drop shadow */}
        <circle cx="51" cy="64" r="39" fill="#000" opacity="0.25"/>
        {/* Outer rim */}
        <circle cx="50" cy="62" r="39" fill="#141414"/>
        {/* Body */}
        <circle cx="50" cy="62" r="38" fill="url(#tc-body)"/>
        {/* Inset face disc */}
        <circle cx="50" cy="62" r="31" fill="#181818"/>
        {/* Outer engraved ring */}
        <circle cx="50" cy="62" r="38" fill="none" stroke="#505050" strokeWidth="1.2"/>
        {/* Inner engraved ring */}
        <circle cx="50" cy="62" r="31" fill="none" stroke="#3a3a3a" strokeWidth="1"/>
        {/* Top-left specular arc */}
        <path d="M 20,50 A 38 38 0 0 1 62,24"
          fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="5" strokeLinecap="round"/>

        {/* ── Display window ── */}
        {/* Bezel */}
        <rect x="24" y="50" width="52" height="28" rx="5"
          fill="#0c0c0c" stroke="#3a3a3a" strokeWidth="1.2"/>
        {/* Screen */}
        <rect x="26" y="52" width="48" height="24" rx="3" fill="#080808"/>
        {/* Amber top-edge wash */}
        <rect x="26" y="52" width="48" height="8"  rx="3"
          fill="rgba(245,182,0,0.05)"/>

        {/* Number */}
        <text
          x="50" y="66"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="'Courier New', Courier, monospace"
          fontSize="19"
          fontWeight="900"
          fill={isZero ? '#505050' : '#f5b800'}
          filter={isZero ? undefined : 'url(#tc-glow)'}
          style={{ letterSpacing: '0.08em' }}
        >
          {padded}
        </text>

        {/* ── Button (translates down on click) ── */}
        <g
          transform={`translate(0, ${isPressed ? 3 : 0})`}
          style={{ transition: 'transform 55ms ease-in' }}
        >
          {/* Socket — where button seats into the body */}
          <ellipse cx="50" cy="25" rx="13" ry="5.5"
            fill="#1a1a1a" stroke="#444" strokeWidth="0.8"/>
          {/* Button dome */}
          <ellipse cx="50" cy="23" rx="13" ry="6.5"
            fill="url(#tc-btn)" stroke="#666" strokeWidth="0.8"/>
          {/* Button top sheen */}
          <ellipse cx="49" cy="19" rx="8"  ry="3.5"
            fill="rgba(255,255,255,0.22)"/>
          {/* Button press shadow line */}
          <ellipse cx="50" cy="28" rx="10" ry="3"
            fill="#111" opacity="0.2"/>
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
