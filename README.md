# Restaurant site

One restaurant's own website, built on [`@booqy/site-kit`](https://github.com/BookingSystemAdvancedOrg/site-kit)
(booking, menu, ordering and payment, catering, GDPR pages). This repo holds
only the look: layout, pages and styles. Designed in Figma by Booqy, coded on
top of the kit.

This is `site-template`: Booqy creates a private copy `site-<slug>` for every
restaurant when the customer is created in Booqy Console. Runbook:
`infrastructure/docs/CUSTOMER-SITE-RUNBOOK.md`.

## Get started locally

Once per machine: a GitHub token with `read:packages` for the kit
(`npm login --scope=@booqy --auth-type=legacy --registry=https://npm.pkg.github.com`,
username = your GitHub user, password = the token).

```bash
git clone git@github.com:BookingSystemAdvancedOrg/site-<slug>.git
cd site-<slug>
npm install
npm run dev        # http://localhost:7071, the restaurant's dev data
```

`booqy.json` says which restaurant and API each environment uses (written by
Booqy; nothing in it is secret). `npm run dev` uses its `dev` part. To point
elsewhere, copy `.env.example` to `.env.local`.

## Branches and deploys

- Work on `dev`. Every push to `dev` deploys to the dev preview
  `https://<slug>.dev.booqy.se` (never indexed by search engines).
- Go live: PR `dev` -> `main`, merge. The deploy to production refuses until
  the restaurant's own domain is attached and verified in Booqy.
- Rollback: Actions -> Deploy -> Run workflow on the branch, with the SHA of
  an older commit on it.
- Only `dev` and `main`; no other long-lived branches.

## The kit

Update PRs for `@booqy/site-kit` come from Dependabot to `dev`. Patch
versions merge and deploy themselves when CI is green; minor and major wait
for a review. Put anything every site needs into the kit, not here.

```bash
npm test
npm run lint
npm run build      # BOOQY_ENV=prod npm run build for the production variant
```
