/**
 * This site's own knobs for the shared test suite. The specs are the same in
 * every site repo (they come from site-template); only this file differs.
 * A new site edits it when its pages differ from the template's.
 */
export const site = {
  /**
   * The site's own pages. The kit's flows (booking, order, catering, gift
   * cards, events, legal) are added from the plan in site-config. A test
   * fails when the site links to a page missing from this list.
   */
  pages: ['/', '/meny', '/om-oss', '/kontakt'],
  /** The page with the contact form or details, and the parking page (null when the site has none). */
  contactPath: '/kontakt' as string | null,
  parkingPath: null as string | null,
  /** Light and dark mode with a toggle (booqy-theme): the template has both. */
  themes: ['light', 'dark'] as ('light' | 'dark')[],
  /** The language switch: site-kit's picker in the top bar (sv, en, es, ar, fa). */
  language: {
    /** The branded dropdown's trigger. */
    trigger: '.site-header-lang button',
    /** Option to pick, and text that then shows in the header. */
    option: 'English',
    expectText: /Contact/,
    expectLang: 'en',
  } as { trigger: string; option: string; expectText: RegExp; expectLang: string } | null,
  /** Parts of pages that change from run to run (masked in screenshots). */
  visualMasks: [] as string[],
  /** Decorative layers hidden in screenshots (big photos that say nothing about the layout). */
  visualHide: [] as string[],
  /** Budgets on the dev site (Core Web Vitals "good" thresholds). */
  budgets: { lcpMs: 2500, cls: 0.1 },
}
