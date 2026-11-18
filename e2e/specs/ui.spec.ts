import { existsSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { clippedOrOverlapping, horizontalOverflow, open, pageName, sitePaths } from '../lib/pages'
import { CONFIGURED, NOT_CONFIGURED } from '../lib/site'
import { site } from '../site.config'

/**
 * UI per page and width (projects ui-390, ui-768, ui-1024, ui-1440):
 *   - no horizontal scroll; no text cut off; no controls on top of each other
 *   - a visual baseline per page (e2e/specs/__screenshots__/<platform>/)
 *   - axe: WCAG 2.1 A and AA
 * In light and dark mode when the site has both (site.config themes).
 */

test.skip(!CONFIGURED, NOT_CONFIGURED)

const paths = CONFIGURED ? await sitePaths() : []
const themes: ('light' | 'dark' | null)[] = site.themes.length ? site.themes : [null]

/**
 * 09:00 today in Stockholm: the booking widget then shows the whole day's
 * times on every run, so its height (and the page's) does not depend on
 * when the suite runs. Only the page's clock; the API keeps real time.
 */
function stockholmMorning(): Date {
  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Stockholm', timeZoneName: 'longOffset' })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName')!
    .value.replace('GMT', '') || '+00:00'
  return new Date(`${day}T09:00:00${offset}`)
}

/** Things that move or come from outside: masked in the baselines. */
function masks(page: Page) {
  return [
    ...site.visualMasks,
    '[role="timer"]',
    'canvas',
    'iframe',
    '.leaflet-container',
    // Dates and times change every day.
    '[role="group"][aria-label*="datum" i]',
    '[role="group"][aria-label*="tid" i]',
    'time',
  ].map((s) => page.locator(s))
}

for (const theme of themes) {
  for (const path of paths) {
    test(`${path}${theme ? ` (${theme})` : ''} @ui`, async ({ page }) => {
      if (theme) {
        await page.addInitScript((t) => {
          try {
            localStorage.setItem('booqy-theme', t)
          } catch {
            // no storage: the site's default
          }
        }, theme)
      }
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.clock.setFixedTime(stockholmMorning())
      await open(page, path)
      if (theme) await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

      await test.step('no horizontal scroll', async () => {
        expect.soft(await horizontalOverflow(page), `${path} overflows sideways`).toEqual([])
      })

      await test.step('nothing clipped or overlapping', async () => {
        expect.soft(await clippedOrOverlapping(page), `${path} has clipped or overlapping elements`).toEqual([])
      })

      await test.step('accessibility (axe, WCAG 2.1 AA)', async () => {
        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          // Third-party frames (map, Stripe) are not the site's markup.
          .exclude('iframe')
          .analyze()
        const violations = result.violations.map(
          (v) => `${v.impact}: ${v.id} (${v.help}) at ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`,
        )
        expect.soft(violations, `${path}: axe`).toEqual([])
      })

      // SITE_VISUAL=0 skips the baselines (a local build differs from the deployed site on purpose).
      if (process.env.SITE_VISUAL !== '0') await test.step('visual baseline', async () => {
        const name = `${pageName(path)}${theme ? `-${theme}` : ''}.png`
        const updating = ['all', 'changed'].includes(test.info().config.updateSnapshots)
        if (!updating && !existsSync(test.info().snapshotPath(name, { kind: 'screenshot' }))) {
          // No baseline on this platform yet (a new page, or the first run on Linux):
          // reported, not failed. "Actions -> Visual baselines" writes them.
          test.info().annotations.push({ type: 'no visual baseline', description: `${name}: run the Visual baselines workflow (or npm run baselines)` })
          return
        }
        await page.evaluate(() => window.scrollTo(0, 0))
        if (site.visualHide.length) await page.addStyleTag({ content: `${site.visualHide.join(', ')} { visibility: hidden !important; }` })
        await expect.soft(page).toHaveScreenshot(name, {
          fullPage: true,
          mask: masks(page),
          timeout: 20_000,
        })
      })
    })
  }
}
