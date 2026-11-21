import { HOURS, LOCATION, MENU } from './site'
import type { Hours, Interval, Weekday } from './site'

/**
 * Exempeldata i dev (se README.md, "Exempeldata i dev").
 *
 * Bara dev-bygget har den här modulen: main.tsx laddar den när
 * VITE_BOOQY_PLACEHOLDERS är "true", vilket vite.config.ts bara sätter för
 * BOOQY_ENV=dev. I prod- och testbyggena är villkoret en konstant och
 * modulen kommer aldrig med (bundle.test.ts bygger prod och kontrollerar det).
 *
 * Den lägger sig framför fetch mot Booqys API och fyller bara i det
 * restaurangen inte har lagt in än; riktiga data går alltid före:
 * - /site-config: en plats när det inte finns någon, öppettider när platsens
 *   alla dagar är tomma
 * - /locations/{id}/menu: menyn när platsen saknar en (404 eller tom)
 * - /locations/{id}/layout/active: en planritning när platsen saknar en, och
 *   då också lediga tider, hållna bord och bokningar (inget skrivs till Booqy)
 */

export const PLACEHOLDER_MARKER = 'booqy-dev-placeholder-data'

const DAYS: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const FAKE_ID = 'exempel'
const BOOKING_HOURS = 2

type Fetch = typeof fetch
type Json = Record<string, unknown>
type Location = Json & { locationId: string; businessHours?: Hours; bookingDurationHours?: number }
type Table = { elementId: string; seats: number }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function hasHours(hours: Hours | undefined): boolean {
  return Boolean(hours && Object.values(hours).some((d) => d && d.length > 0))
}

/** Restaurangens bord (meter, x/z-planet), en matsal med fönster mot gatan. */
export function placeholderLayout() {
  const wall = (id: string, x: number, z: number, width: number, rotationY: number) => ({
    elementId: id, type: 'wall', x, y: 0, z, width, height: 2.6, depth: 0.2, rotationY, floorId: 'matsal',
  })
  const table = (n: number, x: number, z: number, seats: number, shape: 'rect' | 'round' = 'rect') => {
    const w = shape === 'round' ? 1.1 : seats <= 2 ? 0.8 : seats <= 4 ? 1.2 : 1.9
    return {
      elementId: `${FAKE_ID}-bord-${n}`, type: 'table', x, y: 0, z, width: w, height: 0.75,
      depth: shape === 'round' ? 1.1 : 0.8, rotationY: 0, shape, seats, zone: 'Matsal', label: String(n), floorId: 'matsal',
    }
  }
  return {
    floors: [{ floorId: 'matsal', name: 'Matsal', level: 0 }],
    elements: [
      wall('v-n', 6, 0, 12, 0),
      wall('v-s', 6, 8, 12, 0),
      wall('v-v', 0, 4, 8, 90),
      wall('v-o', 12, 4, 8, 90),
      { elementId: 'dorr', type: 'door', wallId: 'v-s', x: 10.5, y: 0, z: 8, width: 1.2, height: 2.1, depth: 0.2, rotationY: 0, floorId: 'matsal' },
      { elementId: 'fonster-1', type: 'window', wallId: 'v-n', x: 3, y: 1, z: 0, width: 2.4, height: 1.4, depth: 0.2, rotationY: 0, floorId: 'matsal' },
      { elementId: 'fonster-2', type: 'window', wallId: 'v-n', x: 9, y: 1, z: 0, width: 2.4, height: 1.4, depth: 0.2, rotationY: 0, floorId: 'matsal' },
      table(1, 1.6, 1.5, 2),
      table(2, 3.6, 1.5, 2),
      table(3, 6, 1.5, 4),
      table(4, 8.6, 1.5, 4),
      table(5, 10.6, 1.5, 2),
      table(6, 2.2, 4.2, 6),
      table(7, 6, 4.2, 4, 'round'),
      table(8, 9.6, 4.2, 6),
      table(9, 1.6, 6.6, 2),
      table(10, 4.2, 6.6, 4),
      table(11, 7, 6.6, 8),
    ],
  }
}

