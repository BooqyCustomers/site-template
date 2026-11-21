import { defineConfig, devices } from '@playwright/test'
import { assertNotProd, API_URL, SITE_URL } from './lib/site'

/**
 * The site's test suite, run against the deployed dev site
 * (<slug>.dev.booqy.se) and the dev Booqy API. See README.md.
 *
 *   api           API integration: the site's calls to Booqy, through AWS WAF
 *   e2e-desktop   end-to-end flows at 1440
 *   e2e-phone     the same flows on a 390 px touch phone
 *   ui-390 .. ui-1440  layout, visual baselines, axe and UX checks per width
 */
assertNotProd(SITE_URL)
assertNotProd(API_URL, 'api')

const CI = Boolean(process.env.CI)

const width = (w: number, h: number, touch = false) => ({
  viewport: { width: w, height: h },
  ...(touch ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}),
})

export default defineConfig({
  testDir: './specs',
  timeout: 90_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  // Live dev site: a retry tells a hiccup from a bug (the report shows both).
  retries: CI ? 1 : 0,
  workers: CI ? 4 : 6,
  fullyParallel: true,
  forbidOnly: CI,
  // Baselines per platform (CI runs Linux), one folder per spec.
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}',
  // A page without a baseline on this platform is reported, not failed
  // (specs/ui.spec.ts); "Actions -> Visual baselines" or `npm run baselines`
  // writes them. A page that changed fails.
  updateSnapshots: 'none',
  reporter: CI
    ? [['github'], ['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: SITE_URL,
    locale: 'sv-SE',
    timezoneId: 'Europe/Stockholm',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    { name: 'api', testMatch: /api\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'e2e-desktop', testMatch: /flows\.spec\.ts/, use: { ...devices['Desktop Chrome'], ...width(1440, 900) } },
    { name: 'e2e-phone', testMatch: /flows\.spec\.ts/, use: { ...devices['Desktop Chrome'], ...width(390, 844, true) } },
    ...[
      [390, 844, true],
      [768, 1024, true],
      [1024, 768, false],
      [1440, 900, false],
    ].map(([w, h, touch]) => ({
      name: `ui-${w}`,
      testMatch: /(ui|ux)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], ...width(w as number, h as number, touch as boolean) },
    })),
  ],
})
