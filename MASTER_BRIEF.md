# Nova Ember product brief

Revised 15 November 2026 for the product redesign. This is the active product direction; [AGENTS.md](AGENTS.md) governs engineering practice. The former brief and plan remain [archived without changes](docs/archive/README.md), including their detailed source audits and historical requirements. Dated implementation reports describe the versions they tested; they do not override the current source or establish that the redesigned product has passed acceptance.

**Nova Ember helps people turn NASA combustion research into an answer they can inspect and use.** It is developed by team **StrawHat Pirates** for the NASA Space Apps [Flame in Freefall challenge](https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/). Its audience includes undergraduates, professors, aerospace researchers and engineers. A curious newcomer should understand the main journey without learning the application's internal data structures first.

## Purpose and success

The challenge calls for an interactive scientific dashboard that summarizes, ranks and interprets NASA's microgravity combustion research for fire safety in human space exploration. Nova Ember must connect those activities into useful research, rather than provide a separate screen for each verb.

Two tests guide product decisions:

1. Can a person understand what the product and its scientific content are telling them without another tool translating the interface?
2. Can they complete a useful research workflow from a question to evidence, interpretation and a reusable result?

Accessible explanations and scientific depth belong together. The product should help someone investigate how a material burns, how atmosphere and ventilation affect an experiment, what a smoke detector measured, or which evidence could inform a suppression approach. It should also help researchers extract inspectable data for modeling and consider potential Earth applications with appropriate transfer limits.

The objective is research support. Operational equipment selection, certification, habitat design limits and validated predictions require evidence beyond a retrieved paper, a successful calculation or a fluent answer.

## Research journeys

| Starting question or need | Coherent path | Useful result |
| --- | --- | --- |
| “What changes when fire burns in microgravity?” | Ask a question → read a source-grounded explanation → open the cited investigation and evidence → follow a related question | An understandable explanation with sources and a natural next step |
| “Which investigations address flame spread in solid materials?” | Browse or search investigations → read their purpose → select relevant studies → compare experimental conditions and evidence | A reasoned shortlist; relevance and scientific applicability remain distinct |
| “Can these two results be compared?” | Select investigations or records → inspect condition differences → open source details → apply a supported calculation or explain the missing information | Side-by-side evidence without an unsupported pooled conclusion |
| “I need data for a combustion model.” | Open an investigation → inspect available source files and tables → select data → chart or export → fit a supported calibrated trace | A source-bound dataset or analysis with units, transformations and limits |
| “What evidence could inform detection or suppression?” | Find relevant investigations → inspect mechanism, apparatus and endpoint evidence → ask about the selected context → record the evidence and validation still needed | Research relevant to a control or equipment question, without implying operational suitability |
| “Could this research help on Earth?” | Find source-described applications → inspect the proposed mechanism and the changed conditions → retain the difference between hypothesis and demonstrated transfer | A traceable research connection with the remaining transfer question |
| “I want to continue yesterday's work.” | Return to recent research or saved items → reopen the question, investigation or analysis → continue | Continuity without creating or choosing a workspace |

A workflow can end in a useful limitation: for example, identifying that calibration or comparable conditions are absent. Such an outcome should explain what is missing and the next useful action; it should not appear as an unexplained disabled tool.

## Information architecture

The primary experience follows **start a question, find investigations, compare evidence, work with data, return to research**. Existing technical routes may remain for compatibility. Their names and prominence should serve these tasks.

### Home

Explain the product in a short sentence and make asking a question the primary action. Submitting the question starts the research assistant; it must not merely store a draft that requires an unexplained second submission. Show understandable research topics and links into the catalog. For returning visitors, surface recent questions and saved research based on actual activity.

Do not show an arbitrary investigation-specific chart, require a case, or fill space with metrics that do not help the visitor choose a next step. FLEX endpoint analysis remains available in its relevant scientific context.

### Investigations and evidence

An investigation is a NASA research study, not an application object the visitor must manage. Lead with its research purpose, what it examines, and useful ways to explore it. Make additional investigations easy to discover. Cards support an initial overview; tables and detailed filters support closer inspection.

Show the study's question and original evidence before provenance machinery. Exact source versions, hashes, adapters and locators remain available through source details and exports. An objective or proposed benefit must not be relabeled as a finding.

