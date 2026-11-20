import { describe, expect, it } from 'vitest'
import * as kit from '@bookingsystemadvancedorg/site-kit'
import { LanguagePicker } from './lang'

describe('the version-safe bridge', () => {
  it('is the kit picker when the installed site-kit has one, otherwise null', () => {
    const exported = (kit as unknown as Record<string, unknown>)['LanguagePicker']
    expect(LanguagePicker).toBe(typeof exported === 'function' ? exported : null)
  })
})
