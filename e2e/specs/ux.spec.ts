import { expect, test, type Page } from '@playwright/test'
import { open, sitePaths, smallTouchTargets } from '../lib/pages'
import { CONFIGURED, NOT_CONFIGURED, SITE_URL } from '../lib/site'
import { site } from '../site.config'

/**
 * UX checks per width (projects ui-390 .. ui-1440):
 *   - keyboard: every control can be reached with Tab and shows focus (computers)
 *   - touch targets at least 44x44 px (touch widths 390 and 768)
 *   - loading and error states appear when the API is slow or down
 *   - reduced motion: nothing keeps moving
 *   - Core Web Vitals on the dev site: LCP and CLS within budget
 */

test.skip(!CONFIGURED, NOT_CONFIGURED)

const paths = CONFIGURED ? await sitePaths() : []
const width = (page: Page) => page.viewportSize()?.width ?? 1440
const touch = (page: Page) => width(page) < 1024

for (const path of paths) {
  test(`${path} keyboard reaches every control @ux`, async ({ page }) => {
    test.skip(touch(page), 'keyboard is checked on the computer widths')
    await open(page, path)
    // Tag every control a guest can see and should reach with Tab.
    const total = await page.evaluate(() => {
      // [tabindex="-1"] on a heading or panel is a programmatic focus target, not a control.
      const selector = 'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [role="button"], [role="combobox"], [role="link"]'
      let n = 0
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        const r = el.getBoundingClientRect()
        const s = getComputedStyle(el)
        if (r.width <= 1 || r.height <= 1 || s.visibility === 'hidden' || el.closest('[inert], [aria-hidden="true"]')) continue
        // Roving focus (a group with one tab stop, arrows inside) is fine: tabindex -1 on purpose.
        if (el.tabIndex < 0 && el.closest('[role="radiogroup"], [role="listbox"], [role="tablist"], [role="grid"], [role="menu"], [role="group"]')) continue
        el.dataset.kb = String(n++)
      }
      return n
    })
    const seen = new Set<string>()
    const noFocusRing: string[] = []
    const limit = Math.min(total + 10, 300)
    for (let i = 0; i < limit; i++) {
      await page.keyboard.press('Tab')
      const stop = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || el === document.body) return null
        const s = getComputedStyle(el)
        // An iframe hands focus to its own page, which draws its own ring.
        const ring = el.tagName === 'IFRAME' || (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'
        const r = el.getBoundingClientRect()
        return { id: el.dataset.kb ?? '', ring, html: el.outerHTML.slice(0, 120), visible: r.width > 0 && r.height > 0 }
      })
      if (!stop) continue
      if (stop.id && seen.has(stop.id)) break
      if (stop.id) seen.add(stop.id)
      if (!stop.visible) noFocusRing.push(`focus on an invisible element: ${stop.html}`)
      else if (!stop.ring) noFocusRing.push(`no visible focus: ${stop.html}`)
    }
    if (total <= 300) {
      const missed = await page.evaluate(
        (seen) => [...document.querySelectorAll<HTMLElement>('[data-kb]')].filter((el) => !seen.includes(el.dataset.kb!)).map((el) => el.outerHTML.slice(0, 120)),
        [...seen],
      )
      expect.soft(missed, 'controls Tab never reaches').toEqual([])
    }
    expect(seen.size, 'Tab moves focus').toBeGreaterThan(0)
    expect.soft(noFocusRing, 'every tab stop shows focus').toEqual([])
  })

  test(`${path} touch targets are at least 44 px @ux`, async ({ page }) => {
    test.skip(!touch(page), 'touch targets are checked on the touch widths (390, 768)')
    await open(page, path)
    expect(await smallTouchTargets(page, 44)).toEqual([])
  })

  test(`${path} Core Web Vitals within budget @ux`, async ({ page }) => {
    test.skip(width(page) !== 390 && width(page) !== 1440, 'measured on phone and desktop')
    // As a lab measurement (Lighthouse): the page loads and settles, nobody scrolls.
    await page.goto(`${SITE_URL}${path}`, { waitUntil: 'load' })
    await page.waitForTimeout(3000)
    const vitals = await page.evaluate(
      () =>
        new Promise<{ lcp: number; cls: number; shifts: string[] }>((resolve) => {
          let lcp = 0
          const shifts: { t: number; v: number; who: string }[] = []
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) lcp = Math.max(lcp, e.startTime)
          }).observe({ type: 'largest-contentful-paint', buffered: true })
          type Shift = PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node }[] }
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as Shift[]) {
              if (e.hadRecentInput) continue
              const node = e.sources?.[0]?.node as Element | undefined
              shifts.push({ t: e.startTime, v: e.value, who: node ? `${node.nodeName?.toLowerCase()}.${String((node as Element).className ?? '').split(' ')[0]}` : '?' })
            }
          }).observe({ type: 'layout-shift', buffered: true })
          setTimeout(() => {
            // CLS as Core Web Vitals counts it: the worst session window (gaps < 1 s, at most 5 s).
            let worst = 0
            let current = 0
            let start = 0
            let last = 0
            for (const s of shifts.sort((a, b) => a.t - b.t)) {
              if (s.t - last > 1000 || s.t - start > 5000) {
                current = 0
                start = s.t
              }
              current += s.v
              last = s.t
              worst = Math.max(worst, current)
            }
            resolve({ lcp, cls: worst, shifts: shifts.filter((s) => s.v > 0.01).map((s) => `${s.who} ${s.v.toFixed(3)} at ${Math.round(s.t)} ms`) })
          }, 500)
        }),
    )
    if (vitals.shifts.length) test.info().annotations.push({ type: 'layout shifts', description: vitals.shifts.join('; ') })
    test.info().annotations.push({ type: 'web vitals', description: `LCP ${Math.round(vitals.lcp)} ms, CLS ${vitals.cls.toFixed(3)}` })
    expect.soft(vitals.lcp, 'LCP (ms)').toBeLessThanOrEqual(site.budgets.lcpMs)
    expect.soft(vitals.cls, `CLS (shifts: ${vitals.shifts.join('; ')})`).toBeLessThanOrEqual(site.budgets.cls)
  })

  test(`${path} respects reduced motion @ux`, async ({ page }) => {
    test.skip(width(page) !== 1440 && width(page) !== 390, 'checked on phone and desktop')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, path)
    await page.waitForTimeout(1500)
    const moving = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === 'running')
        .map((a) => {
          const t = a.effect?.getComputedTiming()
          const target = (a.effect as KeyframeEffect | null)?.target as Element | null
          return { infinite: t?.iterations === Infinity, duration: Number(t?.duration ?? 0), target: target ? `${target.tagName.toLowerCase()}.${target.className}` : '?' }
        })
        .filter((a) => a.infinite || a.duration > 1000)
        .map((a) => `${a.target} (${a.infinite ? 'loops' : `${a.duration} ms`})`),
    )
    expect(moving, 'animations still running with reduced motion').toEqual([])
  })
}

