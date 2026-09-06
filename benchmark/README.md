# Image-analysis benchmark

A prompt-engineering feedback loop for `webapp/src/services/ai-analysis.ts`.

Give it an image and a list of fields you expect the model to get right; it runs
the **production** analysis path several times, counts how often each field came
back right, and writes a per-model JSON report that is committed to the repo.
Change the prompt, rerun, and the diff of `results/<model>.json` is the evidence.

```
yarn benchmark                                  # every case, 3 runs each
yarn benchmark --case drill\*                   # one case
yarn benchmark --model gpt-5.4-baseline --runs 5
yarn benchmark --help
```

`--help` works without an API key. An actual run needs one.

## What it does and does not do

- It calls `createAIAnalysisService().analyzeImage(dataUrl, categoryLibrary)` —
  the same entry point `/api-next/analyze-image` uses. Nothing is mocked and the
  prompt is not duplicated here, so a change to `ai-analysis.ts` shows up in the
  scores and nowhere else has to be kept in sync.
- It does **not** touch PocketBase. The "categories already in this inventory"
  vocabulary that a real upload reads from the database is written into the case
  file instead, so a run is reproducible and needs no server.
- Runs are sequential with a short pause between them, because parallel calls
  are the quickest way to get rate limited.

## Adding a case

Drop a JSON file in `cases/` — every `cases/*.json` is picked up automatically —
and put the image in `cases/images/` (JPEG, PNG, WebP or GIF, under 5MB; keep it
small, it is committed).

```json
{
  "name": "drill-on-bench",
  "description": "Single cordless drill — category + manufacturer signal",
  "image": "cases/images/drill.jpg",
  "categoryLibrary": {
    "functional": ["Tools"],
    "specific": ["Power Tools"],
    "itemType": ["Drill"]
  },
  "expectations": [
    { "field": "item.itemType", "expected": ["Drill"] },
    { "field": "item.categorySpecific", "expected": ["Power Tools"] },
    { "field": "item.itemAttributes", "expected": ["Voltage"] }
  ]
}
```

- **`image`** is relative to `benchmark/`, not to the case file.
- **`categoryLibrary`** is optional. Omit it (or omit a tier) to benchmark what
  a fresh install sees — the prompt still renders its curated defaults from
  `webapp/src/services/category-defaults.ts`. Fill it in to benchmark the
  reuse-first ladder, which is the more interesting question.
- **`field`** is a dot path into the `data` object of the `AnalysisResult`:
  `item.*` for a single item, `container.*` for a container,
  `container.containerItems[0].itemType` to index into a list, and `imageLabel`
  / `imageNotes` for the image-level fields. A path that does not resolve scores
  0 — which is what you want when the model classified a container image as a
  single item.
- **`expected`** is a list of acceptable answers; a run hits if *any* of them
  matches.

Case files are validated with Zod before a single call is made, so a typo costs
you nothing.

## How matching works

Both sides are normalised with `slugify` from `@project/shared`, lower-cased,
and have runs of hyphens and spaces collapsed to one space. That is not a
convenience — the analysis prompt tells the model that `power-tools`,
`Power tools` and `Power Tools` are the same value, so the scorer has to agree
or it would penalise the model for a difference the prompt declared meaningless.

Matching is substring-tolerant in one direction: the actual value may be longer
than the expected term, never shorter. `Cordless Drill` satisfies `Drill`, but
`Drill` does not satisfy `Hammer Drill`.

Array fields are flattened. Item attributes are compared as `"name: value"`, so
`"expected": ["Voltage"]` passes on an attribute of
`{ "name": "Voltage", "value": "20 Volts" }` without pinning the value.

## Reading the output

Per field: `hits / total` over the runs, and `score = hits / total`. Per case:
the mean of its field scores. Overall: the mean of the case scores.

```
drill-on-bench — avg 0.83
┌─────────┬───────────────────────────┬───────────────┬───────┬────────┐
│ (index) │ field                     │ expected      │ hits  │ score  │
├─────────┼───────────────────────────┼───────────────┼───────┼────────┤
│ 0       │ 'item.itemType'           │ 'Drill'       │ '3/3' │ '1.00' │
│ 1       │ 'item.categorySpecific'   │ 'Power Tools' │ '2/3' │ '0.67' │
└─────────┴───────────────────────────┴───────────────┴───────┴────────┘
```

Per-field hit counts are the point. A single pass/fail hides the thing you
actually need to know about a non-deterministic model — `2/3` says the prompt is
nearly there, `0/3` says it is not, and a change from one to the other is a
result rather than noise.

Notes appear under the table when a score needs explaining: an empty `expected`
list (which can never be satisfied), or runs that came back as the other
analysis type so the path could not resolve.

If a provider call fails, the error is printed verbatim, that run is dropped
from `total`, the remaining runs are still scored and written, and the command
exits 1.

## Using it on a prompt change

1. `yarn benchmark` on `main` and commit the report (or use the one already in
   `results/`) as the baseline.
2. Change the prompt in `ai-analysis.ts`.
3. `yarn benchmark` again on your branch and commit the updated report.
4. The diff of `results/<model>.json` is the argument for the PR. `scores[]`
   shows which fields moved; `runs[]` holds the raw model output for each run,
   so you can read what actually changed without paying for another run.

Reports are keyed by model — `results/<model>.json`, with anything outside
`[A-Za-z0-9._-]` replaced by `-` — so two models never overwrite each other and
each one diffs cleanly against its own history. Use `--model` to label a report
differently (say, `gpt-5.4-baseline` vs `gpt-5.4-newprompt`); it names the report
only. The model actually called is whatever `AI_MODEL` and `AI_PROVIDER` resolve
to, so change the model by changing the environment, not the flag.

## Configuration

Same AI block as the webapp, read from the repo-root `.env` (the `yarn benchmark`
script loads it): `AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL`,
`AI_EXPERIMENTAL_MODE`, and `OPENAI_API_KEY` / `GEMINI_API_KEY`. Without a key
the runner exits 2 and tells you which variable to set. `AI_EXPERIMENTAL_MODE`
is recorded in the report, since the tool-calling loop and the single-shot path
are worth comparing.

## Layout

```
benchmark/
  cases/            one JSON file per case, plus images/
  results/          committed reports, one per model
  src/
    types.ts        Zod case schemas + report types
    image.ts        file → data: URL (mime sniff, 5MB cap)
    scorer.ts       getField / normalize / fieldMatches / scoreCase — pure
    run.ts          CLI
    scorer.test.ts  node:test unit tests
```

Not a Yarn workspace — `package.json` here only marks the directory as ESM for
`tsx`, and `tsconfig.json` maps `@/*` to `webapp/src/*` and `@project/shared` to
`shared/src`. Because it reads `shared` from source, there is no need to build
`shared/dist` first.

Root scripts cover it anyway: `yarn typecheck`, `yarn lint:check`, `yarn format`
and `yarn test` each include the benchmark, and `yarn test:benchmark` runs the
scorer tests on their own.

## About `cases/images/drill.jpg`

It is a synthetic flat illustration, not a photograph — it exists so the harness
has something committed and tiny to exercise. It scores well on
type/category/attributes and, having no branding, always misses
`item.itemManufacturer`; that expectation is kept deliberately so the report
shows what a miss looks like. Swap in real photographs before reading anything
into the numbers.
