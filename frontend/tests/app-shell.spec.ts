import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

const apiBaseUrl =
  process.env.PLAYWRIGHT_API_BASE_URL ?? process.env.BACKEND_URL

if (!apiBaseUrl) {
  throw new Error('BACKEND_URL or PLAYWRIGHT_API_BASE_URL must be configured.')
}

const sharedConfig = JSON.parse(
  readFileSync(new URL('../../stocks.json', import.meta.url), 'utf-8'),
) as {
  stocks: Array<{
    id: string
    display_name: string
    enabled?: boolean
  }>
}

const activeStocks = sharedConfig.stocks.filter((stock) => stock.enabled !== false)

if (activeStocks.length === 0) {
  throw new Error('At least one enabled stock is required for Playwright checks.')
}

const primaryStock = activeStocks[0]
const activeStockIds = activeStocks.map((stock) => stock.id)

test('dashboard, stock detail, signal analysis, theme toggle, and live page render', async ({
  page,
  request,
}) => {
  await expect
    .poll(async () => {
      const response = await request.get(`${apiBaseUrl}/health`)
      return response.status()
    })
    .toBe(200)

  for (const stockId of activeStockIds) {
    const response = await request.get(`${apiBaseUrl}/data/market-data/${stockId}`)
    expect(response.ok()).toBeTruthy()
  }

  const marketStatusResponse = await request.get(`${apiBaseUrl}/live/market-status/NSE`)
  expect(marketStatusResponse.ok()).toBeTruthy()

  await page.goto('/')
  await expect(
    page.getByRole('heading', {
      name: 'Market pulse across every active stock',
    }),
  ).toBeVisible()
  await expect(
    page.getByLabel('Normalized stock comparison chart'),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open detail' })).toHaveCount(5)

  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', /dark|light/)
  const initialTheme = await html.getAttribute('data-theme')
  const themeToggle = page.getByRole('button', {
    name: /Switch to (light|dark) mode/i,
  })
  await themeToggle.click()
  await expect(html).toHaveAttribute(
    'data-theme',
    initialTheme === 'light' ? 'dark' : 'light',
  )

  await page.goto(`/stock/${primaryStock.id}`)
  await expect(
    page.getByRole('heading', { name: primaryStock.display_name }),
  ).toBeVisible()
  await expect(page.getByText('Stock Price', { exact: true })).toBeVisible()
  await expect(page.getByText('Market Index', { exact: true })).toBeVisible()
  await expect(page.getByText('USD-INR', { exact: true })).toBeVisible()

  await page.goto(`/signal/${primaryStock.id}`)
  await expect(
    page.getByRole('heading', { name: primaryStock.display_name }),
  ).toBeVisible()
  await expect(
    page.getByLabel('Frequency spectrum bar chart'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'CWT' }).click()
  await expect(page.getByText('CWT energy map')).toBeVisible()

  await page.goto(`/live?stock=${primaryStock.id}`)
  await expect(
    page.getByRole('heading', { name: primaryStock.display_name }),
  ).toBeVisible()
  await expect(page.getByText('Last 10 Predictions', { exact: true })).toBeVisible()
  await expect(page.getByText('Actual Price', { exact: true })).toBeVisible()
  await expect(
    page.getByText(/Market Closed|Live Stream|Connecting|Reconnecting|Stream Error/),
  ).toBeVisible()
})
