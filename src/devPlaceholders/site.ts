import menu from './menu.json'

/**
 * Den här sajtens exempeldata för dev (se README.md, "Exempeldata i dev").
 * Byt innehållet per restaurang; formen är Booqys (GET /site-config,
 * GET /locations/{id}/menu). Allt annat i mappen är samma för alla sajter.
 */

export type Interval = { opensAt: string; closesAt: string }
export type Hours = Partial<Record<Weekday, Interval[]>>
export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

const day = (opensAt: string, closesAt: string): Interval[] => [{ opensAt, closesAt }]

/** Öppettider när platsen saknar egna (alla dagar tomma). */
export const HOURS: Hours = {
  monday: [],
  tuesday: day('11:00', '21:00'),
  wednesday: day('11:00', '21:00'),
  thursday: day('11:00', '21:00'),
  friday: day('11:00', '22:00'),
  saturday: day('12:00', '22:00'),
  sunday: [],
}

/** Platsen när restaurangen inte har lagt in någon än. */
export const LOCATION = {
  name: 'Exempelrestaurangen',
  address: 'Storgatan 1, 111 22 Stockholm',
  phoneNumber: '+46812345678',
  email: 'info@exempel.se',
}

/** Menyn när platsen saknar en (i Booqys form). */
export const MENU: { items: unknown[]; categories: unknown[] } = menu
