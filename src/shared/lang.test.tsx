import { render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiteProvider } from '@bookingsystemadvancedorg/site-kit'
import { json, siteConfig } from '@bookingsystemadvancedorg/site-kit/testing'
import App from '../App'

// Styr vad ./lang levererar i sidhuvudet; själva bryggan testas separat nedan.
const state = vi.hoisted(() => ({ picker: null as ComponentType<{ className?: string }> | null }))
vi.mock('./lang', async (importOriginal) => {
  const original = await importOriginal<typeof import('./lang')>()
  return {
    ...original,
    get LanguagePicker() {
      return state.picker
    },
  }
})

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
  state.picker = null
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('language picker in the header', () => {
  it('renders the header as before when the kit has no picker (site-kit 0.3.0)', async () => {
    renderSite()
    await screen.findByRole('link', { name: 'Testkrogen - startsida' })
    expect(document.querySelector('[data-testid="lang-picker"]')).toBeNull()
    expect(document.querySelector('.site-header-lang')).toBeNull()
    expect(screen.getByRole('button', { name: /Öppna meny/ })).toBeInTheDocument()
  })

  it('puts the kit picker at the right of the top bar, before the theme toggle', async () => {
    state.picker = ({ className }) => <span data-testid="lang-picker" className={className} />
    renderSite()
    await screen.findByRole('link', { name: 'Testkrogen - startsida' })
    const picker = screen.getByTestId('lang-picker')
    expect(picker).toHaveClass('site-header-lang')
    const header = picker.closest('.site-header-inner')
    expect(header).not.toBeNull()
    const kids = Array.from(header!.children)
    const theme = header!.querySelector('.site-header-theme')
    const chip = header!.querySelector('.open-chip')
    expect(kids.indexOf(picker)).toBeGreaterThan(kids.indexOf(chip!))
    expect(kids.indexOf(picker)).toBeLessThan(kids.indexOf(theme!))
  })

  it('marks the restaurant name in the brand as not translatable', async () => {
    renderSite()
    const brand = await screen.findByRole('link', { name: 'Testkrogen - startsida' })
    expect(brand.querySelector('.site-header-wordmark')).toHaveAttribute('translate', 'no')
  })
})
