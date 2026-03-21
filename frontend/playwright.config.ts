import { defineConfig, devices } from '@playwright/test'

const frontendBaseUrl =
  process.env.PLAYWRIGHT_BASE_URL ?? process.env.FRONTEND_URL

if (!frontendBaseUrl) {
  throw new Error('FRONTEND_URL or PLAYWRIGHT_BASE_URL must be configured.')
}

const previewUrl = new URL(frontendBaseUrl)
const previewHost = previewUrl.hostname
const previewPort = previewUrl.port || (previewUrl.protocol === 'https:' ? '443' : '80')

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: frontendBaseUrl,
    channel: 'msedge',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `npm.cmd run preview -- --host ${previewHost} --port ${previewPort}`,
    url: frontendBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
