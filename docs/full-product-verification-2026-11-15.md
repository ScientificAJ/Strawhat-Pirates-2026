# Full local product verification — 15 November 2026

After the focused science/Sources work, the owner requested a full product test
pass. The existing complete suites and project checks were run against the
updated local implementation. No automated test failed or was skipped.

## Results

| Check | Observed result |
| --- | --- |
| Full Python suite, final code | **640 passed in 57.01 s; 0 failed, 0 skipped** |
| PostgreSQL integration | Ran against separate `nova_ember_test` and `nova_ember_sources_test` databases |
| Actual local gVisor execution | Enabled with `NOVA_TEST_EXECUTION=1`; passed |
| Complete Chrome browser suite | **54 passed in approximately 2.5 min; 0 failed, 0 skipped** |
| Global Ruff | Passed |
| Python formatting | All 164 files passed; final parser/test update also rechecked |
| Global Mypy | 82 source files passed; final parser update also rechecked |
| Web formatting | Passed |
| Web and standalone API-client TypeScript | Passed |
| Generated API-contract drift | Passed |
| Optimized production build | Passed |
| Production JavaScript dependency audit | No known vulnerabilities reported by `pnpm audit --prod --audit-level=moderate` |

The initial full Python run had 639 passing cases. Final review reproduced a
unit-parser error: the exponent in `0.68 mm^2/s` could become an extra scientific
number. The recognized-unit-span correction added one regression, preserving
standalone quantities and rejection of malformed exponents, wrong values and
wrong units. The complete Python suite was then rerun with the final code,
producing the 640-case result above. The 639-case result was not substituted for
the final verification.

Runtime: Python 3.13.18, Node 24.18.0, pnpm 11.20.0, Playwright 1.65.1 and Google
Chrome 157.0.8103.78. The documented gVisor profile was already qualified on this
host, using runsc 20261109.0, one CPU, 1 GiB guest memory and disabled networking.

## Covered product paths

Python tests exercise source adapters/readers, scientific calculations and
numerical boundaries, uncertainty, detailed comparability, evidence planning,
ranking, model registration/domain refusal, artifact provenance, receipt/consent
and approval boundaries, real database persistence, acquisition/upload handling,
scientific workers, execution isolation/interruption and export/recovery.

The browser run covers discovery and exact source inspection, workbenches,
condition/filter binding, real registered fits, scientific figures and linked
dashboards, private uploads, actual local execution and output recovery,
research context, voice controls, source revisions/watches, frozen cases,
portable backup/import, separate local workspaces, system/light/dark appearance,
keyboard behavior, reduced motion and graphics failure/resource lifecycle.

The added Agents workflow uses the real preset catalog and the actual manual
skill/profile editors and storage. It checks frozen role/skill transport after
library edits, separate core/custom chat records, and a structured draft that
requires review and explicit saving. Provider responses in this browser case are
intercepted fixtures; other non-GET requests are blocked.

The Sources flow uses an offline reply fixture with the **actual retained
FLEX-007 source reader**. It checks stable bracket/footer numbering, original
lines 18–19 and their source hash, calculation-input qualifications, unresolved
references, copied limitations, keyboard return, one inspector across replies,
session reset and a dark mobile layout. The same check inspects calculated table
units and point labels without inventing physical source rows.

## One bounded live custom-role check

One actual HTTP/worker request used the built-in Quantitative analyst profile,
Routine routing and the existing model connection/budget. Its frozen snapshot was
`d2e1342353ec1fc3bcdd69fab4fc8aa0ea4ffacf1b95c627547cd7fcc41d549d`.
The request explicitly asked the registered source-simulation tool to prepare
FLEX-007 and separately cite nominal source parameters and calculated results.

Job `b60419ec-da00-413b-b5a2-1bc38f69f1c2` completed using `gpt-6.1-terra`, two
provider calls and an estimated **$0.017906**. Budgets were not increased and no
provider retry was made. The artifact has 241 points,
`parameter_origin=source_reported_nominal`, `requires_open=true`, `autoplay=false`
and idealized endpoint 4.871176470588235 s.

**Two claims passed and one was withheld.** The displayed claims correctly cite
D₀ = 1.82 mm at line 18, kavg = 0.68 mm²/s at line 19, the calculated
D₀² = 3.3124 mm² and the correctly rounded idealized endpoint. An independent
review checked the retained bytes/hash, line anchors, decimal arithmetic, tone
and qualifications and found no incorrect or exaggerated displayed scientific
claim in this case. The extra endpoint digits are arithmetic precision, not
improved measurement precision. The contract establishes that the artifact
requires opening; it does not independently observe a user's current browser.

The obscuration/disruption paragraph cited only the derived model fact, so the
source-origin gate correctly withheld it. Those source qualifications remain in
the artifact limitations. This is an actual incomplete source-citation selection
in the prose reply, not an all-claims-passed result. It was not silently rewritten
or repeated until a preferred response appeared. This single case does not
establish general model reasoning or citation reliability.

## Evidence and limits

Local logs and receipts are retained under
`/tmp/nova-full-product-2026-11-15/`: `python-suite.log`,
`python-suite-final.log`, `browser-suite.log`, `browser-results/`, `ruff.log`,
`python-format.log`, `mypy.log`, `live-custom-research.json` and
`live-custom-research-summary.json`. The live receipt omits browser credentials.

The complete automated suites use offline provider responses/placeholders for
paid inference paths; the single research request above is the separate live
check. No new live voice/microphone, embedding-quality benchmark or every-role
provider evaluation was performed. Real device GPU performance, hosted behavior,
deployment, source completeness, experimental calibration, independence,
physical prediction quality and general semantic entailment remain outside this
local test claim. A source link and passing tests do not certify a scientific
interpretation.

The [science review](science-validation-2026-11-15.md),
[calculation audit](science-calculations-audit-2026-11-15.md) and
[integrity audit](scientific-integrity-audit-2026-11-15.md) record the actual
formula, mechanism, uncertainty and evidence findings and remaining conditions.
