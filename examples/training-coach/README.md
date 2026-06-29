# training-coach (example capability)

The canonical lathe example: pull training from Strava, keep it in your own store, and
build/check a plan against a coaching methodology. It also serves as the happy-path fixture
for `lathe check` tests.

Files:
- `capability.yaml` — the manifest (sources, schema, locked metrics, tools, emit).
- `SKILL.md` — the skill body the model reads.

> Note: `capability.yaml` references `./methodology.pdf` and `SKILL.md` mentions it too, but
> the PDF is **not included** — it stands in for a real periodization document you'd supply.
> `lathe check` validates manifest *structure*, so a missing reference file does not fail the
> check today (reference-existence is a semantic check for a later milestone).
