import { describe, expect, it, vi } from 'vitest'
import { placeholderAvailability, placeholderFetch } from '.'
import { HOURS } from './site'

const API = 'https://api.test'
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const missing = () => new Response(JSON.stringify({ error: 'not found' }), { status: 404 })

function realApi(routes: Record<string, () => Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input).replace(API, '').split('?')[0]
    return (routes[url] ?? missing)()
  }) as unknown as typeof fetch
}

describe('exempeldata i dev', () => {
  it('ger en plats och öppettider bara när Booqy saknar dem', async () => {
    const real = realApi({
      '/site-config': () => ok({ tenant: {}, locations: [{ locationId: 'l1', name: 'Riktig', businessHours: { monday: [] } }] }),
    })
    const cfg = await (await placeholderFetch(real, [API])(`${API}/site-config?slug=x`)).json()
    expect(cfg.locations).toHaveLength(1)
    expect(cfg.locations[0].name).toBe('Riktig')
    expect(cfg.locations[0].businessHours).toEqual(HOURS)

    const filled = { monday: [{ opensAt: '10:00', closesAt: '14:00' }] }
    const real2 = realApi({ '/site-config': () => ok({ locations: [{ locationId: 'l1', businessHours: filled }] }) })
    const cfg2 = await (await placeholderFetch(real2, [API])(`${API}/site-config`)).json()
    expect(cfg2.locations[0].businessHours).toEqual(filled)

    const real3 = realApi({ '/site-config': () => ok({ locations: [] }) })
    const cfg3 = await (await placeholderFetch(real3, [API])(`${API}/site-config`)).json()
    expect(cfg3.locations[0].locationId).toMatch(/^exempel/)
  })

  it('låter en riktig meny gå före och fyller i en saknad', async () => {
    const real = realApi({ '/locations/l1/menu': () => ok({ items: [{ menuItemId: 'a' }], categories: [] }) })
    const menu = await (await placeholderFetch(real, [API])(`${API}/locations/l1/menu`)).json()
    expect(menu.items).toEqual([{ menuItemId: 'a' }])

    const empty = await (await placeholderFetch(realApi({}), [API])(`${API}/locations/l1/menu`)).json()
    expect(empty.items.length).toBeGreaterThan(10)
  })

  it('exempelbokar bara när platsen saknar planritning', async () => {
    const withTables = realApi({
      '/locations/l1/layout/active': () => ok({ floors: [], elements: [{ type: 'table' }] }),
      '/locations/l1/availability': () => ok({ slots: ['riktig'] }),
    })
    const real = await (await placeholderFetch(withTables, [API])(`${API}/locations/l1/availability?date=2030-01-08&partySize=2`)).json()
    expect(real.slots).toEqual(['riktig'])

    const fake = await (await placeholderFetch(realApi({}), [API])(`${API}/locations/l1/availability?date=2030-01-08&partySize=2`)).json()
    expect(fake.slots.length).toBeGreaterThan(0)
  })

  it('lämnar andra adresser orörda', async () => {
    const real = vi.fn(async () => ok({ x: 1 })) as unknown as typeof fetch
    await placeholderFetch(real, [API])('https://annan.example/site-config')
    expect(real).toHaveBeenCalledWith('https://annan.example/site-config', undefined)
  })

  it('räknar tider inom öppettiderna, inga passerade, borden passar sällskapet', () => {
    // 2030-01-08 är en tisdag: 11:00-21:00, två timmar per bokning
    const a = placeholderAvailability('l1', '2030-01-08', 4, HOURS, 'Europe/Stockholm', { date: '2030-01-01', minutes: 0 })
    expect(a.slots[0].startTime).toBe('11:00')
    expect(a.slots.at(-1)?.endTime).toBe('21:00')
    for (const s of a.slots) for (const t of s.tables) expect(t.seats).toBeGreaterThanOrEqual(4)

    const today = placeholderAvailability('l1', '2030-01-08', 2, HOURS, 'Europe/Stockholm', { date: '2030-01-08', minutes: 15 * 60 })
    expect(today.slots.every((s) => s.startTime > '15:30')).toBe(true)

    // Måndag: stängt
    expect(placeholderAvailability('l1', '2030-01-07', 2, HOURS).slots).toEqual([])
  })
})
