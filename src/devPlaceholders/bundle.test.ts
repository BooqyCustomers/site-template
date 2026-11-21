// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { build } from 'vite'
import { PLACEHOLDER_MARKER } from '.'

/**
 * Exempeldatan får aldrig nå ett prod-bygge: bygger sajten som deployen gör
 * (BOOQY_ENV=prod, test och dev) och letar efter modulens markör i filerna.
 */
const dirs: string[] = []

async function bundleText(booqyEnv: string): Promise<string> {
  const outDir = mkdtempSync(join(tmpdir(), `site-${booqyEnv}-`))
  dirs.push(outDir)
  const before = process.env.BOOQY_ENV
  process.env.BOOQY_ENV = booqyEnv
  try {
    await build({ mode: 'production', logLevel: 'silent', build: { outDir, emptyOutDir: true } })
  } finally {
    process.env.BOOQY_ENV = before
  }
  const files = readdirSync(outDir, { recursive: true, encoding: 'utf8' }).filter((f) => /\.(js|html)$/.test(f))
  return files.map((f) => readFileSync(join(outDir, f), 'utf8')).join('\n')
}

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

describe('exempeldata bara i dev-bygget', () => {
  it('finns inte i prod- eller testbygget', async () => {
    expect(await bundleText('prod')).not.toContain(PLACEHOLDER_MARKER)
    expect(await bundleText('test')).not.toContain(PLACEHOLDER_MARKER)
  }, 240_000)

  it('finns i dev-bygget (så att kontrollen ovan betyder något)', async () => {
    expect(await bundleText('dev')).toContain(PLACEHOLDER_MARKER)
  }, 120_000)
})
