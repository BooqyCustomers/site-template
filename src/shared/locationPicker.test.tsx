import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiteProvider } from '@bookingsystemadvancedorg/site-kit'
import { json, siteConfig } from '@bookingsystemadvancedorg/site-kit/testing'
import App from '../App'

function renderSite(locations = 2) {
  const config = siteConfig()
  const base = config.locations[0]
  config.locations = Array.from({ length: locations }, (_, i) =>
    i === 0 ? base : { ...base, locationId: `loc-${i + 1}`, name: `Testkrogen ${i === 1 ? 'Söder' : `Plats ${i + 1}`}` })
  window.history.replaceState(null, '', '/?restaurang=testkrogen')
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    url.includes('/site-config') ? json(config) : json({ items: [] })))
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

describe('location picker in the header', () => {
  it('is the branded kit Select, not a native select, and switches location', async () => {
    const user = userEvent.setup()
    renderSite(2)
    const picker = await screen.findByRole('combobox', { name: 'Restaurang' })
    expect(document.querySelector('.location-picker select')).toBeNull()
    expect(picker).toHaveTextContent('Testkrogen City')
    await user.click(picker)
    const list = await screen.findByRole('listbox')
    await user.click(within(list).getByRole('option', { name: 'Testkrogen Söder' }))
    expect(screen.getByRole('combobox', { name: 'Restaurang' })).toHaveTextContent('Testkrogen Söder')
  })

  it('is hidden with a single location', async () => {
    renderSite(1)
    await screen.findByRole('link', { name: 'Testkrogen - startsida' })
    expect(screen.queryByRole('combobox', { name: 'Restaurang' })).not.toBeInTheDocument()
  })
})
