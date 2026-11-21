import { expect, test, type Page, type Response } from '@playwright/test'
import { apiGet, guestPost, MARKER, TEST_NAME, testEmail, testPhone } from '../lib/api'
import { internalLinks, open, settle, sitePaths, watchErrors } from '../lib/pages'
import { CONFIGURED, NOT_CONFIGURED, SITE_URL, siteConfig } from '../lib/site'
import { site } from '../site.config'

/**
 * End-to-end flows on the deployed dev site, as a guest uses them: every
 * page, the header navigation, booking a table, ordering for pickup, the
 * contact and parking pages, the language switch and the manage-booking
 * page. Runs at 1440 (e2e-desktop) and on a 390 px touch phone (e2e-phone).
 *
 * In dev, a restaurant that has not entered its own data in Booqy Admin
 * shows example data (README, "Example data in dev"); a booking on the
 * example floor plan is never sent to Booqy. When the restaurant has a real
 * floor plan the booking is real: the test then cancels it at once.
 */

test.skip(!CONFIGURED, NOT_CONFIGURED)

const paths = CONFIGURED ? await sitePaths() : []
const cfg = CONFIGURED ? await siteConfig() : null
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768

for (const path of paths) {
  test(`page ${path} renders without errors`, async ({ page }) => {
    const errors = watchErrors(page)
    await open(page, path)
    await expect(page).toHaveTitle(/\S/)
    await expect(page.locator('main, [role="main"]').first()).toBeVisible()
    // An error the guest can't act on is never shown on a page load.
    await expect(page.getByText(/Booqys fel|Something went wrong|undefined|NaN|\[object Object\]/)).toHaveCount(0)
    expect(errors(), `errors on ${path}`).toEqual([])
  })
}

