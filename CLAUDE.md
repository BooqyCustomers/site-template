# Instructions for Claude and developers

This file is read automatically by Claude Code. Keep it current: when you finish a task, update "State of this repo" (date, what changed, what is left) in the same commit.

## State of this repo (updated 2026-11-21)

- This is `site-template`: every new customer repo `site-<slug>` (BooqyCustomers and BooqyCustomersDev) is created from it, including this file. A new copy should replace this section with its own state (slug, dev and prod URLs, what is built, what is left).
- Uses site-kit 0.5.1 (`package.json`). No temporary overrides or bridges left (see "Temporary overrides to remove later").
- `main` has 2 merge commits that `dev` lacks (PR #1 and #2 merges) and `dev` is ahead of it. The next `dev` -> `main` PR settles it; do not rewrite either branch.
- Pushes to `dev` here do not deploy (no deploy variables on the template), and `ci.yml` runs on pull requests only, so run `npm test`, `npm run lint` and `npm run build` locally (needs a GitHub token with `read:packages`, see README).
- Site languages: the kit's `LanguagePicker` is in the top bar (`src/shared/CustomerLayout.tsx`), header CSS compacted for the picker and right-to-left safe in `src/site.css`, `translate="no"` on brand and contact data, test in `src/shared/lang.test.tsx`, language switch on in `e2e/site.config.ts`. Section "Languages" below tells new sites how it works.
- Last work by the Booqy owner's Claude session (2026-11-21): site-kit 0.5.1 (consent box `aria-controls` only when the channel choice is on the page, 44 px calendar button on touch screens); the header location picker (more than one location) is the kit's branded `Select` instead of a native `<select>`, its label at 90 % for contrast in dark mode, test in `src/shared/locationPicker.test.tsx`. Nothing else in progress; the repo is free to take over.

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
- Both boxes must be visible without hover (site-kit 0.5.0 draws them so; check after every site-kit bump).

**site-kit and fixes that every site needs:**
- Anything every site needs belongs in site-kit, not here. A site-kit change also has to be copied to `customer-front-end/packages/site-kit` (CI sync check).
- Sites build from the published site-kit version in `package.json`. Publishing is a tag `vX.Y.Z` on site-kit `main`, done by the Booqy owner; then each site bumps the dependency (Dependabot opens the PR to `dev`).
- New sites need site-kit 0.5.0 or later: guest form posts go through AWS WAF via `/api/*` on the site's own domain, checkboxes are visible without hover and the language picker is a kit export.
- Guest links use the restaurant's own domain once it is live (`<slug>.booqy.se` then 301-redirects to it).

**Motion and UX (skill `ux-motion`):**
- `.claude/skills/ux-motion/SKILL.md` holds 20 motion and UX principles with exact timings and easings. Claude Code loads it automatically; use it for every change that moves (hover, press, menus, sheets, booking steps, success moments) and for reviews.
- Use motion where it helps the guest (feedback, orientation, the booking confirmation as the peak moment), not everywhere. Always respect `prefers-reduced-motion`.
- Shared motion that every site needs belongs in site-kit, not in one site.

**Temporary overrides to remove later:**
- None. When a site needs a stopgap until a site-kit release has a fix, list it here with the file, the kit commit and the release that removes it, and delete it in the bump PR.

## Languages (sv, en, es, ar, fa)

Owner decision 2026-11-20: every customer site lets guests switch the whole site between Swedish (default), English, Spanish, Arabic and Persian. site-kit does the work (Amazon Translate, cached, called as `/api/translate` behind AWS WAF): site copy, menu data, opening hours, the booking, ordering, catering and manage-booking flows, buttons, errors and accessible labels. A new site needs no translation work, only the following.

- **Picker in the top bar.** `src/shared/CustomerLayout.tsx` imports `LanguagePicker` from `@bookingsystemadvancedorg/site-kit` and renders `<LanguagePicker className="site-header-lang" />` at the right of the top bar (after the open-now chip, before the theme toggle) on every width. Keep it there in your own layout. The kit's language provider is inside `SiteProvider`, so there is nothing to wire up. The picker is the kit's branded dropdown with flags; style only its slot (`.site-header-lang` in `src/site.css`, section "Språk"). Never translate text with your own code and never call the translate API from the site.
- **Mark what must not change** with `translate="no"`: restaurant and location names, address, phone, e-mail, legal name, org number, dish or product names you render yourself, the Booqy wordmark. Guest input and guest data are never sent for translation; keep it that way (never put a guest value in a visible sentence without `translate="no"`).
- **One sentence, one string.** Build visible sentences as a template string (`{`Om ${name}`}`, not `Om {name}`), so each sentence is a single text node and translates as a whole.
- **Hand-translated copy.** If a site writes its own text for a language, put `data-lang-own` on the elements that hold it only while that language is shown; the translator skips the whole subtree, so keep API data and kit flows outside it. Everything else is translated automatically.
- **Right to left.** Arabic and Persian set `html[dir='rtl']`. Write CSS with logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `text-align: start`, `border-inline-*`), never `left` and `right`. Direction-specific shapes (arrows, chevrons) flip with `html[dir='rtl'] ... { scale: -1 1 }`; times and phone numbers stay left to right (`direction: ltr; unicode-bidi: isolate`); a side panel that slides in needs an `html[dir='rtl']` override (the mobile drawer in `site.css` comes from the left).
- **Header width.** With the picker the top bar must fit longer words (English, Spanish). The burger takes over at 1280px, link text never wraps, and on phones the picker shows only the flag (below 390px without its arrow) and the open-now chip uses a narrower font and wraps to two lines, so its time is never cut ("Abre mañana a las 11:00"); at 340px it shrinks to a dot. Check the header at 360, 375, 390, 820 and 1440 (and 320) in all five languages, light and dark, Arabic and Persian in right-to-left.
- **Tests.** `src/shared/lang.test.tsx` checks the kit picker in the header (placement after the open-now chip and before the theme toggle, Swedish by default, brand marked `translate="no"`); `e2e/site.config.ts` turns on the suite's language switch test.
