import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'
import { API_URL, LOCAL, SITE_URL } from './site'

/**
 * Guest calls the way the site makes them.
 *
 * Reads go straight to the API (as the site does). Guest form posts
 * (holds, bookings, orders, catering requests, gift cards, waiting list,
 * sign-ups) go to /api on the site's own domain, where AWS WAF lets a write
 * through only with the token its JavaScript integration hands a real
 * browser (cookie aws-waf-token). The tests get that token the supported
 * way: they open the site in Chromium, which runs challenge.js, and then
 * post with the same browser context (page.request shares its cookies).
 * Nothing to configure, no secret, no infrastructure change; it is exactly
 * the path a guest takes.
 */

/** Marker on everything the suite creates (name and notes). */
export const RUN_ID = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}-${Math.random().toString(36).slice(2, 6)}`
export const MARKER = `booqy-site-e2e ${RUN_ID}`
export const TEST_NAME = 'E2E Sajttest'

/** SES mailbox simulator: accepted, delivered nowhere. */
export function testEmail(tag: string): string {
  return `success+site-e2e-${tag}-${RUN_ID}@simulator.amazonses.com`
}

/** PTS range reserved for fiction (070-174 06 05..99); random, since the API allows 5 online bookings per phone a day. */
export function testPhone(): string {
  return `+4670174${String(605 + Math.floor(Math.random() * 95)).padStart(4, '0')}`
}

/** Opens the site so AWS WAF's integration hands this context a token. */
export async function withWafToken(page: Page): Promise<void> {
  await page.goto(`${SITE_URL}/integritetspolicy`)
  await page.waitForFunction(() => Boolean((window as unknown as { AwsWafIntegration?: unknown }).AwsWafIntegration), null, {
    timeout: 20_000,
  })
  await page.evaluate(async () => {
    await (window as unknown as { AwsWafIntegration: { getToken(): Promise<string> } }).AwsWafIntegration.getToken()
  })
}

/** A guest form post through the site's /api (WAF). Retries once when the token needs renewing. */
export async function guestPost(
  page: Page,
  path: string,
  data?: unknown,
  headers: Record<string, string> = {},
): Promise<APIResponse> {
  const send = () => page.request.post(`${LOCAL ? API_URL : `${SITE_URL}/api`}${path}`, { data: data ?? {}, headers: { Accept: 'application/json', ...headers } })
  let res = await send()
  if (isChallenge(res)) {
    await withWafToken(page)
    res = await send()
  }
  return res
}

/** A guest delete through /api (releasing a hold), as the site sends it. */
export function guestDelete(page: Page, path: string, headers: Record<string, string>): Promise<APIResponse> {
  return page.request.delete(`${API_URL}${path}`, { headers: { Accept: 'application/json', ...headers } })
}

/** Plain read against the API, as the site does it. */
export function apiGet(request: APIRequestContext, path: string, headers: Record<string, string> = {}): Promise<APIResponse> {
  return request.get(`${API_URL}${path}`, { headers: { Accept: 'application/json', ...headers } })
}

/** AWS WAF answered with its silent challenge instead of letting the post through. */
export function isChallenge(res: APIResponse): boolean {
  return res.status() === 202 && res.headers()['x-amzn-waf-action'] === 'challenge'
}

export async function json<T = Record<string, unknown>>(res: APIResponse): Promise<T> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${res.url()} answered ${res.status()} with non-JSON: ${text.slice(0, 200)}`)
  }
}

/** Expect a status, with the body in the failure message. */
export async function expectStatus(res: APIResponse, ...ok: number[]): Promise<void> {
  if (!ok.includes(res.status())) {
    expect(ok, `${res.url()} answered ${res.status()}: ${(await res.text()).slice(0, 300)}`).toContain(res.status())
  }
}

/** A day 2..9 days ahead (Stockholm), so "today" cut-offs never matter. */
export function futureDate(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000)
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })
}

/**
 * Confirms a booking's card step in Stripe test mode, as Stripe.js would
 * with the test card 4242 (pm_card_visa). Refuses anything but a test key.
 */
export async function confirmTestCard(
  request: APIRequestContext,
  publishableKey: string,
  setup: { clientSecret: string; stripeAccount: string },
): Promise<void> {
  if (!publishableKey.startsWith('pk_test_')) throw new Error('Stripe card step: only test mode keys (pk_test_) are allowed')
  const intentId = setup.clientSecret.split('_secret_')[0]
  const res = await request.post(`https://api.stripe.com/v1/setup_intents/${intentId}/confirm`, {
    headers: { Authorization: `Bearer ${publishableKey}`, 'Stripe-Account': setup.stripeAccount },
    form: { client_secret: setup.clientSecret, payment_method: 'pm_card_visa' },
  })
  await expectStatus(res, 200)
  expect((await json<{ status: string }>(res)).status).toBe('succeeded')
}
