# Nova Ember implementation and acceptance plan

Revised **15 November 2026** against the [active product brief](MASTER_BRIEF.md). This replaces the former screen-by-screen delivery contract; the [original plan](docs/archive/2026-11-15-implementation-plan-before-redesign.md) remains intact for historical traceability. Existing code and dated reports are evidence to inspect, not a reason to reproduce an unhelpful experience.

This plan retains scientific ambition and the foundations needed to support it. It changes the delivery unit from “every named screen exists” to “a person can complete a research task.” Removing a process requirement never authorizes an unsupported scientific result or weaker access protection.

## Current evidence and how to record progress

The [prior full local verification](docs/full-product-verification-2026-11-15.md) records 640 Python tests, 54 browser tests and static/build checks for the **pre-redesign version**. It also records a separate bounded live research request and its withheld source-citation paragraph. Those observations remain historical; they are not fresh tests of the redesigned interface.

For this redesign, record the exact check, source revision, environment, outcome and material limits in a new dated report. A mocked provider checks interface behavior; a real request checks the configured service for that request; neither establishes general answer quality. Do not mark a journey accepted solely because its route loads.

The [redesign report](docs/product-redesign-2026-11-15.md) records the implemented journeys, local checks and bounded live observation. Checked items below refer to that evidence; public deployment and unperformed acceptance remain open.

## Delivery work

### 1. Reorganize the product around research

- [x] Replace workspace creation/selection and administrative navigation with clear entry points for questions, investigations, comparison, data analysis and returning to research.
- [x] Replace the home page's arbitrary FLEX analysis and case-first setup with useful starting topics and actual recent activity. Keep FLEX analysis accessible in its relevant context.
- [x] Ensure submitting the home question starts a real assistant request exactly once. Preserve the question on failure and make retry understandable. Refreshing a completed request must not send it again.
- [x] Introduce investigations through their purpose and available evidence; make the catalog and additional studies easy to reach. Keep source identifiers and detailed provenance inspectable.
- [x] Make comparison begin with selecting relevant studies and explain the resulting differences before advanced run/cohort analysis or ranking.
- [x] Make data work begin with a source or a useful operation, carrying selected evidence into tables, charts, calculations and exports.
- [x] Integrate assistant answers, sources, artifacts and next actions into that journey; reveal advanced role/model/context controls when useful.
- [x] Surface automatically saved conversations, searches and analyses alongside deliberate notes. Preserve prior data, revision conflicts, backup/import and optional notebooks.
- [x] Apply the same language, hierarchy, responsive behavior and state handling to secondary features. Keep useful custom roles, dashboards, evidence planning, uploads, media and execution accessible without putting them ahead of research.

### 2. Check scientific meaning where the redesign changes presentation

- [x] Inspect displayed study summaries, headings and source labels against the retained originals. Keep objectives, hypotheses, prospective impacts and findings distinct.
- [x] Check that simplified tables and charts preserve units, origin, missingness, raw values and source inspection. Confirm no placeholder, demonstration or assumed value appears as a NASA measurement.
- [x] Exercise known-answer numerical paths and important refusal boundaries affected by the UI: units, oxygen basis/pressure, descriptive fits, ranking criteria, comparison/pooling and model-domain checks.
- [x] Check that an assistant citation opens the actual recorded source location, and that a calculated result identifies its calculation and source inputs.
- [x] Check that condition differences and material limitations remain visible at the point where a comparison, fit, control assessment or Earth-transfer interpretation depends on them.
- [x] Record unresolved source meanings and missing calibration/independence explicitly. Do not repair them by relabeling the interface.

### 3. Follow complete journeys

| Journey | Acceptance observation |
| --- | --- |
| First visit → question → answer → cited source | A new visitor can describe the product, submit once, see progress and an answer or useful failure, inspect a citation, and continue the same research |
| Find → understand → select → compare | Search/topics reach relevant investigations; their purpose is understandable; two selections reach comparison with real differences and source links |
| Investigation → source records → data → chart/export | The selected source and rows survive transitions; displayed units and exported values agree; provenance is retained |
| Data → descriptive fit or qualified refusal | Calibrated source inputs yield the registered result; incomplete inputs explain what is missing; a fit is not presented as a predictor |
| Safety-control or Earth question → evidence → qualification | The result identifies research support and the missing application-specific validation without implying equipment certification or automatic Earth equivalence |
| Return → saved research → resume | Existing conversations/notes/analyses can be found and reopened without creating or choosing a workspace |
| Backup → restore → reopen | Backup contents and limits are clear; import preserves existing work and source references; copied work can be reopened |
| Failure → recover | API/model failure, cancellation, missing source and storage failure preserve available drafts/selections and offer a meaningful next action |

