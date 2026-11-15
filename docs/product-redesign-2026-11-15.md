# Nova Ember product redesign — 15 November 2026

This records the implemented redesign and its local verification. The [active brief](../MASTER_BRIEF.md) defines the product; the [acceptance plan](../IMPLEMENTATION_PLAN.md) preserves remaining work. Original plans and dated reports remain in place or in the [planning archive](archive/README.md).

## Challenge and product decisions

The official [Flame in Freefall challenge](https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/) Details and Resources were read in the in-app browser. NASA Glenn's combustion overview, the researcher's guide introduction and the live PSI catalog were also inspected. The product serves combustion research for crewed spacecraft, stations and future habitats: discover, summarize, compare, rank and interpret relevant investigations; extract data supporting modeling; investigate prevention, detection, suppression and equipment; consider separately supported Earth applications.

The application now starts with that research. Investigations, Compare, Data & models, Research assistant and Your research form the primary navigation. There is no workspace selection or required case creation. The home question actually submits research, and returning visitors see their own recent work. The arbitrary home FLEX analysis moved into the relevant FLEX investigation. Optional notebooks, source refresh, custom roles, dashboards, code, images/video and advanced methods remain available in their research context.

Investigations lead with purpose and approach. Comparison first explains the selected studies, with advanced matching/ranking available when warranted. Data work starts from the selected investigation or a deliberate source choice, preserves original columns and values, and carries the applied selection into charts, saved analyses and exports. Scientific qualifications appear beside the result they qualify; exact sources and full records remain inspectable.

The assistant keeps the question, answer, citations and useful next actions together. Retrieved source tables do not automatically displace the answer with a split panel. Completed output starts at the exchange rather than its final citations. Generated figures and calculations can still open alongside the conversation; all retrieved evidence remains accessible. Advanced roles, layout and context controls are secondary.

Your research brings conversations, bookmarks, analyses, comparisons, notes and saved files together. Existing separated browser libraries are imported once, atomically, while their originals remain intact and internal references are remapped. Exact saved analyses reopen with their source, selection and chart. Saved export copies can be downloaded after remote artifact access expires. Restoration keeps its success message visible and lets the user choose where to continue. Selection persistence starts immediately through the existing revision-checked write chain, so fast navigation does not discard a pending handoff to notes; no new storage cache or service was introduced.

No external service or application dependency was added. The [complexity reassessment](complexity-reassessment-2026-11-15.md) explains retained safeguards and deferred or removed process requirements. There was no repository Sentry integration to remove. The fixed-size benchmark, Storybook and standalone brand review packet are not automatic release gates; their removal or deferral does not count as having performed them.

## Connected workflow evidence

| Journey | Observed local result |
| --- | --- |
| Home question → assistant | Actual submission, progress and a bounded live, cited answer; deterministic tests cover single submission, reload, interruption and simultaneous tabs |
| Answer → original source → investigation | Numbered references open exact retained locations; the retained live answer's BASS approach passage was read and its BASS-II link followed into the source table, retaining the same source version, without another paid request |
| Discovery → study → comparison | Source-backed catalog, filters, saved collections and selected investigations reach real side-by-side differences and source links; contextual questions carry that selection |
| Investigation → data → CSV → reopen | Real BASS-II records, selected columns, exported CSV bytes and the reopened analysis agree; saved artifact bytes remain downloadable without remote access |
| Data → chart and fit | Real source charting and exports; a declared synthetic analytical trace yields the independently known slope **0.002** and both fit/residual figures; it is not labeled a validated predictor |
| Controls and Earth applications | Evidence remains linked to its original sources; personal applicability assessments reopen with exact evidence and stale-input warnings; no equipment certification or automatic Earth equivalence is inferred |
| Return and recovery | Saved questions and specialist sessions reopen; two-tab legacy import preserves originals/references; current and legacy backups preserve revisions and reject invalid imports atomically |
| Failure and concurrent edits | Failed draft save retains the question; interrupted submission reuses the same operation; stale query/chart responses cannot replace newer edits; source switching clears source-specific rules; cancellation, private input consent and private-job denial remain enforced |

## Live assistant observation

The question submitted from home was:

> Which NASA investigations help me study airflow and flame spread in spacecraft materials? Compare their experimental approaches briefly and cite the original NASA sources.

Early real requests exposed faults that fixture-only checks had missed: evidence gathering could exhaust the allowance before an answer; generic preview limits discarded useful dossier excerpts; incomplete model output could escape the worker; and incidental numeric details caused otherwise useful comparisons to be withheld by the numeric verifier.

The implemented pipeline reserves half of the original request allowance for final synthesis, carries compact source-preserving dossier previews into that stage, and handles incomplete model output as an incomplete request with retained evidence. Gathering and synthesis share accounting and unique paid-step identifiers. There is no automatic paid retry or increased request cap. Both actual phase instructions and settings are recorded for reproducibility.

For introductory discovery and brief method comparisons, final synthesis now leads with supported qualitative distinctions. Numerical statements still require the exact reviewed quantity and unit; the numerical verifier was not relaxed. An actual-source regression accepts a qualitative BASS-II/Cygnus distinction while continuing to withhold an unsupported numerical setting.