function tables(): Table[] {
  return placeholderLayout().elements.filter((e) => e.type === 'table') as unknown as Table[]
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Samma "slump" för samma dag, tid och bord, så att bokade bord ligger kvar. */
function booked(date: string, time: string, tableId: string): boolean {
  let h = 0
  for (const c of `${date}${time}${tableId}`) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h % 4 === 0
}

/** Klockan just nu i restaurangens tidszon. */
function nowIn(timezone: string): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

/** Lediga tider var 30:e minut inom öppettiderna, med borden som passar sällskapet. */
export function placeholderAvailability(
  locationId: string, date: string, partySize: number, hours: Hours, timezone = 'Europe/Stockholm', now = nowIn(timezone),
) {
  const weekday = DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]
  const intervals: Interval[] = hours[weekday] ?? []
  const duration = BOOKING_HOURS * 60
  const slots = []
  for (const { opensAt, closesAt } of intervals) {
    for (let m = toMin(opensAt); m + duration <= toMin(closesAt); m += 30) {
      if (date < now.date || (date === now.date && m <= now.minutes + 30)) continue
      const time = toTime(m)
      const fits: Table[] = []
      const unavailable = []
      for (const t of tables()) {
        const minParty = Math.max(1, t.seats - 3)
        if (partySize > t.seats) unavailable.push({ tableId: t.elementId, reason: 'too_small', minParty, maxParty: t.seats })
        else if (partySize < minParty) unavailable.push({ tableId: t.elementId, reason: 'too_large', minParty, maxParty: t.seats })
        else if (booked(date, time, t.elementId)) unavailable.push({ tableId: t.elementId, reason: 'booked' })
        else fits.push(t)
      }
      if (!fits.length) continue
      fits.sort((a, b) => a.seats - b.seats)
      slots.push({
        startTime: time,
        endTime: toTime(m + duration),
        layoutVersion: null,
        tables: fits.map((t) => ({ tableId: t.elementId, seats: t.seats })),
        options: fits.map((t) => ({ tableIds: [t.elementId], seats: t.seats })),
        unavailable,
        durationMinutes: duration,
        extendable: true,
        ruleName: null,
      })
    }
  }
  return { locationId, date, timezone, slots }
}

function bodyOf(init?: RequestInit): Json {
  try {
    return typeof init?.body === 'string' ? (JSON.parse(init.body) as Json) : {}
  } catch {
    return {}
  }
}

function addMinutes(time: string, minutes: number) {
  return toTime(toMin(time) + minutes)
}

/**
 * fetch med exempeldata framför Booqys API. `apiBases` är API:ts adresser
 * (bas-URL:en och sajtens /api); allt annat går rakt igenom.
 */
