import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ltrain.WTF',
    short_name: 'LtrainWTF',
    description: 'Real-time L train status. Brutally honest.',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#1a1a2e',
    icons: [
      {
        src: '/icon-192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
      },
      {
        src: '/icon-512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
