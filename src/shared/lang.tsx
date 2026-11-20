import type { ComponentType } from 'react'
import * as kit from '@bookingsystemadvancedorg/site-kit'

/**
 * Språkväljaren från site-kit, version-säker.
 *
 * Webbplatsen kan översättas till engelska, spanska, arabiska och persiska
 * (Amazon Translate) från den site-kit-version som har språkstödet. Äldre
 * versioner (0.3.0) saknar väljaren: då är `LanguagePicker` null och sidhuvudet
 * visas som förut. Leverantören (LanguageProvider) ligger redan i kitets
 * SiteProvider, så inget annat i sajten beror på versionen.
 *
 * Nyckeln är beräknad med flit: då försöker varken Rollup eller TypeScript
 * lösa en export som saknas i 0.3.0. När sajten har uppgraderats kan raden
 * bytas mot `import { LanguagePicker } from '@bookingsystemadvancedorg/site-kit'`.
 */
export type LanguagePickerComponent = ComponentType<{ className?: string }>

// Byggverktygen får inte kunna räkna ut namnet i förväg.
const exportName = ['Language', 'Picker'].join('')
const exported = (kit as unknown as Record<string, unknown>)[exportName]

export const LanguagePicker: LanguagePickerComponent | null =
  typeof exported === 'function' ? (exported as LanguagePickerComponent) : null