The final live observation used prompt **scientific-research-v10** and completed with **four accepted claims, six cited investigation dossiers, no withheld claims and three provider calls**, costing **$0.064396** under the existing **$0.10** request cap. It distinguished BASS/BASS-II controlled material experiments, the larger-scale Saffire series aboard Cygnus, and the related modeling investigation. It stated that the inspected descriptions support experimental approaches and objectives rather than measured comparative effects. No page errors were observed. This is evidence for that request, not an independent benchmark of general answer quality or causality.

The [assistant capture](redesign-2026-11-15/assistant-desktop.png) displays that retained live answer reopened for rendered/source inspection. Other [screenshots](redesign-2026-11-15/) show the actual implementation. They are not concept art or user-study results.

## Checks and environment

Implementation revisions: research pipeline `beab3080625e46609ac335b811fc93fe32331b27`; interface and continuity `8a3edc88cea080b83dc2312f44b430f8b44c99a7`.

Local Next.js/FastAPI, PostgreSQL and the supervised worker were running at `http://127.0.0.1:3100`, using retained source version `d2e1342353ec1fc3bcdd69fab4fc8aa0ea4ffacf1b95c627547cd7fcc41d549d`. Browser automation used installed Chrome through Playwright. API/worker data, calculation, export and isolated execution paths were exercised against the real local services. Provider fixtures made assistant interaction, consent and voice transport tests deterministic; they are distinct from the bounded live request above.

- Python suite: **511 passed, 138 skipped**. The skipped integration tests require a separately configured PostgreSQL test database; they were not reported as passes. Browser checks used the running application database.
- Browser suite: **65 passed in the final full run (1.6 minutes)**. Earlier runs exposed restore-confirmation/navigation assumptions and the actual delayed-selection handoff defect; these were corrected before the successful final run. The strict handoff/backup regression also passed three consecutive targeted repeats with the original debounce timer deliberately delayed. A long-reply regression checks that the completed answer remains in the reading viewport while retrieved source tables stay available on demand.
- TypeScript including contract-client types, generated API contract consistency, web formatting, Python lint/format checks and the optimized production build passed. Focused research regressions and type checks passed after the phase-instruction recording correction.
- Rendered checks covered desktop, phone and narrow tablet views, light/dark themes, bounded source tables, keyboard focus/return, reduced motion and relevant loading/empty/error states. Home reflow had **zero horizontal overflow at 320px and 768px**. Desktop/mobile source and assistant views were inspected. CSS magnification alone was not treated as proof of browser-zoom acceptance.
- Independent review examined migration atomicity, history destinations, query/chart/export races, saved artifact recovery and the research budget/source pipeline. Reported issues were corrected and verified; review agreement alone was not used as evidence of correctness.

Useful commands:

```sh
pnpm typecheck
pnpm contracts:check
pnpm web:format:check
pnpm lint
pnpm format:check
pnpm build
python3 scripts/python.py -m pytest -q
NOVA_BROWSER_CHANNEL=chrome pnpm exec playwright test --workers=2 --reporter=line
```

## Limits and unfinished release evidence

The application remains **local only**. A source push and production build do not establish a public deployment. Hosting entitlement/runtime suitability, HTTPS and persistence on the selected host, hosted acceptance, independent server backup/restore and rollback remain open. No new hosting account, billing commitment or public submission was made.

The live PSI catalog showed 26 results while the retained application corpus contains 24 investigations. No new scientific interpretation was silently promoted to close that difference. Unresolved FLEX headers, burning-rate units and pressure reference remain unresolved; source rows are not treated as independently verified runs. Calibration, comparability, uncertainty and predictive-domain requirements still apply. Broader held-out retrieval/answer evaluation and validated prediction remain separate work.

Actual microphone/audio fidelity, screen-reader/device testing, comprehensive browser zoom coverage, representative researcher/newcomer feedback and the prescribed large benchmark were not performed. Automated voice transport and accessibility-related checks do not establish those outcomes. Submission assets, current governing requirements and the final public form still need the checks described in the [submission guide](submission-guide-2026-11-15.md).

## Correction after the catalog follow-up — 15 November 2026

The earlier 26-versus-24 observation above compared a broad keyword search with a research-area-specific corpus. It did not establish two missing combustion investigations. Rechecking the official PSI interface with the **Combustion Science** category and no keyword restriction returned **24 investigations**; an exact identifier comparison found no missing or extra investigations in the retained set. The broad search's other matches are **PSI-181**, a Materials Science solder study, and **PSI-108**, a Fluid Physics convection study. Their descriptions mention combustion, which explains the keyword matches.

NASA's [Combustion Science overview](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/) also describes **SoFIE, FLARE and FM2**, outside this retained PSI set. These are useful broader research/context sources, not evidence of downloadable PSI datasets for those studies. The official challenge explicitly describes partial-gravity combustion data as currently unavailable in PSI, with LUCI and FM2 expected as future sources. Full metadata coverage of the current category remains distinct from full raw-data acquisition, scientific interpretation and coverage of NASA's wider research program.
