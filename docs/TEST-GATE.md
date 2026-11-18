# Test gate: hand-off for `.github/` (owner)

In site-template: put the workflows below in the template itself, so every
site repo created from it has them from the start. The template has no dev
restaurant, so its own runs skip every test and pass.

The site's full test suite (`e2e/`, see `e2e/README.md`) is committed. It
needs three workflow changes and one branch protection setting, which are
the owner's to make. Everything below is ready to paste. Nothing new is
secret: the workflows use only `GITHUB_TOKEN` and the existing `DEV_*` repo
variables.

What it gives:

- **Every push to `dev`:** after `Deploy` has put the commit on
  `<slug>.dev.booqy.se`, the whole suite runs against it and the dev API. A
  failure marks the dev commit red (check `Deploy / site-tests / suite`) and
  the job summary lists what broke; the HTML report with traces is the
  artifact `site-test-report`.
- **Every pull request to `main`:** the same suite runs as check `suite`
  (workflow `Site tests`), after waiting until dev serves the PR's commit.
  With `check` (CI: lint, unit tests, prod build, which also proves no dev
  example data ships) it is required: only a green PR can be merged. Fix,
  push to dev, and the PR re-runs by itself.

## 1. New file `.github/workflows/site-tests.yml`

```yaml
# The site's full test suite (e2e/README.md) against the deployed dev site
# and the dev Booqy API: API integration, end-to-end flows, UI at 390, 768,
# 1024 and 1440 (layout, visual baselines, axe), UX checks and Core Web
# Vitals. Called by deploy.yml after every dev deploy, and runs on every
# pull request to main (required check "suite"). A repo without a dev
# restaurant in booqy.json (site-template) has nothing to test: every test
# skips itself.
name: Site tests

on:
  workflow_call:
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: site-tests-${{ github.event.pull_request.number || github.ref_name }}
  cancel-in-progress: true

jobs:
  suite:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      # The PR's own commit (dev's head), not the merge commit: that is what dev serves.
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha || github.sha }}

      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: npm
          cache-dependency-path: e2e/package-lock.json

      - name: Install
        run: npm --prefix e2e ci

      # A pull request may be opened before Deploy has put its commit on dev.
      # Every build stamps its commit into index.html (<meta name="booqy-build">,
      # vite.config.ts): wait until dev serves this one (at most 15 minutes).
      - name: Dev serves this commit
        if: github.event_name == 'pull_request'
        env:
          SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          set -euo pipefail
          url=$(jq -r '.environments.dev.previewUrl // empty' booqy.json)
          [ -n "$url" ] || { echo "No dev site in booqy.json: nothing to wait for."; exit 0; }
          for i in $(seq 1 60); do
            got=$(curl -fsS "$url/" | grep -o 'name="booqy-build" content="[0-9a-f]*"' | grep -o '[0-9a-f]\{40\}' || true)
            if [ "$got" = "$SHA" ]; then echo "dev serves $SHA"; exit 0; fi
            sleep 15
          done
          echo "::error::$url serves ${got:-an older build}, not $SHA, after 15 minutes. Check that Deploy on dev went through, then re-run this check."
          exit 1

      - name: Browser
        run: npm --prefix e2e exec -- playwright install --with-deps chromium

      - name: Site tests
        working-directory: e2e
        env:
          CI: "1"
          # Optional repo variable: a dev test restaurant for the API write
          # tests while the site's own location is not public yet.
          SITE_TEST_LOCATION_ID: ${{ vars.SITE_TEST_LOCATION_ID }}
        run: npx playwright test

      - name: What broke
        if: always()
        working-directory: e2e
        run: node summarize.mjs >> "$GITHUB_STEP_SUMMARY"

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: site-test-report
          path: |
            e2e/playwright-report
            e2e/test-results
          retention-days: 14
```

## 2. `.github/workflows/deploy.yml`: one job at the end

Append under `jobs:` (after the `deploy` job, same indentation):

