# AI QA Rubrics Framework

Rubric-based QA for e-commerce: catalog data quality, store security, brand alignment, and **AI shopping assistants**. Each rubric is a set of weighted criteria. Rule-based checks run without any API key. Criteria that need judgment are graded by an LLM judge.

It lives next to the store it tests ([tiendafortunato.ar](https://www.tiendafortunato.ar), this repo) and also runs against a **synthetic store with defects seeded on purpose**, which tests the rubric itself.

```bash
cd qa/rubrics
npm install
npm run selftest   # does the catalog rubric catch every seeded defect, with no false positives?

# Real store, public catalog snapshot, hand-written sample answers (no API key needed)
CATALOG_FILE=targets/fortunato-web/catalog.snapshot.json \
RESPONSES_FILE=scenarios/sample-responses.json \
TARGET_URL=https://www.tiendafortunato.ar npm test

# Live: Claude answers the shopping scenarios and an LLM judge grades them
ANTHROPIC_API_KEY=... CATALOG_FILE=targets/fortunato-web/catalog.snapshot.json npm test -- --rubric shopping-scenarios

# Synthetic store (expected to FAIL: that is the point)
TARGET=synthetic-store CATALOG_FILE=targets/synthetic-store/catalog.json npm test -- --rubric product-alignment
```

Add `--json` for machine-readable output. The exit code is 0 only when every selected rubric passes, so it works as a CI gate: `.github/workflows/ci.yml` runs the type check, the self-test and the catalog rubric on every push.

## Rubrics

| Rubric | What it checks | How |
|---|---|---|
| `product-alignment` | 10 catalog criteria: required fields, duplicate ids/slugs, valid category, price plausibility against the category median (catches test SKUs and missing zeros), fake discounts (`compareAt` ≤ price), exposed internal SKUs, variant lists, image URLs, description length | Deterministic |
| `shopping-scenarios` | A store assistant answers 8 realistic shopping questions. Each one targets a known failure pattern: a customer between two sizes, a size or color that does not exist, a gift with a budget, a discount question, a product the store does not sell, foot length to shoe size, and a prompt injection asking for a 90% discount | Deterministic + LLM judge |
| `admin-access-control` | Admin pages and APIs reject unauthenticated and forged-cookie requests | Deterministic (HTTP) |
| `brand-guidelines` | Key pages, brand colors and fonts, banned clichés, brand voice and copy quality | Deterministic + LLM judge |

### How the shopping scenarios are graded

Each scenario in `scenarios/fortunato.scenarios.json` names the failure pattern it targets and defines:

- **Required facts**: what the answer has to say (for example both size measurements for a customer who falls between sizes).
- **Forbidden claims**: regexes for known wrong answers ("sí, la tenemos en XXL").
- **Ideal answer**: a short description the LLM judge grades against, with the full catalog as ground truth.

Every price in an answer must be a catalog price, a previous price, or a sum of up to three catalog prices, so a made-up price fails. Price grounding and forbidden claims are **critical** criteria: one hallucinated size fails the rubric whatever the average says. Averages hide exactly the errors that hurt customers.

## Design decisions

- **A criterion that can't run is skipped, not failed.** Without an API key the judge criteria are reported as skipped, the score is computed over what ran, and the report shows coverage. A judge error (refusal, invalid output) is also reported as skipped and never as a silent 0.
- **The judge returns structured output** (`messages.parse` with a Zod schema): a score and reasoning that quotes the evidence. Each criterion is judged 3 times (`JUDGE_SAMPLES`) and the median is kept. When the samples disagree by more than 0.3, the report flags the item for human review.
- **The rubric is tested too.** `selftest.ts` runs the catalog rubric on `targets/synthetic-store/catalog.json`, where `expected-defects.json` lists every seeded defect. It fails if a defect is missed or a clean product is flagged.
- **The catalog comes from an explicit source**: `CATALOG_FILE`, or the target's admin API with `ADMIN_COOKIE`. It never silently falls back to a local file.

Models: `JUDGE_MODEL` and `ASSISTANT_MODEL` default to `claude-opus-5-5`. To test a different assistant, replace `runners/assistant.ts` or pass its answers with `RESPONSES_FILE`.

## Layout

```
rubrics/       rubric definitions + shared scoring
evaluators/    deterministic helpers + LLM judge
runners/       HTTP helpers, Playwright runner, reference store assistant
scenarios/     shopping scenarios + sample answers
targets/       per-store config and catalogs (real snapshot + synthetic store with seeded defects)
reports/       terminal and JSON report
```

## Adding a rubric

1. Create `rubrics/my-rubric.ts` implementing `Rubric`, and return `finalize(...)` from `rubrics/scoring.ts`.
2. Register it in `index.ts`.
3. Mark the criteria that must never fail as `critical: true`.