test('a slow API shows a loading state, not a blank page @ux', async ({ page }) => {
  let release: () => void = () => undefined
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/site-config*', async (route) => {
    await held
    await route.continue()
  })
  await page.goto(`${SITE_URL}/`, { waitUntil: 'commit' })
  const loading = page.locator('[aria-busy="true"], [role="status"], [role="progressbar"], .skeleton, [class*="skel" i], [class*="printing" i], [class*="loading" i]')
  await expect(loading.first()).toBeVisible({ timeout: 10_000 })
  release()
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 })
})

test('an API failure shows an error the guest can act on @ux', async ({ page }) => {
  await page.route('**/site-config*', (route) => route.fulfill({ status: 503, body: '{"error":"unavailable"}', contentType: 'application/json' }))
  await page.goto(`${SITE_URL}/`)
  const main = page.locator('body')
  // A message, and a way forward: try again, or call.
  await expect(main.getByText(/försök igen|kunde inte|inte tillgänglig|gick fel/i).first()).toBeVisible({ timeout: 20_000 })
  await expect(main.locator('button, a[href]').first()).toBeVisible()
})

test('a failing booking step shows its error and keeps the guest on the step @ux', async ({ page }) => {
  await page.route('**/locations/*/availability*', (route) =>
    route.fulfill({ status: 503, body: '{"error":"unavailable"}', contentType: 'application/json' }),
  )
  await page.route('**/locations/*/layout/active', (route) => route.fulfill({ status: 503, body: '{"error":"unavailable"}', contentType: 'application/json' }))
  await open(page, '/boka-bord')
  await expect(page.locator('main').getByText(/försök igen|kunde inte|ring/i).first()).toBeVisible()
})