```yaml
  # The whole suite against what was just deployed (dev only; not on a
  # rollback). A failure marks this dev commit red.
  site-tests:
    needs: deploy
    if: github.ref_name == 'dev' && needs.deploy.result == 'success' && inputs.sha == ''
    uses: ./.github/workflows/site-tests.yml
```

Or with one command from the repo root:

```bash
cat >> .github/workflows/deploy.yml <<'EOF'

  # The whole suite against what was just deployed (dev only; not on a
  # rollback). A failure marks this dev commit red.
  site-tests:
    needs: deploy
    if: github.ref_name == 'dev' && needs.deploy.result == 'success' && inputs.sha == ''
    uses: ./.github/workflows/site-tests.yml
EOF
```

## 3. New file `.github/workflows/visual-baselines.yml`

CI runs Linux, so its screenshots differ from a Mac's. Until a page has a
Linux baseline the suite reports it ("no visual baseline") instead of
failing. Run this once after merging, and again after a deliberate design
change (Actions -> Visual baselines -> Run workflow on `dev`):

```yaml
# Writes the visual baselines (Linux, as CI runs) from the deployed dev site
# and commits them to dev: e2e/specs/__screenshots__/linux. Run after a
# deliberate design change; the suite then compares every page against them.
name: Visual baselines

on:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  baselines:
    if: github.ref_name == 'dev'
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: npm
          cache-dependency-path: e2e/package-lock.json
      - run: npm --prefix e2e ci
      - run: npm --prefix e2e exec -- playwright install --with-deps chromium
      - name: Screenshots of every page at every width
        working-directory: e2e
        env:
          CI: "1"
        # Layout or axe findings do not stop the baselines; the suite reports them.
        run: npx playwright test --grep @ui --update-snapshots=all || true
      - name: Commit
        working-directory: e2e
        run: |
          git add specs/__screenshots__/linux
          if git diff --cached --quiet; then echo "unchanged"; exit 0; fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git commit -m "Visual baselines (Linux) from the dev site"
          git push
```

## 4. Branch protection: required checks on `main`

`check` (CI) and `suite` (Site tests) must pass before a PR can be merged.
With the GitHub CLI, from any folder (repeat per site repo, or use the loop):

```bash
gh api -X PUT repos/BooqyCustomers/site-<slug>/branches/main/protection --input - <<'JSON'
{"required_status_checks":{"strict":false,"contexts":["check","suite"]},"enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null}
JSON
```

Every site repo in the organisation at once:

```bash
for r in $(gh repo list BooqyCustomers --limit 200 --json name -q '.[].name | select(startswith("site-"))'); do echo "$r"; gh api -X PUT "repos/BooqyCustomers/$r/branches/main/protection" --input - <<< '{"required_status_checks":{"strict":false,"contexts":["check","suite"]},"enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null}'; done
```

In the browser instead: repo Settings -> Branches -> Add branch protection
rule -> Branch name pattern `main` -> Require status checks to pass before
merging -> search and add `check` and `suite` (they appear after each has
run once) -> Create.

A new repo created from site-template gets the workflows from the template
but not the branch protection (a repo setting): run the command above for
it, or have Booqy Console apply it when it creates the repo.

## 5. Optional repo variable

`SITE_TEST_LOCATION_ID`: while the site's own location is not public on dev
(the restaurant has not finished its setup in Booqy Admin, so public routes
answer 404), the API write tests (hold, book, cancel) skip with that reason.
Set this variable to a dev test restaurant's location to run them meanwhile,
for example E2E Testkrogen Södermalm `01m7btgs25dbkznze4n1pyqp1p`. Remove it
once the restaurant is live on dev.

## Infrastructure

Nothing to add. The guest form posts pass AWS WAF the supported way: the
tests open the site in a real Chromium, whose challenge.js gets the
`aws-waf-token` cookie, and post through the site's `/api` with it, exactly
as a guest does. No test token, header or WAF exception is needed, so
nothing weakens the bot check. A run sends about 25 requests to `/api`, far
below the WAF rate limit (300 per IP per 5 minutes).