Simple search and concise filters should work without technical preparation. Literal matching, semantic retrieval and scientific ranking have different meanings. Labels and explanations must reflect the implementation rather than claim a relevance order that is actually alphabetical.

### Comparison

Start by choosing relevant investigations, with clear empty-state guidance and selection feedback. Show what each study investigated and which conditions match, differ or lack enough information. Keep side-by-side reading useful even when quantitative pooling is unsupported.

Run/cohort comparison and explicit ranking policies belong with the research question and evidence they need. A ranking needs inspectable criteria and supporting assessments. It is not a safety score; a semantic match is not proof of physical equivalence.

### Data and analysis

Lead with a useful action: explore a source table, visualize selected data, export data, calculate a quantity, or fit a trace. Carry the selected investigation and source context into the next step. Reveal advanced configuration, schemas, code execution and detailed methods when required by the task.

Preserve dataset queries, charts, media measurement, uploads, registered methods, descriptive fits, model-domain checks and isolated Python/shell. Do not require a visitor to understand every tool before starting one. A model's data and validation needs should be understandable at the point of use.

### Research assistant

The assistant participates in the same journey as browsing and analysis. It can use the existing scientific tools, explain selected evidence, produce source-linked answers and prepare useful artifacts. The conversation should focus on the question, answer, sources and next action. Model routing, custom roles, plans and advanced sharing controls should not dominate the main experience.

Conversations persist automatically when storage is available. Users can return to prior questions without creating a notebook first. Voice, context inspection, artifact review, interruption and explicit approvals remain available where relevant. Private inputs still require the applicable consent; simplifying the interface does not authorize their disclosure or bypass server controls.

### Returning, saving and settings

Remove user-facing workspace creation, selection and management. Handle ordinary research continuity automatically. Saved conversations, searches, analyses and optional notes should be findable together, while keeping their actual storage formats and provenance intact.

Saving an investigation should feel like keeping it for later, rather than starting an administrative process. A notebook can hold deliberate notes and revisions; it is not a prerequisite for asking, comparing or analyzing.

Explain storage when it matters: backing up, restoring, clearing data, changing devices or recovering from a storage failure. Preserve existing work, portable backups, revision protection and the distinction between saved browser records and temporary server files. Do not imply cloud sync that does not exist.

## Scientific contracts

These contracts apply regardless of how much detail is visible at first:

- Keep source measurements, source-reported conditions, deterministic calculations, assumptions and model interpretations distinct. Preserve original values alongside transformed values.
- Keep source identifiers, exact locators, units, experimental conditions, method versions and transformation steps with derived results and exports. A filename, chart or citation alone does not establish correctness.
- Missing measurements remain missing. Do not infer a species, pressure reference, composition basis, calibration, uncertainty or independent experimental unit from a convenient label.
- Explain material condition differences before pooling or transfer. Source-table rows, video frames and campaign labels are not automatically independent experiments.
- Keep failed ignition, visible extinction, cool-flame cessation, disruption, intentional termination and observation end distinct. Counting test-end labels does not measure suppression effectiveness or fire probability.
- Descriptive trace fits describe the selected calibrated data and interval. Prediction requires a separately qualified model, independent evaluation and supported conditions. No default prediction is implied by a fit or by an idealized analytical visualization.
- Preserve explicit ranking policies, criteria, missing assessments and stable tie-breaking. Relevance, applicability, evidence quality and modeling readiness remain separate judgments.
- Safety-control assessments describe research support, tradeoffs and missing validation. Earth-transfer assessments distinguish mechanisms and hypotheses from established application evidence.
- Important limitations belong beside the interpretation or decision they affect. Deeper methods and qualifications remain inspectable without repeating a wall of warnings on every screen.

The [methods reference](docs/methods.md), [data dictionary](docs/data-dictionary.md), [source inventory](docs/data-sources.md), [calculation audit](docs/science-calculations-audit-2026-11-15.md) and [scientific-integrity audit](docs/scientific-integrity-audit-2026-11-15.md) explain the implemented boundaries. The audits are bounded historical reviews, not universal validation.

## Technical foundations to preserve

