'use client'

import { useEffect, useState } from 'react'

// BeforeInstallPromptEvent is not in the standard TypeScript lib
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type InstallState = 'idle' | 'chrome' | 'ios' | 'hidden'

export default function InstallPrompt() {
  const [state, setState] = useState<InstallState>('idle')
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Already running as installed PWA — don't show anything
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return

    const ua = navigator.userAgent.toLowerCase()
    const isIOS = /iphone|ipad|ipod/.test(ua)

    if (isIOS) {
      setState('ios')
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setState('chrome')
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setState('hidden')
    setDeferredPrompt(null)
  }

  if (state === 'idle' || state === 'hidden') return null

  return (
    <div
      role="banner"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#111111',
        borderTop: '1px solid #A7A9AC',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.75rem 1.25rem',
        fontFamily: 'monospace',
        gap: '1rem',
        zIndex: 50,
      }}
    >
      {/* Left: L bullet + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <div
          aria-hidden="true"
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: '#A7A9AC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 900,
            fontSize: '0.9rem',
            color: '#111111',
            flexShrink: 0,
          }}
        >
          L
        </div>
        {state === 'chrome' ? (
          <span style={{ fontSize: '0.78rem', color: '#cccccc', letterSpacing: '0.04em' }}>
            Add to your home screen for quick access
          </span>
        ) : (
          <span style={{ fontSize: '0.78rem', color: '#cccccc', letterSpacing: '0.04em' }}>
            Tap{' '}
            {/* iOS share icon */}
            <svg
              aria-label="Share"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              style={{
                display: 'inline',
                width: '0.95em',
                height: '0.95em',
                verticalAlign: 'text-bottom',
                fill: 'none',
                stroke: '#A7A9AC',
                strokeWidth: 2,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
              }}
            >
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            {' '}then{' '}
            <strong style={{ color: '#ffffff' }}>&ldquo;Add to Home Screen&rdquo;</strong>
          </span>
        )}
      </div>

      {/* Right: action button + dismiss */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {state === 'chrome' && (
          <button
            onClick={handleInstall}
            style={{
              padding: '0.35rem 0.9rem',
              border: '1px solid rgba(255,255,255,0.5)',
              borderRadius: '0.3rem',
              backgroundColor: 'transparent',
              color: '#ffffff',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            install
          </button>
        )}
        <button
          onClick={() => setState('hidden')}
          aria-label="Dismiss install prompt"
          style={{
            padding: '0.35rem 0.5rem',
            border: 'none',
            backgroundColor: 'transparent',
            color: '#888888',
            fontFamily: 'monospace',
            fontSize: '1rem',
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
