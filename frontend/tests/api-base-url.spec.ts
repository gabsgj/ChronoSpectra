import { expect, test } from '@playwright/test'

import {
  buildApiBaseUrlCandidates,
  rewriteLoopbackBaseUrl,
} from '../src/api/baseUrl'

test('rewrites localhost backend URLs for mobile or LAN clients', () => {
  expect(
    rewriteLoopbackBaseUrl('http://localhost:8000', {
      origin: 'http://192.168.1.25:5173',
      protocol: 'http:',
      hostname: '192.168.1.25',
    }),
  ).toBe('http://192.168.1.25:8000')
})

test('prefers same-host backend candidates before raw localhost when config is loopback-only', () => {
  expect(
    buildApiBaseUrlCandidates({
      configuredUrl: 'http://localhost:8000',
      locationSnapshot: {
        origin: 'http://192.168.1.25:5173',
        protocol: 'http:',
        hostname: '192.168.1.25',
      },
    }),
  ).toEqual([
    'http://192.168.1.25:8000',
    'http://192.168.1.25:5173/api',
    'http://192.168.1.25:5173',
    'http://192.168.1.25:8000/api',
    'http://localhost:8000',
  ])
})

test('keeps explicit deployed API origins ahead of same-origin fallbacks', () => {
  expect(
    buildApiBaseUrlCandidates({
      configuredUrl: 'https://api.example.com',
      locationSnapshot: {
        origin: 'https://chronospectra.example.com',
        protocol: 'https:',
        hostname: 'chronospectra.example.com',
      },
    }).slice(0, 3),
  ).toEqual([
    'https://api.example.com',
    'https://chronospectra.example.com/api',
    'https://chronospectra.example.com',
  ])
})