| Responsibility | Existing implementation and constraint |
| --- | --- |
| Interface and API | Next.js/React/TypeScript and Python/FastAPI; generated contracts and a same-origin API |
| Source corpus | Versioned NASA PSI metadata, retained original files, source-specific readers and exact evidence anchors; catalog presence does not imply every file is acquired or interpreted |
| Search and analysis | Literal and semantic retrieval, typed record queries, condition-aware comparison, registered numerical methods, charts, datasets and source-bound exports |
| Research assistance | Existing model connection and typed tool registry; mechanical source/numeric/domain checks and explicit approvals remain authoritative |
| Personal continuity | Browser documents, conversations, notes, revisions and preferences; existing data must survive the visible redesign |
| Private tasks | Opaque browser receipt protects temporary jobs, events, uploads, results and downloads; expiry/deletion and independent-browser denial remain enforced |
| Computation | Supervised worker, PostgreSQL jobs and bounded scientific methods; Python/shell require a qualified isolated execution host |
| Operations | Secret isolation, resource/spend bounds, redacted errors, persistent database/files and a practical recovery path |

Use existing capabilities before adding services or dependencies. Removing workspace controls does not require discarding the internal storage implementation. A product redesign is not a reason to weaken access checks, scientific checks, execution isolation or cost controls.

## Evidence, acceptance and release

The [implementation plan](IMPLEMENTATION_PLAN.md) defines practical acceptance and reconsiders the previous backlog. Preserve dated reports and their limitations. A check passing for an earlier interface is useful baseline evidence, not proof that its redesigned workflow still works.

Current source-specific gaps include unresolved FLEX headers/units and reference conditions, calibration and lineage review, incomplete acquisition/interpretation, experimental independence, broad retrieval/answer quality evaluation and predictive validation. Keep unsupported cases explicit rather than fabricating data to complete a screen.

Public deployment needs its own evidence: an actual host, HTTPS, persistent scientific data, a running worker, functioning API streaming and applicable isolation, followed by live workflow checks. No public URL or hosted success is established by this brief. A local build, commit or push proves only that step.

## Communication references

NASA's [Studying Combustion and Fire Safety](https://www.nasa.gov/missions/station/iss-research/studying-combustion-and-fire-safety/) explains the physical setting before introducing investigations and connects them to concrete research uses. NASA Glenn's [Combustion Science overview](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/) organizes studies by purpose and links deeper resources. Nova Ember should apply that clarity: establish context, explain what a study helps investigate, and offer the next useful action. NASA branding is not the design system.

The official challenge Details and Resources were read in the browser on **15 November 2026** after the initial direct fetch failed. The listed resources are:

| Resource | Research role |
| --- | --- |
| [PSI combustion search](https://psi.nasa.gov/physci/repo/search?q=combustion) | Original investigation records and their available files |
| [NASA Glenn Combustion Science](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/) | Scientific context and investigation connections |
| [NASA ScienceCasts video](https://www.youtube.com/watch?v=W1oXykoz9zg) | Introductory communication about combustion research |
| [A Researcher’s Guide to Combustion Science](https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/) | Researcher introduction, published October 2015 |
| [Apollo 1](https://sma.nasa.gov/sma-disciplines/accllp/apollo-1), [Apollo 13](https://sma.nasa.gov/sma-disciplines/accllp/apollo-13), and [Mir fire history](https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/) | Fire and oxygen-system incident context, distinct from experimental data |
| NASA Spinoff: [air tanks](https://spinoff.nasa.gov/node/9582), [smoke detector](https://spinoff.nasa.gov/node/9407), [protective attire](https://spinoff.nasa.gov/node/9918) | Source-described Earth technology applications |

The live PSI combustion search returned **26 investigations** during that check, while the retained application corpus contains **24**. This is a source-freshness difference to inspect through the existing discovery/refresh path, not evidence that the extra records have already been acquired, interpreted or validated. Preserve the reproducible retained corpus while reviewing additions.

The [complexity reassessment](docs/complexity-reassessment-2026-11-15.md) explains which services, safeguards and verification practices serve these research tasks. The [submission guide](docs/submission-guide-2026-11-15.md) keeps release and submission facts separate; current competition rules still need their own check.
