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
      {/* ── SVG: hand holding circular tally counter ── */}
      {/*
          Layer order (back → front):
          1. Finger segments — poke out left of counter circle
          2. Palm            — visible right of counter circle
          3. Counter body    — round disc, covers hand overlap naturally
          4. Display + label — on counter face
          5. Finger loop     — ring at bottom of counter
          6. Animated group  — button + thumb (translate on click)
      */}
      <svg
        viewBox="0 0 155 195"
        width="148"
        height="186"
        aria-label={`Tally counter showing ${displayCount}`}
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Counter body: radial gunmetal */}
          <radialGradient id="tc-body" cx="38%" cy="35%" r="65%">
            <stop offset="0%"   stopColor="#6a6a6a"/>
            <stop offset="60%"  stopColor="#3a3a3a"/>
            <stop offset="100%" stopColor="#1e1e1e"/>
          </radialGradient>
          {/* Counter face: slightly lighter dark disc */}
          <radialGradient id="tc-face" cx="35%" cy="32%" r="65%">
            <stop offset="0%"   stopColor="#484848"/>
            <stop offset="100%" stopColor="#1a1a1a"/>
          </radialGradient>
          {/* Button: top-lit silver */}
          <linearGradient id="tc-btn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#c4c4c4"/>
            <stop offset="50%"  stopColor="#909090"/>
            <stop offset="100%" stopColor="#606060"/>
          </linearGradient>
          {/* Display screen */}
          <linearGradient id="tc-disp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#080808"/>
            <stop offset="100%" stopColor="#111111"/>
          </linearGradient>
          {/* Amber glow on the number */}
          <filter id="tc-glow" x="-25%" y="-35%" width="150%" height="170%">
            <feGaussianBlur stdDeviation="1.5" result="b"/>
            <feMerge>
              <feMergeNode in="b"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* ── 1. FINGER SEGMENTS (behind counter, left side) ─────────────── */}
        {/* Counter: cx=72 r=43 → left edge x=29. Fingers peek out left of x=29. */}

        {/* Index finger */}
        <ellipse cx="26" cy="83"  rx="14"   ry="9"   fill="#c8845a"/>
        <ellipse cx="21" cy="86"  rx="7"    ry="3.5" fill="#a06840" opacity="0.35"/>
        <path d="M 13,82 Q 20,78 27,80" fill="none" stroke="#a06840" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>

        {/* Middle finger */}
        <ellipse cx="24" cy="100" rx="14"   ry="9"   fill="#c8845a"/>
        <ellipse cx="19" cy="103" rx="7"    ry="3.5" fill="#a06840" opacity="0.35"/>
        <path d="M 11,99 Q 18,95 25,97" fill="none" stroke="#a06840" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>

        {/* Ring finger */}
        <ellipse cx="25" cy="116" rx="13"   ry="8.5" fill="#c8845a"/>
        <ellipse cx="20" cy="119" rx="6.5"  ry="3"   fill="#a06840" opacity="0.35"/>
        <path d="M 13,115 Q 19,111 26,113" fill="none" stroke="#a06840" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>

        {/* Pinky */}
        <ellipse cx="28" cy="131" rx="11"   ry="7.5" fill="#c8845a"/>
        <ellipse cx="24" cy="134" rx="5.5"  ry="3"   fill="#a06840" opacity="0.35"/>
        <path d="M 18,130 Q 23,127 29,129" fill="none" stroke="#a06840" strokeWidth="1" strokeLinecap="round" opacity="0.4"/>

        {/* ── 2. PALM (right side, behind counter) ────────────────────────── */}
        <path
          d="M 111,72
             C 126,68 139,84 139,105
             C 139,128 133,154 120,167
             C 111,176 97,179 87,173
             C 79,168 78,158 84,152
             C 90,146 101,144 111,137
             C 123,128 126,114 124,105
             C 122,90 118,78 111,72 Z"
          fill="#c8845a"
        />
        {/* Right-edge shadow for depth */}
        <path
          d="M 122,74
             C 132,82 139,96 139,112
             C 139,134 133,157 120,168 L 122,170
             C 135,159 141,136 141,112
             C 141,88 131,71 119,68 Z"
          fill="#a06840"
          opacity="0.28"
        />
        {/* Inner-edge highlight where palm meets counter */}
        <path
          d="M 111,72
             C 116,82 118,94 118,105
             C 118,118 114,131 108,139
             C 102,147 94,148 88,150
             C 95,146 105,139 111,131
             C 119,121 121,113 121,105
             C 121,92 117,80 111,72 Z"
          fill="#e09868"
          opacity="0.25"
        />

        {/* ── 3. COUNTER BODY ──────────────────────────────────────────────── */}
        {/* Drop shadow */}
        <circle cx="74" cy="107" r="44" fill="#000" opacity="0.28"/>
        {/* Outer rim */}
        <circle cx="72" cy="105" r="44" fill="#151515"/>
        {/* Body gradient */}
        <circle cx="72" cy="105" r="43" fill="url(#tc-body)"/>
        {/* Face disc */}
        <circle cx="72" cy="105" r="37" fill="url(#tc-face)"/>
        {/* Engraved ring details */}
        <circle cx="72" cy="105" r="37" fill="none" stroke="#505050" strokeWidth="1.5"/>
        <circle cx="72" cy="105" r="30" fill="none" stroke="#2e2e2e" strokeWidth="0.8"/>
        {/* Top-edge specular highlight */}
        <path
          d="M 44,70 A 43 43 0 0 1 100,70"
          fill="none" stroke="rgba(255,255,255,0.11)" strokeWidth="5" strokeLinecap="round"
        />

        {/* ── 4. DISPLAY + LABEL ───────────────────────────────────────────── */}
        <text
          x="72" y="80"
          textAnchor="middle"
          fontFamily="'Courier New', Courier, monospace"
          fontSize="5.5"
          fill="#585858"
          letterSpacing="2"
        >
          DISRUPTIONS
        </text>

        {/* Display bezel */}
        <rect x="48" y="88" width="48" height="26" rx="4"
          fill="#0e0e0e" stroke="#383838" strokeWidth="1.2"/>
        {/* Display screen */}
        <rect x="50" y="90" width="44" height="22" rx="3" fill="url(#tc-disp)"/>
        {/* Amber inner-top glow */}
        <rect x="50" y="90" width="44" height="7"  rx="3" fill="rgba(245,182,0,0.06)"/>

        {/* Number */}
        <text
          x="72" y="103"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="'Courier New', Courier, monospace"
          fontSize="18"
          fontWeight="900"
          fill={isZero ? '#555' : '#f5b800'}
          filter={isZero ? undefined : 'url(#tc-glow)'}
          style={{ letterSpacing: '0.1em' }}
        >
          {padded}
        </text>

        {/* ── 5. FINGER LOOP ───────────────────────────────────────────────── */}
        <circle cx="72" cy="150" r="10" fill="none" stroke="#111"    strokeWidth="6"/>
        <circle cx="72" cy="150" r="10" fill="none" stroke="#484848" strokeWidth="3.5"/>
        {/* Loop top highlight arc */}
        <path
          d="M 65,146 A 10 10 0 0 1 72,140"
          fill="none" stroke="#777" strokeWidth="2" strokeLinecap="round"
        />

        {/* ── 6. THUMB + BUTTON (animated together on click) ───────────────── */}
        {/*
            Thumb comes from the palm on the right (base ~112,90),
            arcs up-left to the button at the top of the counter (~72,60).
            On isPressed: whole group shifts down 3px — thumb pressing in.
        */}
        <g
          transform={`translate(0, ${isPressed ? 3 : 0})`}
          style={{ transition: 'transform 55ms ease-in' }}
        >
          {/* Button shadow */}
          <ellipse cx="72" cy="62" rx="17"   ry="9"   fill="#000"            opacity="0.35"/>
          {/* Button body */}
          <ellipse cx="72" cy="60" rx="17"   ry="9"   fill="url(#tc-btn)"   stroke="#666" strokeWidth="0.8"/>
          {/* Button top sheen */}
          <ellipse cx="70" cy="56" rx="10.5" ry="4.5" fill="rgba(255,255,255,0.22)"/>

          {/* Thumb body — dorsal (nail) side faces up/viewer */}
          <path
            d="M 112,90
               C 110,76 106,63 98,56
               C 92,50 84,48 77,51
               C 71,54 69,59 71,63
               C 73,67 79,68 85,66
               C 93,64 102,63 108,70
               C 112,76 114,83 112,90 Z"
            fill="#c8845a"
          />
          {/* Dorsal highlight */}
          <path
            d="M 110,84
               C 108,72 104,62 96,56
               C 90,51 83,49 77,51
               C 84,49 93,52 99,57
               C 107,64 110,78 112,90 Z"
            fill="#e09868"
            opacity="0.38"
          />
          {/* IP-joint knuckle crease */}
          <path
            d="M 100,60 C 102,63 102,67 99,69"
            fill="none" stroke="#a06840" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"
          />
          {/* Thumbnail */}
          <ellipse cx="73" cy="56" rx="5.5" ry="3.5" fill="#ddd5b0" opacity="0.8"/>
          <ellipse cx="73" cy="57" rx="4"   ry="2.4" fill="none"
            stroke="#c4bc98" strokeWidth="0.6" opacity="0.55"/>
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
