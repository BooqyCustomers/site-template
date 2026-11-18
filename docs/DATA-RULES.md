# Data rules: dev uses fake data, production uses the restaurant's real data

Owner's decision, 2026-11-18. Applies to every restaurant site in the GitHub
organisation `BooqyCustomers` (`site-<slug>`, created from this template) and
to everyone who works on one, people and Claude alike. Copied into every new
site repo with the template; do not delete it.

Status marks: **[live]** works today, **[building]** being built now (until it
lands, do that step by hand as described).

## The rule in one sentence

The `dev` branch only ever talks to a fake copy of the restaurant (its *twin*)
in Booqy's dev environment; the `main` branch only ever talks to the real
restaurant, set up by the restaurant itself in production Booqy Admin.

## Two environments, never mixed

| | dev | production |
|---|---|---|
| Git branch | `dev` | `main` |
| Website | `https://<slug>.dev.booqy.se` | `https://<slug>.booqy.se` (later the restaurant's own domain) |
| AWS account | Booqy dev (877653167825) | Booqy prod (343695380960) |
| Booqy API, Admin, Console | dev (`restaurang.dev.booqy.se`, Booqy Console Dev) | prod (`restaurang.booqy.se`, Booqy Console) |
| Restaurant data comes from | the twin (fake, owned by Booqy) | the real restaurant (entered by its owner) |
| Stripe | test mode only, test cards such as 4242 4242 4242 4242; nothing is ever charged | the restaurant's real Stripe account |
| Who sees it | Booqy developers only (never indexed) | real guests |

Never point a `dev` build at the production API, and never point a `main`
build at the dev API. `booqy.json` holds both settings; the build picks one by
`BOOQY_ENV` (`dev` on the `dev` branch, `prod` on `main`).

## Why dev never uses real data

- **Money:** the real restaurant's Stripe account charges real cards. A test
  booking fee or order in dev would take real money.
- **Guests and staff:** a test booking would land in the restaurant's real
  booking list, text and email real people and print a ticket in their
  kitchen.
- **Privacy:** real guests' names, phone numbers and emails stay in
  production. They are never copied to dev, to tests, to logs or to this repo.
- **Speed:** with a twin we can build and test the site before the restaurant
  has finished its own setup.

## The twin

Every real customer has a twin: a second restaurant with the same name and
slug in Booqy's dev environment.

- **Owned by Booqy**, never by the restaurant. Its owner login is a Booqy team
  address. The restaurant never sees it and never logs into it.
- **Created automatically** when the customer is created in production Booqy
  Console, with every Kom igång step filled with realistic fake data:
  location, opening hours, table layout, menu, card guarantee on a Stripe
  test-mode account, ordering, simulated printers, phone settings. A
  "Create or refresh dev twin" button in Booqy Console Dev does the same for
  older customers. **[building]** Until it lands, create the twin by hand in
  Booqy Console Dev with the same slug and fill it in Booqy Admin Dev.
- **Public content follows the real restaurant.** When the restaurant has
  finished its setup in production (see the order below), what a guest can
  see on the website is copied from production to the twin: menu, dishes and
  prices, opening hours, table layout, photos and texts. **[building]**
- **Never copied:** anything secret or anything that costs money or reaches a
  person: Stripe accounts and keys, payments, bookings, orders, guests and
  their details, staff and their logins, phone and SMS numbers, email
  addresses, API keys. The twin keeps its own fake versions of these.
- **Copying goes one way only:** production to dev. Nothing in dev ever
  reaches production.

## Dev example data in the site itself

Until the twin has real-looking content, the `dev` build of the site shows
built-in example data where the twin has none (see "Example data in dev" in
the README; code in `src/devPlaceholders/`). **[live]**

- Only in the `dev` build. The `prod` and `test` builds contain none of it;
  `src/devPlaceholders/bundle.test.ts` fails the build if they do.
- Real twin data always wins, piece by piece.
- Production never shows examples. **[live]**
- Until the restaurant is ready, the production site says "Webbplatsen är
  inte klar ännu", then goes live by itself with no deploy. Today "ready"
  means the restaurant has at least one location in Booqy. **[live]**
  Waiting for the whole Kom igång setup instead is the goal but not built
  yet: until it is, merge to `main` only after Booqy Console reports
  "Setup finished" for the restaurant.

## Test customers versus real customers

- A **real customer** is created in production Booqy Console. It gets a repo
  in `BooqyCustomers`, a production restaurant and a dev twin.
- A **test customer** is created in Booqy Console Dev. It lives only in dev:
  no production restaurant, no twin, repo in `BooqyCustomersDev` (sites on
  `<slug>.test.booqy.se` and `<slug>.test-dev.booqy.se`). **[live]**
- **No collisions [building]:**
  - A twin is marked "Twin of prod" and a test customer "Dev test" in Booqy
    Console Dev.
  - If a dev test customer already uses a slug, the twin is never merged
    into it or written over it; Booqy Console Dev asks an operator to rename
    or delete the test customer first.
  - A slug that a production customer uses cannot be taken by a new dev test
    customer.
  - Deleting a twin never touches production; removing a production customer
    only flags its twin, nothing is deleted without an operator.

## Order of work for every new customer

1. Booqy creates the customer in production Booqy Console. The repo
   `site-<slug>` and the twin are created. **[live: repo; building: twin]**
2. The restaurant logs into production Booqy Admin and works through every
   Kom igång step (9 today, more later), completing or skipping each one.
3. When every step is completed or skipped, Booqy Console notifies the Booqy
   team: "Setup finished". **[building]** The twin then receives the
   restaurant's public content.
4. Booqy builds the site on `dev` and checks it on `<slug>.dev.booqy.se`.
   Every push to `dev` deploys there and runs the full test suite against it:
   API and integration tests, end-to-end flows, UI tests at 390, 768, 1024
   and 1440 px, accessibility and UX checks. **[live: suite in `e2e/`; runs
   by itself once the `docs/TEST-GATE.md` workflows are in]** Tests use the
   twin and Stripe test mode only, mark what they create as test data and
   delete it afterwards.
5. A pull request `dev` to `main` runs the same full suite as a required
   check. Anything red is fixed on `dev` and the pull request runs again.
   Only a green pull request is merged. **[live: suite; required check once
   the `docs/TEST-GATE.md` workflows and branch protection are in]**
6. The merge deploys to production. The site shows the restaurant's real data.

## Checklist before every merge to main

- [ ] Booqy Console reports "Setup finished" for the restaurant.
- [ ] The site was checked on `<slug>.dev.booqy.se` at phone, tablet and
      desktop widths.
- [ ] The full test suite is green on the pull request.
- [ ] No real customer data, real Stripe keys or secrets anywhere in the repo.
- [ ] Example data is only in `src/devPlaceholders/` and the bundle test
      passes.
- [ ] `booqy.json` still has the right `dev` and `prod` settings.
