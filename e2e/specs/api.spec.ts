import { expect, request as playwrightRequest, test, type Page } from '@playwright/test'
import {
  apiGet,
  confirmTestCard,
  expectStatus,
  futureDate,
  guestDelete,
  guestPost,
  isChallenge,
  json,
  MARKER,
  TEST_NAME,
  testEmail,
  testPhone,
  withWafToken,
} from '../lib/api'
import { API_URL, CONFIGURED, LOCAL, NOT_CONFIGURED, SITE_URL, siteConfig, TENANT_ID, testLocationId } from '../lib/site'

/**
 * API integration: every call the site makes to Booqy answers the way the
 * site expects, for this site's dev restaurant, on the dev API.
 *
 * Writes go through the site's /api (AWS WAF) with a real browser token.
 * Everything created carries the test marker (name "E2E Sajttest", notes
 * "booqy-site-e2e <run>") and is undone in afterAll: bookings cancelled,
 * holds released. An unpaid test order expires by itself (TTL); catering
 * requests and gift cards are only checked up to validation, never created,
 * since a guest can't withdraw them and they reach the restaurant.
 *
 * A part the dev restaurant has not set up yet (not public, no floor plan,
 * ordering closed) is skipped with the reason in the report, never failed.
 */

test.skip(!CONFIGURED, NOT_CONFIGURED)
// In order, in one worker (one browser token), and the rest still runs after a failure.
test.describe.configure({ mode: 'default' })

type Slot = { startTime: string; tables?: { tableId: string }[]; options?: { tableIds: string[] }[] }
type Hold = { holdId: string; manageToken: string; tableIds: string[]; cardRequired: boolean; startTime: string; date: string }
type Reservation = {
  reservationId: string
  status: string
  manageToken?: string
  setup?: { clientSecret: string; stripeAccount: string }
  cancellable: boolean
}

/** A booking that holds its table (the API says reserved). */
const BOOKED = ['reserved', 'confirmed']

let page: Page
let locationId = ''
let isPublic = false
const created: { reservationId: string; token: string }[] = []
const holds: { holdId: string; token: string }[] = []

const loc = (rest = '') => `/locations/${encodeURIComponent(locationId)}${rest}`

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  locationId = await testLocationId()
  const res = await apiGet(page.request, loc('/public-info'))
  isPublic = res.status() === 200
})

test.afterAll(async () => {
  // Undo everything this run made, whatever failed on the way.
  for (const r of created) {
    const res = await guestPost(page, loc(`/reservations/${r.reservationId}/cancel`), undefined, { 'X-Manage-Token': r.token }).catch(() => null)
    if (res && ![200, 409].includes(res.status())) console.warn(`cleanup: cancel ${r.reservationId} answered ${res.status()}`)
  }
  for (const h of holds) await guestDelete(page, loc(`/holds/${h.holdId}`), { 'X-Manage-Token': h.token }).catch(() => null)
  await page.close()
})

const notPublic = () =>
  `location ${locationId} is not public on dev yet (the restaurant has not finished its setup in Admin); ` +
  'set SITE_TEST_LOCATION_ID to a dev test restaurant to run the write tests meanwhile'

