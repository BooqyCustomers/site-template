import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Which site and API the suite drives. Everything comes from the repo's
 * booqy.json (its `dev` section, written by Booqy) unless an env var says
 * otherwise:
 *
 *   SITE_URL          the deployed site, default booqy.json dev.previewUrl
 *   SITE_API_URL      the Booqy API, default booqy.json dev.apiBaseUrl
 *   SITE_TENANT_ID    default booqy.json dev.tenantId
 *   SITE_TEST_LOCATION_ID  the location the API write tests use, default the
 *                     site's own first location (set it to a dev test
 *                     restaurant while the site's own one is not public yet)
 *
 * Never production: only dev and test hosts are accepted.
 */

type Env = { tenantId?: string; apiBaseUrl?: string; previewUrl?: string; stripePublishableKey?: string }
type BooqyJson = { slug?: string; name?: string; environments?: Record<string, Env> }

const root = resolve(import.meta.dirname, '../..')

export const booqy: BooqyJson = (() => {
  try {
    return JSON.parse(readFileSync(resolve(root, 'booqy.json'), 'utf8')) as BooqyJson
  } catch {
    return {}
  }
})()

const dev = booqy.environments?.dev ?? {}

export const SITE_URL = (process.env.SITE_URL || dev.previewUrl || '').replace(/\/$/, '')
export const API_URL = (process.env.SITE_API_URL || dev.apiBaseUrl || '').replace(/\/$/, '')
export const TENANT_ID = process.env.SITE_TENANT_ID || dev.tenantId || ''
export const SLUG = booqy.slug || ''

/** A local build (vite preview): no /api and no AWS WAF there, the site calls the API directly. */
export const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(SITE_URL)

/** Hosts the suite may write to: dev and test only (the test-sites sandbox lives in the dev account). */
const ALLOWED = [/\.dev\.booqy\.se$/, /\.test-dev\.booqy\.se$/, /\.test\.booqy\.se$/, /^localhost$/, /^127\.0\.0\.1$/]

export function assertNotProd(url: string, kind: 'site' | 'api' = 'site'): void {
  if (!url) return
  const host = new URL(url).hostname
  const prod = booqy.environments?.prod
  const prodHosts = [prod?.previewUrl, prod?.apiBaseUrl].filter(Boolean).map((u) => new URL(u as string).hostname)
  // The API has no dev-looking name (API Gateway); it only must not be prod's.
  const allowed = kind === 'api' || ALLOWED.some((re) => re.test(host))
  if (prodHosts.includes(host) || !allowed) {
    throw new Error(`Refusing to test ${url}: the site suite runs against dev only (<slug>.dev.booqy.se).`)
  }
}

/** Empty in site-template (no restaurant yet): every spec skips itself. */
export const CONFIGURED = Boolean(SITE_URL && API_URL && TENANT_ID)
export const NOT_CONFIGURED = 'No dev restaurant in booqy.json yet (site-template): nothing to test.'

export type Location = {
  locationId: string
  name: string
  phoneNumber?: string | null
  businessHours?: Record<string, { opensAt: string; closesAt: string }[]>
  ordering?: unknown
  catering?: boolean
  waitlist?: { publicJoin?: boolean } | null
}

export type SiteConfig = {
  tenant: { tenantId: string; name: string; slug: string; features: Record<string, boolean> }
  locations: Location[]
  stripe?: { publishableKey?: string | null; accountId?: string | null } | null
  botCheck?: { integrationUrl?: string | null } | null
  legal?: Record<string, unknown>
  privacy?: Record<string, unknown>
}

let cached: Promise<SiteConfig> | null = null

/** GET /site-config straight from the API (a read, no bot check). */
export function siteConfig(): Promise<SiteConfig> {
  cached ??= fetch(`${API_URL}/site-config?tenantId=${encodeURIComponent(TENANT_ID)}`).then(async (res) => {
    if (!res.ok) throw new Error(`site-config answered ${res.status}`)
    return (await res.json()) as SiteConfig
  })
  return cached
}

/** The location the API write tests use (see SITE_TEST_LOCATION_ID). */
export async function testLocationId(): Promise<string> {
  return process.env.SITE_TEST_LOCATION_ID || (await siteConfig()).locations[0]?.locationId || ''
}
