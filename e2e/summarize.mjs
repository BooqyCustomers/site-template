// What broke, in plain lines: reads test-results/results.json (the json
// reporter, written in CI) and prints Markdown for the GitHub job summary.
//   node summarize.mjs >> "$GITHUB_STEP_SUMMARY"
import { existsSync, readFileSync } from 'node:fs'

const file = new URL('./test-results/results.json', import.meta.url)
if (!existsSync(file)) {
  console.log('### Site tests\n\nNo results (the suite did not run).')
  process.exit(0)
}
const report = JSON.parse(readFileSync(file, 'utf8'))
// eslint-disable-next-line no-control-regex -- ANSI colour codes from the reporter
const strip = (s) => String(s ?? '').replace(/\u001b\[[0-9;]*m/g, '')
const failed = []
const notes = new Map()

function walk(suite, path = []) {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests) {
      const last = t.results.at(-1)
      const where = `${t.projectName} › ${spec.title}`
      if (t.status === 'unexpected' && last) {
        const first = (last.errors ?? []).map((e) => strip(e.message).split('\n').filter(Boolean).slice(0, 3).join(' ')).join(' / ')
        failed.push(`| ${where} | ${first.replace(/\|/g, '\\|').slice(0, 400)} |`)
      }
      for (const a of t.annotations ?? []) {
        if (a.type === 'web vitals' || a.type === 'layout shifts') continue
        const key = `${a.type}: ${a.description ?? ''}`
        notes.set(key, (notes.get(key) ?? 0) + 1)
      }
    }
  }
  for (const s of suite.suites ?? []) walk(s, [...path, s.title])
}
for (const s of report.suites ?? []) walk(s)

const { expected = 0, unexpected = 0, flaky = 0, skipped = 0 } = report.stats ?? {}
console.log(`### Site tests: ${unexpected ? 'failed' : 'passed'}\n`)
console.log(`${expected} passed, ${unexpected} failed, ${flaky} flaky (passed on retry), ${skipped} skipped.\n`)
if (failed.length) {
  console.log('| Test | What broke |\n| --- | --- |')
  console.log(failed.join('\n'))
  console.log('\nThe HTML report (artifact `site-test-report`) has a trace and screenshot for each failure.\n')
}
if (notes.size) {
  console.log('<details><summary>Skipped or not checked, and why</summary>\n')
  for (const [k, n] of notes) console.log(`- ${k}${n > 1 ? ` (${n} tests)` : ''}`)
  console.log('\n</details>')
}
