import { expect, type Page } from '@playwright/test'
import { site } from '../site.config'
import { API_URL, SITE_URL, siteConfig } from './site'

/**
 * Every page of the site: site.config pages plus the kit's flows that the
 * plan has (site-config features). Read when the spec loads, so a feature
 * turned on in Booqy is tested on the next run.
 */
export async function sitePaths(): Promise<string[]> {
  const features = (await siteConfig()).tenant.features
  const flows = [
    features.reservations && '/boka-bord',
    features.reservations && '/bokningsvillkor',
    features.ordering && '/bestall',
    features.catering && '/catering',
    features.giftCards && '/presentkort',
    features.giftCards && '/presentkort/saldo',
    features.events && '/evenemang',
    '/integritetspolicy',
    '/cookies',
  ].filter(Boolean) as string[]
  return [...new Set([...site.pages, ...flows])]
}

/** Internal links on the current page (header, footer, menus), without hash or query. */
export async function internalLinks(page: Page): Promise<string[]> {
  const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href') ?? ''))
  return [...new Set(hrefs.filter((h) => h.startsWith('/') && !h.startsWith('//')).map((h) => h.split('#')[0].split('?')[0] || '/'))]
}

/** A file-safe name for a path, for screenshots. */
export function pageName(path: string): string {
  return path === '/' ? 'start' : path.replace(/^\//, '').replace(/\//g, '-')
}

/** Opens a path and waits until the page has rendered (h1 visible, no skeleton left). */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(`${SITE_URL}${path}`, { waitUntil: 'load' })
  await expect(page.locator('h1').first(), `${path}: no heading`).toBeVisible({ timeout: 20_000 })
  await settle(page)
}

/** Waits until loading indicators are gone, fonts are in and images have loaded. */
export async function settle(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        !document.querySelector('[aria-busy="true"], .skeleton, .site-skeleton') &&
        [...document.images].every((img) => img.complete),
      null,
      { timeout: 15_000 },
    )
    .catch(() => undefined)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
}

/**
 * Console errors and failed requests while the page runs. API answers the
 * site handles itself (404 for something the restaurant has not set up yet,
 * the visit beacon) are not errors; anything else is.
 */
export function watchErrors(page: Page): () => string[] {
  const errors: string[] = []
  const apiOrigin = API_URL ? new URL(API_URL).origin : ''
  const handled = (url: string, status: number) =>
    (url.startsWith(apiOrigin) || url.startsWith(`${SITE_URL}/api/`)) && (status === 404 || status === 409 || url.endsWith('/t'))
  const statuses = new Map<string, number>()
  page.on('response', (res) => {
    const url = res.url()
    statuses.set(url, res.status())
    if (res.status() >= 400 && !handled(url, res.status()) && !url.includes('awswaf.com')) {
      errors.push(`HTTP ${res.status()} ${res.request().method()} ${url}`)
    }
  })
  page.on('pageerror', (err) => errors.push(`page error: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    // The browser's own line for a response already judged above.
    if (/^Failed to load resource: the server responded with a status of (404|409)/.test(text)) return
    errors.push(`console: ${text.slice(0, 300)}`)
  })
  page.on('requestfailed', (req) => {
    const url = req.url()
    // Aborted on navigation, the visit beacon (keepalive) and the WAF token refresh are not failures.
    if (url.endsWith('/t') || url.includes('awswaf.com') || req.failure()?.errorText === 'net::ERR_ABORTED') return
    errors.push(`request failed: ${req.method()} ${url} (${req.failure()?.errorText})`)
  })
  return () => errors
}

/** Page wider than the viewport (horizontal scroll). */
export async function horizontalOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const out: string[] = []
    if (document.documentElement.scrollWidth > vw + 1) out.push(`page is ${document.documentElement.scrollWidth}px wide in a ${vw}px viewport`)
    if (out.length) {
      for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.right <= vw + 1) continue
        const style = getComputedStyle(el)
        if (style.position === 'fixed' || style.visibility === 'hidden') continue
        // Only the outermost culprit.
        if (el.parentElement && el.parentElement.getBoundingClientRect().right > vw + 1) continue
        out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : ''} reaches ${Math.round(r.right)}px`)
        if (out.length > 6) break
      }
    }
    return out
  })
}