test('every page the site links to is in the suite', async ({ page }) => {
  const seen = new Set<string>()
  for (const path of ['/', ...(site.contactPath ? [site.contactPath] : [])]) {
    await open(page, path)
    for (const link of await internalLinks(page)) seen.add(link)
  }
  const untested = [...seen].filter((p) => !paths.includes(p) && !/^\/(bokning|bestallning|catering)\//.test(p))
  expect(untested, 'linked pages missing from site.config.ts pages').toEqual([])
})

test('header navigation reaches every page', async ({ page }) => {
  await open(page, '/')
  const header = page.locator('header').first()
  const menuButton = header.getByRole('button', { name: /meny|menu/i }).first()
  // On a phone with a burger: the menu it opens (aria-controls); otherwise the header's links.
  const links = async () => {
    if (isPhone(page) && (await menuButton.isVisible())) {
      const drawer = await menuButton.getAttribute('aria-controls')
      if (drawer) {
        if ((await menuButton.getAttribute('aria-expanded')) !== 'true') await menuButton.click()
        return page.locator(`#${drawer} a[href^="/"]:visible`)
      }
    }
    return page.locator('header a[href^="/"]:visible')
  }
  const all = await links()
  const count = await all.count()
  expect(count, 'visible navigation links').toBeGreaterThan(1)
  const targets = new Set<string>()
  for (let i = 0; i < count; i++) targets.add((await all.nth(i).getAttribute('href')) ?? '/')
  for (const href of targets) {
    await (await links()).and(page.locator(`a[href="${href}"]`)).first().click()
    await expect(page).toHaveURL(new RegExp(`${href === '/' ? '/$' : href.replace(/[/]/g, '\\/')}$`))
    await expect(page.locator('h1').first()).toBeVisible()
    if (isPhone(page) && (await menuButton.isVisible())) {
      // The phone menu closes after a pick.
      await expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    }
  }
})

test('book a table end to end', async ({ page }) => {
  test.skip(!cfg?.tenant.features.reservations, 'bookings are not in the plan')
  const errors = watchErrors(page)
  // A real booking (the restaurant has a floor plan) is caught here and cancelled after.
  let real: { locationId: string; reservationId: string; token: string } | null = null
  page.on('response', async (res: Response) => {
    if (res.request().method() !== 'POST' || !/\/locations\/[^/]+\/reservations$/.test(new URL(res.url()).pathname) || !res.ok()) return
    const body = (await res.json().catch(() => null)) as { reservationId?: string; manageToken?: string } | null
    const locationId = new URL(res.url()).pathname.split('/').at(-2) ?? ''
    if (body?.reservationId && body.manageToken) real = { locationId, reservationId: body.reservationId, token: body.manageToken }
  })
  try {
    await open(page, '/boka-bord')
    const main = page.locator('main')
    // Day after tomorrow, the latest time (clear of today's cut-offs), the first free table.
    await main.getByRole('group', { name: /datum/i }).getByRole('button').nth(2).click()
    const times = main.getByRole('group', { name: 'Välj tid' }).getByRole('button')
    await expect(times.first()).toBeVisible()
    await times.last().click()
    const free = main.getByRole('group', { name: 'Lediga bord' }).getByRole('button')
    await expect(free.first()).toBeVisible()
    await free.first().click()
    await main.getByRole('button', { name: 'Bekräfta bord' }).click()
    // The table is held while the guest fills in the form.
    await expect(main.getByRole('timer')).toBeVisible()
    await main.getByRole('textbox', { name: 'Namn' }).fill(TEST_NAME)
    await main.getByRole('textbox', { name: 'E-post' }).fill(testEmail('flow'))
    await main.getByRole('textbox', { name: 'Telefon' }).fill(testPhone())
    await main.getByRole('textbox', { name: /Meddelande/ }).fill(MARKER)
    // Without the terms the booking can't be sent.
    await main.getByRole('button', { name: 'Boka bordet' }).click()
    await expect(main.getByRole('list', { name: /steg 4 av 5/ })).toBeVisible()
    await main.getByRole('checkbox', { name: /bokningsvillkoren/ }).check()
    await main.getByRole('button', { name: 'Boka bordet' }).click()
    await expect(main.getByRole('list', { name: /steg 5 av 5/ })).toBeVisible({ timeout: 20_000 })
    await expect(main.getByText(/bokat|bokningen är|välkommen/i).first()).toBeVisible()
    expect(errors()).toEqual([])
  } finally {
    const booking = real as { locationId: string; reservationId: string; token: string } | null
    if (booking) {
      const res = await guestPost(page, `/locations/${booking.locationId}/reservations/${booking.reservationId}/cancel`, undefined, {
        'X-Manage-Token': booking.token,
      })
      expect([200, 409], `cancel the test booking ${booking.reservationId}`).toContain(res.status())
    } else {
      test.info().annotations.push({ type: 'example data', description: 'booked on the dev example floor plan: nothing was sent to Booqy' })
    }
  }
})

test('order for pickup', async ({ page }) => {
  test.skip(!cfg?.tenant.features.ordering, 'ordering is not in the plan')
  const errors = watchErrors(page)
  await open(page, '/bestall')
  const main = page.locator('main')
  await expect(main.getByRole('heading', { level: 1 })).toContainText(/Beställ/)
  const state = await apiGet(page.request, `/locations/${cfg!.locations[0].locationId}/ordering`)
  const open_ = state.ok() && ((await state.json()) as { open?: boolean }).open
  if (!open_) {
    // Closed or not set up: the guest is told so, with a way to reach the restaurant.
    await expect(main.getByText(/stängt|inte|kunde inte|ring/i).first()).toBeVisible()
    test.info().annotations.push({ type: 'ordering closed', description: `ordering answers ${state.status()} (closed or not set up): the guest message is checked` })
  } else {
    // Add the first dish and go as far as the payment step (the unpaid order expires by itself).
    await main.getByRole('button', { name: /lägg (till|i)/i }).first().click()
    await main.getByRole('button', { name: /till kassan|gå vidare|fortsätt/i }).first().click()
    await main.getByRole('textbox', { name: /namn/i }).fill(TEST_NAME)
    await main.getByRole('textbox', { name: /e-post/i }).fill(testEmail('order-flow'))
    await main.getByRole('textbox', { name: /telefon/i }).fill(testPhone())
    await main.getByRole('checkbox', { name: /villkor/i }).check()
    await main.getByRole('button', { name: /betala|gå vidare|fortsätt/i }).first().click()
    await expect(page.frameLocator('iframe[name^="__privateStripeFrame"]').first().locator('body')).toBeVisible({ timeout: 30_000 })
  }
  expect(errors()).toEqual([])
})

test('contact page', async ({ page }) => {
  test.skip(!site.contactPath, 'the site has no contact page')
  await open(page, site.contactPath!)
  const main = page.locator('main')
  const form = main.locator('form').first()
  if (await form.count()) {
    // Every field has a label; an empty form is not sent.
    const fields = form.locator('input:not([type=hidden]):not([type=checkbox]):not([aria-hidden="true"]), textarea')
    for (let i = 0; i < (await fields.count()); i++) {
      const id = await fields.nth(i).getAttribute('id')
      const labelled = (await fields.nth(i).getAttribute('aria-label')) || (id && (await page.locator(`label[for="${id}"]`).count()))
      expect(labelled, `field ${id} has a label`).toBeTruthy()
    }
    expect(await form.evaluate((f: HTMLFormElement) => f.checkValidity())).toBe(false)
  }
  // A way to reach the restaurant: phone, e-mail or the form.
  await expect(page.locator('a[href^="tel:"], a[href^="mailto:"], form').first()).toBeVisible()
})

test('parking page shows the map and the places', async ({ page }) => {
  test.skip(!site.parkingPath, 'the site has no parking page')
  const errors = watchErrors(page)
  await open(page, site.parkingPath!)
  await expect(page.locator('.leaflet-container, iframe[src*="map"], [aria-label*="karta" i]').first()).toBeVisible()
  await expect(page.locator('main li, main article').first()).toBeVisible()
  expect(errors()).toEqual([])
})

test('language switch', async ({ page }) => {
  test.skip(!site.language, 'the site has one language')
  const lang = site.language!
  await open(page, '/')
  const pick = async (option: string | RegExp) => {
    const menuButton = page.locator('header').getByRole('button', { name: /meny|menu|منو/i }).first()
    if (isPhone(page) && !(await page.locator(lang.trigger).isVisible()) && (await menuButton.isVisible())) await menuButton.click()
    await page.locator(lang.trigger).click()
    await page.getByRole('option', { name: option }).click()
  }
  await pick(lang.option)
  await expect(page.locator('html')).toHaveAttribute('lang', lang.expectLang)
  await expect(page.getByText(lang.expectText).first()).toBeAttached()
  // The choice survives a reload.
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', lang.expectLang)
  await pick(/Svenska/)
  await expect(page.locator('html')).toHaveAttribute('lang', /^sv/)
})

test('manage-booking page: broken and unknown links tell the guest what to do', async ({ page }) => {
  const errors = watchErrors(page)
  const loc = cfg!.locations[0].locationId
  await page.goto(`${SITE_URL}/bokning/${loc}/01aaaaaaaaaaaaaaaaaaaaaaaa`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/bokning/i)
  await expect(page.locator('main').getByText(/länken|bekräftelse/i).first()).toBeVisible()
  await page.goto(`${SITE_URL}/bokning/${loc}/01aaaaaaaaaaaaaaaaaaaaaaaa#${'x'.repeat(32)}`)
  await settle(page)
  await expect(page.locator('main').getByText(/hittades inte|länken|ring/i).first()).toBeVisible()
  expect(errors()).toEqual([])
})