export function placeholderFetch(realFetch: Fetch, apiBases: string[]): Fetch {
  const locations = new Map<string, Location>()
  const realLayout = new Map<string, Promise<boolean>>()
  let announced = false

  const announce = (what: string) => {
    if (announced) return
    announced = true
    console.info(`[${PLACEHOLDER_MARKER}] Exempeldata i dev: ${what} saknas i Booqy och visas med exempel. Prod visar aldrig exempel.`)
  }

  const get = async (path: string): Promise<Response | null> => {
    const base = apiBases[0]
    try {
      return await realFetch(`${base}${path}`, { headers: { Accept: 'application/json' }, credentials: 'omit' })
    } catch {
      return null
    }
  }

  /** Har platsen en riktig planritning med bord? Annars är bokningen exempel. */
  const hasRealLayout = (locationId: string): Promise<boolean> => {
    if (locationId.startsWith(FAKE_ID)) return Promise.resolve(false)
    let known = realLayout.get(locationId)
    if (!known) {
      known = get(`/locations/${encodeURIComponent(locationId)}/layout/active`).then(async (res) => {
        if (!res?.ok) return res?.status === 404 ? false : true
        const layout = (await res.json().catch(() => ({}))) as { elements?: { type?: string }[] }
        return (layout.elements ?? []).some((e) => e.type === 'table')
      })
      realLayout.set(locationId, known)
    }
    return known
  }

  const hoursOf = (locationId: string): Hours => {
    const loc = locations.get(locationId)
    return hasHours(loc?.businessHours) ? (loc!.businessHours as Hours) : HOURS
  }

  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const base = apiBases.find((b) => b && url.startsWith(b))
    if (!base) return realFetch(input, init)
    const path = url.slice(base.length)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const pass = () => realFetch(input, init)
    const [route] = path.split('?')
    const query = new URLSearchParams(path.split('?')[1] ?? '')
    const m = route.match(/^\/locations\/([^/]+)\/(.+)$/)
    const locationId = m ? decodeURIComponent(m[1]) : ''
    const rest = m?.[2] ?? ''

    if (method === 'GET' && route === '/site-config') {
      const res = await pass()
      if (!res.ok) return res
      const cfg = (await res.clone().json()) as Json & { locations?: Location[] }
      if (!cfg.locations?.length) {
        cfg.locations = [{
          locationId: `${FAKE_ID}-plats`, ...LOCATION, timezone: 'Europe/Stockholm', businessHours: HOURS,
          bookingDurationHours: BOOKING_HOURS, maxPartySizeOnline: 8, gracePeriodMinutes: 15, specialDays: [],
          ordering: null, catering: false, guarantee: null,
        }]
        announce('platsen')
      }
      for (const loc of cfg.locations) {
        if (!hasHours(loc.businessHours)) {
          loc.businessHours = HOURS
          announce('öppettiderna')
        }
        locations.set(loc.locationId, loc)
      }
      return json(cfg)
    }

    if (!m) return pass()

    if (method === 'GET' && rest === 'menu') {
      const res = locationId.startsWith(FAKE_ID) ? null : await pass().catch(() => null)
      if (res?.ok) {
        const menu = (await res.clone().json().catch(() => ({}))) as { items?: unknown[] }
        if (menu.items?.length) return res
      } else if (res && res.status !== 404) {
        return res
      }
      announce('menyn')
      return json(MENU)
    }

    if (method === 'GET' && rest === 'layout/active') {
      if (await hasRealLayout(locationId)) return pass()
      announce('planritningen')
      return json(placeholderLayout())
    }

    const fakeBooking = /^(availability|holds|holds\/.+|reservations|reservations\/.+)$/.test(rest)
    if (!fakeBooking || (await hasRealLayout(locationId))) return pass()

    if (method === 'GET' && rest === 'availability') {
      const date = query.get('date') ?? ''
      const party = Number(query.get('partySize') ?? 2)
      return json(placeholderAvailability(locationId, date, party, hoursOf(locationId)))
    }
    if (method === 'POST' && rest === 'holds') {
      const b = bodyOf(init) as { date?: string; startTime?: string; tableIds?: string[]; partySize?: number }
      const start = b.startTime ?? '18:00'
      return json({
        holdId: `${FAKE_ID}-hall-${Date.now()}`, manageToken: `${FAKE_ID}-token`,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), holdMinutes: 15,
        date: b.date, startTime: start, endTime: addMinutes(start, BOOKING_HOURS * 60), tableIds: b.tableIds ?? [],
        partySize: b.partySize ?? 2, cardRequired: false, durationMinutes: BOOKING_HOURS * 60, extendable: true, ruleName: null,
      }, 201)
    }
    if (method === 'DELETE' && rest.startsWith('holds/')) return new Response(null, { status: 204 })
    if (method === 'POST' && rest === 'reservations') {
      const b = bodyOf(init) as { date?: string; startTime?: string; tableIds?: string[]; partySize?: number; name?: string }
      const start = b.startTime ?? '18:00'
      const loc = locations.get(locationId)
      return json({
        reservationId: `${FAKE_ID}-bokning`, status: 'confirmed', date: b.date, startTime: start,
        endTime: addMinutes(start, BOOKING_HOURS * 60), timezone: 'Europe/Stockholm', partySize: b.partySize ?? 2,
        tableIds: b.tableIds ?? [], customerName: b.name, cancellable: true, durationMinutes: BOOKING_HOURS * 60,
        extendable: true, ruleName: null, manageToken: `${FAKE_ID}-token`,
        location: loc ? { locationId, name: loc.name, address: loc.address, phoneNumber: loc.phoneNumber, email: loc.email } : undefined,
      }, 201)
    }
    return json({ error: 'Exempelbokningen finns bara i dev och sparas inte.', code: 'not_found' }, 404)
  }
}

/** Startas från main.tsx i dev-bygget. */
export function startPlaceholders(apiBaseUrl: string | undefined): void {
  const bases = [apiBaseUrl ?? '', '/api', `${window.location.origin}/api`].filter(Boolean)
  window.fetch = placeholderFetch(window.fetch.bind(window), [...new Set(bases)])
}