/**
 * Text cut off by its box (overflow hidden/clip without an ellipsis), and
 * controls that sit on top of each other. Visually hidden helpers (1 px,
 * clip) and decorative layers are left out.
 */
export async function clippedOrOverlapping(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const name = (el: Element) => {
      const label = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40)
      return `${el.tagName.toLowerCase()} "${label}"`
    }
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.opacity !== '0' && !el.closest('[aria-hidden="true"], [inert]')
    }
    // Clipped text: a text element whose content is wider/taller than its box while overflow cuts it.
    for (const el of document.body.querySelectorAll<HTMLElement>('h1, h2, h3, h4, p, a, button, label, li, span, td, th')) {
      if (!visible(el) || el.children.length > 0 && el.innerText.trim() === '') continue
      const s = getComputedStyle(el)
      const cuts = /(hidden|clip)/.test(s.overflowX + s.overflowY)
      // Deliberate truncation (ellipsis, line clamp) and visually hidden helpers are fine.
      if (!cuts || s.textOverflow === 'ellipsis' || (s as unknown as { webkitLineClamp: string }).webkitLineClamp !== 'none' || s.clip !== 'auto' || s.clipPath !== 'none') continue
      if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 4) {
        if (el.getBoundingClientRect().width <= 2) continue
        out.push(`clipped: ${name(el)} (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`)
      }
    }
    // Overlapping controls: two separate clickable things whose boxes cover each other.
    const controls = [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [role="button"], [role="combobox"]')]
      .filter(visible)
      .filter((el) => getComputedStyle(el).position !== 'fixed' && !el.closest('canvas, svg, .leaflet-container, [data-floorplan], [class*="floorplan"], [class*="Floorplan"]'))
    const boxes = controls.map((el) => ({ el, r: el.getBoundingClientRect() }))
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
        if (w <= 4 || h <= 4) continue
        const smaller = Math.min(a.r.width * a.r.height, b.r.width * b.r.height)
        if ((w * h) / smaller > 0.25) out.push(`overlap: ${name(a.el)} and ${name(b.el)}`)
        if (out.length > 12) return out
      }
    }
    return out
  })
}

/** Interactive elements smaller than min px (inline links inside text are exempt, as in WCAG 2.5.5). */
export async function smallTouchTargets(page: Page, min = 44): Promise<string[]> {
  return page.evaluate((min) => {
    const out: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="combobox"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"]')) {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      if (r.width < 2 || r.height < 2 || s.visibility === 'hidden' || el.closest('[aria-hidden="true"], [inert]')) continue
      if (el.tagName === 'A' && s.display === 'inline' && el.parentElement && /^(P|LI|SPAN|SMALL|TD|DD|LABEL|EM|STRONG|FIGCAPTION|BLOCKQUOTE)$/.test(el.parentElement.tagName)) continue
      // A third-party map (Leaflet) has its own controls; the site's own links to the map are checked.
      if (el.closest('.leaflet-container')) continue
      // A checkbox or radio with its label: the label is the target.
      const input = el as HTMLInputElement
      if ((input.type === 'checkbox' || input.type === 'radio') && input.labels?.length) {
        const lr = input.labels[0].getBoundingClientRect()
        if (Math.max(lr.height, r.height) >= min) continue
      }
      if (r.width >= min && r.height >= min) continue
      // The target may be bigger than the element (a ::before hit area): ask the page what is hit 21px out.
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
      const c = el.getBoundingClientRect()
      const cx = c.left + c.width / 2
      const cy = c.top + c.height / 2
      const reach = [
        [cx - min / 2 + 1, cy],
        [cx + min / 2 - 1, cy],
        [cx, cy - min / 2 + 1],
        [cx, cy + min / 2 - 1],
      ]
      const hits = reach.every(([x, y]) => {
        const hit = document.elementFromPoint(x, y)
        return hit && (hit === el || el.contains(hit))
      })
      if (hits || (r.width >= min && r.height >= min)) continue
      const label = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.id || '').trim().replace(/\s+/g, ' ').slice(0, 40)
      out.push(`${el.tagName.toLowerCase()} "${label}" ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    return out
  }, min)
}