Use real retained scientific sources for source/data journeys. Provider fixtures may make UI regressions deterministic; label them in the verification report and include a bounded live request when credentials and existing spend bounds allow it. Do not create a general reliability claim from that single live request.

### 4. Inspect usability and accessibility in the rendered app

- [x] Inspect the essential journeys at desktop, narrow tablet and phone widths; check overflow, reading order, touch targets and usable tables.
- [ ] Complete primary navigation, question submission, filter selection, source inspection and dialog return with the keyboard; verify visible focus and names for controls.
- [ ] Inspect light/dark themes, reduced motion, zoom/reflow and loading/empty/error/disabled states relevant to the changed components.
- [x] Run the project's relevant TypeScript, formatting and production-build checks. Run focused scientific/backend checks when affected; broaden after failures or changed enforcing boundaries justify it.
- [ ] Record representative newcomer and researcher feedback when available. Until sessions occur, report them as unperformed; developer inspection is not a user study.

The redesign report records completed keyboard/focus, theme, reduced-motion and state checks. The broader items above remain open where full keyboard journeys, browser zoom, actual assistive devices or representative feedback have not been observed.

Automated accessibility checks supplement rendered inspection. Neither establishes assistive-technology compatibility by itself. Actual screen-reader/device and microphone/audio checks remain separate observations.

### 5. Deploy and verify the public product

- [ ] Identify an available host and confirm the specific plan, actual entitlement, cost/expiry, persistent storage and network/runtime support. Use existing authorized infrastructure when suitable. A new billing or provider commitment needs the owner's decision.
- [ ] Deploy the same reviewed revision with secrets outside source/browser bundles, HTTPS, the same-origin API, durable PostgreSQL/files and a running worker. Qualify isolated execution on that host before enabling it.
- [ ] Exercise public browsing, source inspection, comparison, analysis/export, assistant response and private-job denial on the actual origin. Verify saved browser work and backup/import there.
- [ ] Confirm behavior during a provider outage, worker restart and expired temporary input. Preserve browsing and supported deterministic analysis when paid services are unavailable.
- [ ] Make a database/files backup and restore it independently before claiming recovery. Keep a known working revision and record the actual rollback procedure and any untested step.
- [ ] Record the public URL, deployed commit, source version, live checks and limits. A successful push or local production build does not close these items.

### 6. Prepare the submission

