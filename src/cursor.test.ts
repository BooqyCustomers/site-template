// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The owner 2026-11-27: the pointer is the same arrow everywhere on the website.
describe('pointer', () => {
  it('forces the default cursor on every element in the last loaded stylesheet', () => {
    const css = readFileSync(new URL('./quality.css', import.meta.url), 'utf8')
    expect(css).toMatch(/html,\s*html \*,\s*html \*::before,\s*html \*::after \{\s*cursor: default !important;/)
    const main = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8')
    const imports = main.split('\n').filter((l) => /^import '.*\.css'/.test(l))
    expect(imports.at(-1)).toBe("import './quality.css'")
  })
})
