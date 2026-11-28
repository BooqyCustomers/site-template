// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The header decides what fits by measuring (headerFit.ts); fixed breakpoints
// in the CSS would fight it (hidden tabs at a guessed width, a status cut to
// two lines, a name squeezed to a few letters).
const css = readFileSync(new URL('../site.css', import.meta.url), 'utf8')
const quality = readFileSync(new URL('../quality.css', import.meta.url), 'utf8')

describe('header CSS', () => {
  it('hides no header part by width: the measured fit does it', () => {
    for (const sheet of [css, quality]) {
      expect(sheet).not.toMatch(/\.site-header-nav\s*\{[^}]*display:\s*none/)
      expect(sheet).not.toMatch(/\.site-header-burger\s*\{[^}]*display:\s*none/)
    }
  })

  it('keeps the status, the tabs and the name on one line', () => {
    expect(css).not.toMatch(/line-clamp/)
    expect(css).toMatch(/\.open-chip-text\s*\{\s*white-space: nowrap;/)
    expect(css).toMatch(/\.site-header-nav a\s*\{[^}]*white-space: nowrap;/)
    expect(css).toMatch(/\.site-header-wordmark\s*\{[^}]*white-space: nowrap;/)
  })

  it('keeps a part that does not fit measurable but out of sight', () => {
    expect(css).toMatch(/\.site-header-off\s*\{[^}]*position: absolute !important;[^}]*visibility: hidden !important;/)
  })

  it('lets the row follow the width headerFit.ts gives it', () => {
    expect(css).toMatch(/max-width: var\(--header-pill, var\(--wrap\)\)/)
  })

  it('anchors the hidden status text at the chip end, so right to left gets no sideways scroll', () => {
    const rule = css.match(/\.open-chip \.open-chip-text--short,\s*\.open-chip--short \.open-chip-text--full\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/inset-inline-end: 0;/)
    expect(rule![1]).not.toMatch(/inset-inline-start:\s*0/)
    expect(css).toMatch(/\.site-header-off\s*\{[^}]*inset-inline-end: 0;/)
  })

  it('gives every tab a 44 px hit area whatever the tab height', () => {
    const rule = css.match(/\.site-header-nav a::before\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/height: max\(100%, 44px\);/)
    expect(rule![1]).toMatch(/top: 50%;/)
    expect(rule![1]).toMatch(/transform: translateY\(-50%\);/)
  })

  it('draws a focus outline on every header control, not only the language picker', () => {
    const rule = css.match(/\.site-header :is\(a, button, input, select, textarea, summary, \[tabindex\]\):focus-visible\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/outline: 3px solid var\(--on-accent\);/)
    // A bare `.site-header :focus-visible` that only strips the box-shadow would hide kit rings again.
    expect(css).not.toMatch(/\.site-header :focus-visible,?\s*[^{]*\{[^}]*box-shadow: none/)
  })

  it('opens the drawer under the header, scrollable, with the menu button above the scrim', () => {
    expect(css).toMatch(/\.site:has\(\.mobile-drawer--open\) \.site-header\s*\{\s*z-index: 46;/)
    const drawer = css.match(/\n\.mobile-drawer\s*\{([^}]*)\}/)
    expect(drawer).not.toBeNull()
    expect(drawer![1]).toMatch(/top: calc\(var\(--header-h, 64px\) \+ 8px\);/)
    expect(drawer![1]).toMatch(/overflow-y: auto;/)
    expect(drawer![1]).toMatch(/overscroll-behavior: contain;/)
    for (const m of css.matchAll(/\n\.mobile-drawer\s*\{([^}]*)\}/g)) {
      expect(m[1]).not.toMatch(/top: 0;/)
      expect(m[1]).not.toMatch(/padding: (7|8)\dpx/)
    }
  })
})