- [ ] Follow the [submission guide](docs/submission-guide-2026-11-15.md), record an honest short demonstration and include the verified public URL when available.
- [x] Read the official challenge Details and Resources in the browser on 15 November 2026 and record the resource list in the [product brief](MASTER_BRIEF.md#communication-references).
- [ ] Check current submission requirements, including applicable source, license and disclosure requirements. Recheck the resource list for later changes at submission time; do not infer governing rules from an old plan.
- [ ] Link the actual source/data references, reproduction instructions, known limits and verification report. Keep the project’s own visual identity and preserve required third-party notices.
- [ ] Review the completed form and assets before submission; preparation does not establish that publication or submission occurred.

## Reassessment of the previous unfinished work

| Previous item | Decision | Reason and retained obligation |
| --- | --- | --- |
| W17: 300 representative tasks, 1,000 independently labeled fields, held-out evaluation and broad retrieval/answer metrics | **Adapt now; defer the fixed-size benchmark** | Use source-specific known-answer/regression checks, essential end-to-end tasks and a documented bounded live check for this release. Retain independent labels, held-out evaluation and stratification when making broader quality or predictive claims. The smaller checks are not equivalent to the old benchmark and do not establish general reliability. |
| W06: reviewed extraction, unresolved source meanings, calibration and lineage | **Retain, targeted by actual use** | Review every field supporting a displayed scientific claim or active quantitative workflow. Leave unresolved FLEX headers, burning-rate units and pressure reference unresolved. Keep unsupported sources inspectable; expand scientific interpretation only with appropriate source evidence. |
| W15/W18: complete device and assistive-technology matrix | **Adapt to changed journeys; retain remaining coverage as a backlog** | Keyboard, responsive layouts, focus, contrast, themes, zoom and relevant state checks are practical release work. Actual assistive devices and broader browsers still need testing before claims about them. No claim of comprehensive accessibility follows from a narrow automated pass. |
| W15/W18: formal scientist/student usability sessions | **Adapt to practical task observation** | Seek a small number of representative walkthroughs and fix concrete misunderstandings. A formal study is not a release gate for a hackathon; absent feedback remains an explicit evidence gap. Product clarity remains a requirement. |
| W13/W18: actual microphone, audible playback and spoken scientific fidelity | **Retain for a voice claim; separate from core text workflow** | Voice controls and mocked transport do not demonstrate a working microphone, intelligible audio or faithful spoken units. Test real hardware/service or describe voice as unverified in the demonstrated environment. |
| W18: measured performance targets | **Adapt** | Measure meaningful routes and a representative dataset on the intended host; separate network/model wait from UI and calculation time. Retain practical bounds and fix observed delays. Do not promise the old universal latency numbers without the workload and measurements. |
| W19/W20: independent canonical database/files restore and release rollback | **Retain for deployment, scaled to one host** | Protect original scientific files and usable releases. A portable browser backup is a different recovery path. One verified restore and a practical rollback procedure are more useful than an unperformed operations checklist. |
| W19–W21: hosting, public deployment, hosted acceptance and handover | **Retain with a concise operating guide** | Public use needs a real service and live checks. Keep host qualification, secrets, access boundaries, budgets, persistence and recovery. Remove ceremonial whole-system signoff and document an actual owner/start/recover path. |
| UI62: Storybook | **Remove as a release requirement** | It is not necessary for these research journeys. Verify actual component states in the running app and preserve reusable styles/components. Introduce a catalog later if component development demonstrates the need. Storybook was not completed by this decision. |
| Standalone brand-asset/composition review packet | **Adapt** | Keep the actual wordmark/icon, coherent visual rules and rendered desktop/mobile evidence. A separate presentation packet is unnecessary unless submission or asset reuse requires it. Do not invent an asset review that did not occur. |
| User-facing workspaces and required manual case setup | **Remove from the product journey** | They impose management before value. Preserve automatic persistence, optional notes, revisions, backups and existing research records. Internal storage names can remain implementation details. |
| Existing safeguards described as “enterprise” | **Retain when they protect the actual product** | Source integrity, authorization, private receipts, execution isolation, resource/spend bounds and recovery address real risks. Remove complexity by improving presentation and scope, not by disabling enforcement. |

## Carry-forward map for the original feature inventory

This mapping preserves accountability without requiring the previous screen design. Feature IDs below refer to the [archived original definitions](docs/archive/2026-11-15-implementation-plan-before-redesign.md#complete-feature-traceability-f01f20).

| Original features | New product home and preserved substance |
| --- | --- |
| F01 discovery, F02 dossiers | Investigations, source inspection and assistant source links |
| F03 comparison, F05 ranking | Compare and question-specific criteria; explicit applicability/support differences |
| F04 scenarios, F07 materials, F08 detection, F09 extinction, F10 hardware, F17 controls | Relevant investigation/analysis/question context rather than a required series of setup screens |
| F06 visual analysis/dashboards, F13 execution, F14 modeling | Data and analysis, artifacts and advanced tools; calibrated data, isolation and prediction gates retained |
| F11 assistant, F12 context/voice | Research assistant throughout the journey, with inspectable sources and optional voice |
| F15 contradictions/gaps, F16 hypotheses/next research, F18 Earth transfer | Evidence interpretation and research planning, exposed when the question calls for them |
| F19 notes/revisions | Saved and recent research, automatic continuity, optional notebooks and portable backup |
| F20 exports/API/MCP | Reusable data/results with provenance and the existing read-only external interfaces |

The [complexity reassessment](docs/complexity-reassessment-2026-11-15.md) records the actual service/dependency check, including Sentry’s absence, and the specific research or risk each retained foundation serves.

## Important open evidence

Source completeness, scientific calibration, independent experimental units, broad retrieval/answer-quality evaluation, validated run-level prediction, representative user feedback, actual assistive-device/voice behavior and public deployment are distinct from implementing a clear interface. Preserve each gap until corresponding evidence exists. The redesigned product can deliver useful source exploration and analysis while stating those limits accurately.