test('site-config describes this restaurant', async ({ request }) => {
  const res = await apiGet(request, `/site-config?tenantId=${TENANT_ID}`)
  await expectStatus(res, 200)
  const cfg = await json<Awaited<ReturnType<typeof siteConfig>>>(res)
  expect(cfg.tenant.tenantId).toBe(TENANT_ID)
  expect(cfg.tenant.name).toBeTruthy()
  for (const f of ['reservations', 'ordering', 'catering', 'giftCards', 'waitlist', 'events']) {
    expect(typeof cfg.tenant.features[f], `features.${f}`).toBe('boolean')
  }
  expect(cfg.locations.length, 'at least one location').toBeGreaterThan(0)
  for (const l of cfg.locations) {
    expect(l.locationId).toMatch(/^[0-9a-z]{26}$/)
    expect(l.name).toBeTruthy()
  }
  // Dev never carries a live Stripe key.
  if (cfg.stripe?.publishableKey) expect(cfg.stripe.publishableKey).toMatch(/^pk_test_/)
  expect(cfg.botCheck?.integrationUrl, 'AWS WAF integration URL').toMatch(/^https:\/\/.+\.awswaf\.com\//)
  expect(cfg.privacy, 'privacy notice').toBeTruthy()
})

test('the slug answers with the same restaurant', async ({ request }) => {
  const cfg = await siteConfig()
  const res = await apiGet(request, `/site-config?slug=${encodeURIComponent(cfg.tenant.slug)}`)
  await expectStatus(res, 200)
  expect((await json<{ tenant: { tenantId: string } }>(res)).tenant.tenantId).toBe(TENANT_ID)
})

test('public reads answer as the site expects', async ({ request }) => {
  const own = (await siteConfig()).locations[0].locationId
  const at = (rest: string) => `/locations/${encodeURIComponent(own)}${rest}`
  const info = await apiGet(request, at('/public-info'))
  await expectStatus(info, 200, 404)
  if (info.status() === 404) {
    test.info().annotations.push({ type: 'not public yet', description: `location ${own}: public routes answer 404 until the restaurant's setup is done` })
    expect((await json<{ code?: string }>(info)).code).toBe('location_not_found')
    return
  }
  const body = await json<{ locationId: string; businessHours: object }>(info)
  expect(body.locationId).toBe(own)
  expect(body.businessHours).toBeTruthy()
  const menu = await apiGet(request, at('/menu'))
  await expectStatus(menu, 200, 404)
  if (menu.ok()) expect(Array.isArray((await json<{ items: unknown[] }>(menu)).items)).toBe(true)
  const layout = await apiGet(request, at('/layout/active'))
  await expectStatus(layout, 200, 404)
  const avail = await apiGet(request, at(`/availability?date=${futureDate(3)}&partySize=2`))
  await expectStatus(avail, 200)
  expect(Array.isArray((await json<{ slots: unknown[] }>(avail)).slots)).toBe(true)
})

test('AWS WAF challenges a write without a browser token', async () => {
  test.skip(LOCAL, 'a local build has no /api (AWS WAF runs on the deployed site)')
  const bare = await playwrightRequest.newContext()
  const res = await bare.post(`${SITE_URL}/api${loc('/holds')}`, { data: {} })
  expect(isChallenge(res), `expected the WAF challenge (202), got ${res.status()}`).toBe(true)
  await bare.dispose()
})

test('a write with the browser token reaches the API', async () => {
  test.skip(LOCAL, 'a local build has no /api (AWS WAF runs on the deployed site)')
  await withWafToken(page)
  const res = await guestPost(page, loc('/holds'), {})
  expect(isChallenge(res), 'still challenged with a token').toBe(false)
  // Reached the application: an empty hold is refused there (or the location is not public).
  await expectStatus(res, 400, 404)
})

async function firstFreeSlot(partySize: number): Promise<{ date: string; startTime: string; tableIds: string[] } | null> {
  for (let day = 2; day <= 9; day++) {
    const date = futureDate(day)
    const res = await apiGet(page.request, loc(`/availability?date=${date}&partySize=${partySize}`))
    if (!res.ok()) continue
    const { slots } = await json<{ slots: Slot[] }>(res)
    for (const slot of slots.reverse()) {
      const option = slot.options?.[0]?.tableIds ?? (slot.tables?.[0] ? [slot.tables[0].tableId] : undefined)
      if (option?.length) return { date, startTime: slot.startTime, tableIds: option }
    }
  }
  return null
}

test.describe('booking', () => {
  test('hold a table and release it', async () => {
    test.skip(!isPublic, notPublic())
    const slot = await firstFreeSlot(2)
    test.skip(!slot, `no free table for 2 in the next 9 days at ${locationId}`)
    const res = await guestPost(page, loc('/holds'), { ...slot, partySize: 2 })
    await expectStatus(res, 201, 200)
    const hold = await json<Hold>(res)
    holds.push({ holdId: hold.holdId, token: hold.manageToken })
    expect(hold.tableIds).toEqual(slot!.tableIds)
    expect(hold.manageToken).toBeTruthy()
    const released = await guestDelete(page, loc(`/holds/${hold.holdId}`), { 'X-Manage-Token': hold.manageToken })
    await expectStatus(released, 200, 204)
    holds.pop()
  })

  test('book, open the manage link, cancel (card step in Stripe test mode when required)', async () => {
    test.skip(!isPublic, notPublic())
    const slot = await firstFreeSlot(2)
    test.skip(!slot, `no free table for 2 in the next 9 days at ${locationId}`)
    const holdRes = await guestPost(page, loc('/holds'), { ...slot, partySize: 2 })
    await expectStatus(holdRes, 201, 200)
    const hold = await json<Hold>(holdRes)
    holds.push({ holdId: hold.holdId, token: hold.manageToken })

    const res = await guestPost(
      page,
      loc('/reservations'),
      {
        ...slot,
        partySize: 2,
        holdId: hold.holdId,
        name: TEST_NAME,
        email: testEmail('booking'),
        phone: testPhone(),
        notes: MARKER,
        language: 'sv',
        acceptTerms: true,
      },
      { 'X-Manage-Token': hold.manageToken },
    )
    await expectStatus(res, 201, 200)
    const booking = await json<Reservation>(res)
    const token = booking.manageToken ?? hold.manageToken
    created.push({ reservationId: booking.reservationId, token })
    holds.pop() // the booking took the hold over

    if (hold.cardRequired) {
      expect(booking.status).toBe('pending')
      expect(booking.setup?.clientSecret, 'card step: SetupIntent').toBeTruthy()
      const key = (await siteConfig()).stripe?.publishableKey ?? ''
      await confirmTestCard(page.request, key, booking.setup!)
      const confirmed = await guestPost(page, loc(`/reservations/${booking.reservationId}/confirm`), undefined, { 'X-Manage-Token': token })
      await expectStatus(confirmed, 200)
      expect(BOOKED).toContain((await json<Reservation>(confirmed)).status)
    } else {
      test.info().annotations.push({ type: 'card step', description: 'not required at this location for 2 guests (no guarantee terms), so not exercised' })
      expect(BOOKED).toContain(booking.status)
    }

    // The manage link (SMS and e-mail) reads the booking with its token only.
    const mine = await apiGet(page.request, loc(`/reservations/${booking.reservationId}/guest`), { 'X-Manage-Token': token })
    await expectStatus(mine, 200)
    const read = await json<Reservation & { customerName?: string }>(mine)
    expect(read.reservationId).toBe(booking.reservationId)
    expect(read.cancellable).toBe(true)
    const wrong = await apiGet(page.request, loc(`/reservations/${booking.reservationId}/guest`), { 'X-Manage-Token': 'not-the-token' })
    expect([401, 403, 404]).toContain(wrong.status())

    const cancel = await guestPost(page, loc(`/reservations/${booking.reservationId}/cancel`), undefined, { 'X-Manage-Token': token })
    await expectStatus(cancel, 200)
    expect((await json<Reservation>(cancel)).status).toMatch(/^cancelled/)
    created.pop()
  })

  test('a booking without accepted terms is refused', async () => {
    test.skip(!isPublic, notPublic())
    const res = await guestPost(page, loc('/reservations'), {
      date: futureDate(3), startTime: '18:00', tableIds: ['x'], partySize: 2,
      name: TEST_NAME, email: testEmail('refused'), phone: testPhone(), notes: MARKER,
    })
    await expectStatus(res, 400)
  })
})

test('the manage link for a booking that does not exist says so', async ({ request }) => {
  const res = await apiGet(request, loc('/reservations/01aaaaaaaaaaaaaaaaaaaaaaaa/guest'), { 'X-Manage-Token': 'x'.repeat(32) })
  expect([401, 403, 404]).toContain(res.status())
})

test.describe('ordering for pickup', () => {
  test('ordering state answers', async ({ request }) => {
    test.skip(!isPublic, notPublic())
    const res = await apiGet(request, loc('/ordering'))
    await expectStatus(res, 200)
    const state = await json<{ open: boolean; pickup?: boolean; reason?: string }>(res)
    expect(typeof state.open).toBe('boolean')
    if (!state.open) expect(state.reason).toBeTruthy()
  })

  test('an empty order is refused', async () => {
    test.skip(!isPublic, notPublic())
    const res = await guestPost(page, '/order', {
      locationId, mode: 'pickup', items: [], name: TEST_NAME, phone: testPhone(), email: testEmail('order'),
      notes: MARKER, language: 'sv', acceptTerms: true, embedded: true,
    })
    await expectStatus(res, 400, 409)
  })

  test('place an order and read its status (left unpaid: it expires by itself)', async ({ request }) => {
    test.skip(!isPublic, notPublic())
    const cfg = await siteConfig()
    test.skip(!cfg.tenant.features.ordering, 'ordering is not in the plan')
    const state = await json<{ open: boolean; reason?: string }>(await apiGet(request, loc('/ordering')))
    test.skip(!state.open, `ordering is closed at ${locationId} (${state.reason})`)
    const menu = await json<{ items: { menuItemId: string; active?: boolean; options?: unknown[] }[] }>(await apiGet(request, loc('/menu')))
    const item = menu.items.find((i) => i.active !== false && !(i.options?.length))
    test.skip(!item, 'no orderable dish without options')
    const res = await guestPost(page, '/order', {
      locationId, mode: 'pickup', items: [{ menuItemId: item!.menuItemId, quantity: 1 }], name: TEST_NAME, phone: testPhone(),
      email: testEmail('order'), notes: MARKER, language: 'sv', acceptTerms: true, embedded: true,
    })
    await expectStatus(res, 201, 200)
    const order = await json<{ orderId: string; statusToken: string; clientSecret?: string; totalAmount: number }>(res)
    expect(order.totalAmount).toBeGreaterThan(0)
    expect(order.clientSecret, 'Stripe payment step').toBeTruthy()
    const status = await apiGet(request, loc(`/order-status/${order.orderId}`), { 'X-Order-Token': order.statusToken })
    await expectStatus(status, 200)
    expect((await json<{ status: string }>(status)).status).toBe('pending_payment')
  })

  test('an order status link with a wrong token is refused', async ({ request }) => {
    const res = await apiGet(request, loc('/order-status/01aaaaaaaaaaaaaaaaaaaaaaaa'), { 'X-Order-Token': 'x'.repeat(32) })
    expect([401, 403, 404]).toContain(res.status())
  })
})

test.describe('catering', () => {
  test('settings, menu and a quote answer', async ({ request }) => {
    test.skip(!isPublic, notPublic())
    test.skip(!(await siteConfig()).tenant.features.catering, 'catering is not in the plan')
    const res = await apiGet(request, loc('/catering/settings'))
    await expectStatus(res, 200, 404)
    test.skip(res.status() === 404, `catering is not set up at ${locationId}`)
    const settings = await json<{ enabled: boolean; minPortions: number; minGuests?: number; pickup: boolean }>(res)
    test.skip(!settings.enabled, `catering is turned off at ${locationId}`)
    const menu = await json<{ dishes: { dishId: string }[]; packages: { packageId: string }[] }>(await apiGet(request, loc('/catering/menu')))
    const guests = Math.max(settings.minPortions, settings.minGuests ?? 0)
    const pick = menu.packages[0]
      ? { packages: [{ packageId: menu.packages[0].packageId, quantity: guests }] }
      : menu.dishes[0]
        ? { dishes: [{ dishId: menu.dishes[0].dishId, quantity: guests }] }
        : null
    test.skip(!pick, 'the catering menu is empty')
    const quote = await page.request.post(`${API_URL}${loc('/catering/quote')}`, {
      data: { guests, fulfilment: 'pickup', ...pick },
    })
    await expectStatus(quote, 200)
    const q = await json<{ lines: unknown[]; portions: number }>(quote)
    expect(q.lines.length).toBeGreaterThan(0)
    expect(q.portions).toBeGreaterThanOrEqual(settings.minPortions)
  })

  test('a catering request without accepted terms is refused (through the WAF)', async () => {
    test.skip(!isPublic, notPublic())
    test.skip(!(await siteConfig()).tenant.features.catering, 'catering is not in the plan')
    const res = await guestPost(page, loc('/catering/requests'), { guests: 10, fulfilment: 'pickup', name: TEST_NAME, notes: MARKER })
    expect(isChallenge(res)).toBe(false)
    // 409 catering_disabled: the route answered, catering is off at this location.
    await expectStatus(res, 400, 404, 409)
  })
})

test.describe('gift cards', () => {
  test('offer and balance answer', async ({ request }) => {
    test.skip(!(await siteConfig()).tenant.features.giftCards, 'gift cards are not in the plan')
    test.skip(!isPublic, notPublic())
    const base = `/public/locations/${encodeURIComponent(locationId)}/gift-cards`
    const offer = await apiGet(request, `${base}/offer`)
    await expectStatus(offer, 200, 404)
    const balance = await guestPost(page, `${base}/balance`, { code: 'AAAA-BBBB-CCCC' })
    expect(isChallenge(balance)).toBe(false)
    await expectStatus(balance, 400, 404)
  })
})
