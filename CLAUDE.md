# Instructions for Claude and developers

This file is read automatically by Claude Code. Keep it current: when you finish a task, update "State of this repo" (date, what changed, what is left) in the same commit.

## State of this repo (updated 2026-11-19)

- This is `site-template`: every new customer repo `site-<slug>` (BooqyCustomers and BooqyCustomersDev) is created from it, including this file. A new copy should replace this section with its own state (slug, dev and prod URLs, what is built, what is left).
- Uses site-kit 0.3.0 (`package.json`).
- Checkbox override: `src/quality.css` (end of file), commit `a08fb21`.
- `main` has 2 merge commits that `dev` lacks (PR #1 and #2 merges) and `dev` is 8 commits ahead. The next `dev` -> `main` PR settles it; do not rewrite either branch.
- Pushes to `dev` here do not deploy (no deploy variables on the template), and `ci.yml` runs on pull requests only, so run `npm test`, `npm run lint` and `npm run build` locally (needs a GitHub token with `read:packages`, see README).
- Last work by the Booqy owner's Claude session: checkbox visibility (2026-11-19). Nothing else in progress; the repo is free to take over.

## Rules for every BooqyCustomers repo

Booqy is a multi-tenant restaurant SaaS (booking, ordering, catering, marketing). Each `site-<slug>` repo is one restaurant's own website: only the look (layout, pages, styles). Booking, menu, ordering, payment, catering and GDPR pages come from the npm package `@bookingsystemadvancedorg/site-kit` (repo `BookingSystemAdvancedOrg/site-kit`). Read `README.md` and `docs/DATA-RULES.md` before changing anything.

**Branches and merging (avoid conflicts):**
- Only `dev` and `main` exist. Work on `dev`, or on a short-lived branch merged into `dev` the same day and then deleted. Never push directly to `main`; going live is a PR `dev` -> `main` that the Booqy owner approves.
- Before you start, and again before every push: `git fetch origin && git rebase origin/dev`. Keep commits small and focused; push each finished piece at once.
- Push to `dev` deploys to the dev preview (`https://<slug>.dev.booqy.se`); push to `main` deploys to production. Watch the `Deploy` run after every push and fix what you broke.
- `.github/` (workflows, Dependabot) belongs to the Booqy owner: propose changes, do not edit.
- In some repos `main` and `dev` have no common history (they were created separately). Do not try to merge or rebase them onto each other; ask the owner how to go live.

**Data:**
- `dev` only ever uses fake data: the restaurant's dev twin in the dev Booqy Admin (`https://restaurang.dev.booqy.se`) plus the dev-only example data in `src/devPlaceholders/` (only where the repo has it). Stripe is test mode (`4242 4242 4242 4242`).
- `main` only ever uses the restaurant's real production data. Production never shows example data.
- The restaurant enters its own location, menu, opening hours and contact details in its Booqy Admin. Never create or edit that data, not even in dev; if something is missing, rely on the placeholders and note it.
- Delete any test bookings or orders you create in dev right after the test.

**Copy and style:**
- All site copy is Swedish.
- Never use the em dash (U+2014) or en dash (U+2013), not even as `&mdash;` or `&ndash;`. Use a comma, colon, parentheses or a hyphen.
- Check every UI change yourself at phone (390), tablet (820) and desktop (1440) widths, in every theme the site has.
- Never put secrets in the repo (deploys use OIDC; `booqy.json` holds nothing secret).

**Consent checkboxes (owner decision 2026-11-19, applies to every site):**
- The booking terms box ("Jag godkänner bokningsvillkoren") starts unticked; the guest must tick it.
- The marketing consent box also starts unticked, always. A pre-ticked box is not valid consent under GDPR (CJEU Planet49). Never pre-tick it; raise sign-ups only with better wording.
- Both boxes must be visible without hover (fix below).

**site-kit and fixes that every site needs:**
- Anything every site needs belongs in site-kit, not here. A site-kit change also has to be copied to `customer-front-end/packages/site-kit` (CI sync check).
- Sites build from the published site-kit version in `package.json`. Publishing is a tag `vX.Y.Z` on site-kit `main`, done by the Booqy owner; then each site bumps the dependency (Dependabot opens the PR to `dev`).
- New sites need site-kit 0.3.0 or later: guest form posts go through AWS WAF via `/api/*` on the site's own domain.
- Guest links use the restaurant's own domain once it is live (`<slug>.booqy.se` then 301-redirects to it).

**Motion and UX (skill `ux-motion`):**
- `.claude/skills/ux-motion/SKILL.md` holds 20 motion and UX principles with exact timings and easings. Claude Code loads it automatically; use it for every change that moves (hover, press, menus, sheets, booking steps, success moments) and for reviews.
- Use motion where it helps the guest (feedback, orientation, the booking confirmation as the peak moment), not everywhere. Always respect `prefers-reduced-motion`.
- Shared motion that every site needs belongs in site-kit, not in one site.

**Temporary overrides to remove later:**
- Checkbox visibility (2026-11-19). site-kit up to 0.4.0 drew `.booking-check` checkboxes with CSS variables no theme defines, so the boxes were invisible until hover. Fixed in site-kit `dev` (commit `fa61a10`, not published yet). Until a published site-kit release contains it, each site carries an override (file named below). When the site bumps to that release, delete the override in the same PR and check that the boxes still show.
