# Site tests (dev)

The full test suite for this restaurant site. It drives the **deployed dev
site** (`<slug>.dev.booqy.se`, booqy.json `dev.previewUrl`) and the **dev
Booqy API** in Chromium with Playwright. It never runs against production:
the config refuses any host but `*.dev.booqy.se`, `*.test-dev.booqy.se`,
`*.test.booqy.se` and localhost.

The same files are in every site repo (they come from site-template); only
`site.config.ts` is this site's own.

## Run

```bash
npm run test:site          # from the repo root: install, browser, whole suite
```

Or inside `e2e/`:

```bash
npm ci && npx playwright install chromium
npx playwright test                         # everything
npx playwright test --project=api           # API integration only
npx playwright test --project=e2e-desktop --project=e2e-phone
npx playwright test --project=ui-390        # one width
npx playwright show-report                  # what failed, with traces
npm run baselines                           # write the visual baselines again
```

Against a local build (before pushing): `npm run build && npx vite preview
--port 7072`, then `SITE_URL=http://localhost:7072 SITE_VISUAL=0 npx
playwright test` (no AWS WAF locally, and the baselines are the deployed
site's).

## What runs

| Project | Spec | What |
| --- | --- | --- |
| `api` | `api.spec.ts` | site-config, public reads, AWS WAF (a write without a browser token is challenged, with one it reaches the API), hold and release a table, book + manage link + cancel (card step in Stripe test mode when the location requires a card), refused bookings, ordering state, an order up to payment (left unpaid, it expires), order status links, catering settings, menu and quote, catering request validation, gift card offer and balance |
| `e2e-desktop`, `e2e-phone` | `flows.spec.ts` | every page loads without errors, every linked page is in the suite, header navigation (phone menu too), booking a table end to end, ordering for pickup, contact and parking pages, language switch, manage-booking page |
| `ui-390`, `ui-768`, `ui-1024`, `ui-1440` | `ui.spec.ts` | per page: no horizontal scroll, nothing clipped or overlapping, axe (WCAG 2.1 A and AA), visual baseline; light and dark when the site has both |
| same | `ux.spec.ts` | keyboard reaches every control with visible focus (1024, 1440), touch targets at least 44 px (390, 768), Core Web Vitals LCP and CLS (390, 1440), reduced motion, loading and error states |

## Test data

- Everything the suite creates is named `E2E Sajttest`, carries
  `booqy-site-e2e <run>` in its notes, uses the SES mailbox simulator and a
  phone number from the PTS range for fiction (070-174 06 05..99).
- Bookings are cancelled and holds released in `afterAll`, also when a test
  fails. An unpaid order expires by itself (TTL). Catering requests and gift
  cards are only checked up to validation: a guest can't withdraw them.
- A part the dev restaurant has not set up yet (not public, no floor plan,
  ordering closed) is skipped with the reason in the report. To run the
  write tests meanwhile, point them at a dev test restaurant:
  `SITE_TEST_LOCATION_ID=<locationId>`.
- In dev the site shows example data until the restaurant has entered its
  own (README, "Example data in dev"); a booking on the example floor plan is
  never sent to Booqy. `src/devPlaceholders/bundle.test.ts` (unit tests)
  fails if the example data is in a prod or test build.

## Settings

| Env var | Default |
| --- | --- |
| `SITE_URL` | booqy.json `dev.previewUrl` |
| `SITE_API_URL` | booqy.json `dev.apiBaseUrl` |
| `SITE_TENANT_ID` | booqy.json `dev.tenantId` |
| `SITE_TEST_LOCATION_ID` | the site's first location |
| `SITE_VISUAL=0` | skip the visual baselines |

Baselines are per platform in `specs/__screenshots__/<platform>/`. CI
compares against `linux/`, which the "Visual baselines" workflow writes from
the dev site and commits. A Mac's (`darwin/`) stay local and out of git:
`npm run baselines` writes them once. A page without a baseline is reported
("no visual baseline"), not failed. Screenshots run with the page clock at
09:00 Stockholm, hide decorative backgrounds (`site.config.ts` visualHide)
and mask what changes by itself (dates, times, reviews, maps).
