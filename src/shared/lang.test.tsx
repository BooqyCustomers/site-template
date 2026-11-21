import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiteProvider } from '@bookingsystemadvancedorg/site-kit'
import { json, siteConfig } from '@bookingsystemadvancedorg/site-kit/testing'
import App from '../App'

function renderSite() {
  window.history.replaceState(null, '', '/?restaurang=testkrogen')
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    url.includes('/site-config') ? json(siteConfig()) : json({ items: [] })))
  return render(
    <MemoryRouter>
      <SiteProvider>
        <App />
      </SiteProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
  localStorage.clear()
})

describe('language picker in the header', () => {
  it('puts the kit picker at the right of the top bar, after the open-now chip and before the theme toggle', async () => {
    renderSite()
    await screen.findByRole('link', { name: 'Testkrogen - startsida' })
    const picker = document.querySelector('.site-header-lang')
    expect(picker).not.toBeNull()
    expect(picker).toHaveClass('lang-picker')
    expect(picker).toHaveAttribute('translate', 'no')
    const header = picker!.closest('.site-header-inner')
    expect(header).not.toBeNull()
    const kids = Array.from(header!.children)
    const theme = header!.querySelector('.site-header-theme')
    const chip = header!.querySelector('.open-chip')
    expect(kids.indexOf(picker!)).toBeGreaterThan(kids.indexOf(chip!))
    expect(kids.indexOf(picker!)).toBeLessThan(kids.indexOf(theme!))
  })

  it('opens on Swedish by default', async () => {
    renderSite()
    await screen.findByRole('link', { name: 'Testkrogen - startsida' })
    const button = document.querySelector('.site-header-lang button')
    expect(button).not.toBeNull()
    expect(button!.getAttribute('aria-label') ?? '').toMatch(/Svenska/)
  })

  it('marks the restaurant name in the brand as not translatable', async () => {
    renderSite()
    const brand = await screen.findByRole('link', { name: 'Testkrogen - startsida' })
    expect(brand.querySelector('.site-header-wordmark')).toHaveAttribute('translate', 'no')
  })
})
