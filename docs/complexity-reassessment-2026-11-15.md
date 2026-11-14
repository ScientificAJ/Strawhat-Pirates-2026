# Product complexity reassessment — 15 November 2026

The redesign prioritizes doing research over managing the application. A feature, service, safeguard or test earns its place through a specific user need or demonstrated risk. “Enterprise” is not a useful yes/no rule: some mechanisms protect the actual research, while others add decisions, dependencies or process without helping it.

This is a repository/source audit and product decision record. It does not claim external account inspection, hosted operations, new dependency removal or production verification.

## Actual services and monitoring

The checked manifests, lockfiles, application source, startup scripts, example configuration and infrastructure contain **no Sentry dependency, SDK initialization, DSN setting or Sentry service**. The active brief and plan do not require it, and the archived pre-redesign brief/plan contain no Sentry reference either. There is therefore no repository Sentry integration to remove or disable. A service mentioned in earlier discussion is not evidence that it was deployed.

No Datadog, Honeybadger or PostHog integration was found in those same project files. The available connected tools in a development environment do not make them application dependencies.

The current application uses Next.js, a FastAPI API, PostgreSQL/pgvector, a supervised worker and persistent scientific files. NASA PSI/NTRS are source providers. OpenAI is the configured model provider for requested reasoning, semantic retrieval and voice. Python/shell use the project’s qualified isolation runtime rather than a separate execution vendor. No new external service is required by this redesign.

OpenTelemetry appears transitively in the Python lockfile through FastAPI/MCP, and as an optional Next.js peer entry. Those package records do not establish an exported telemetry connection. Research and custom-role requests explicitly set `tracing_disabled=True` and `trace_include_sensitive_data=False`; startup disables Next.js telemetry. This check does not claim that every transitive library’s internal behavior or an external hosting account was audited.

Use the existing health endpoint, bounded job state and redacted process logs to diagnose this single-host product. Add an external monitoring service only if a concrete operational problem warrants its cost, data handling and maintenance, under the applicable authorization. Monitoring is not a prerequisite for making the research journey understandable.

## What stays, what changes, and why

| Mechanism | Need or risk it addresses | Proportionate decision |
| --- | --- | --- |
| Workspace creation/selection | No necessary research need before asking, browsing or analyzing | Remove from the visible journey; reuse internal storage without forcing users to manage it |
| Automatic recent research | Returning to a question, comparison or analysis | Keep continuity automatic; show actual prior activity rather than require a case |
| Optional notes and saved items | Deliberate reasoning and keeping evidence for later | Retain without mandatory setup; use plain labels and useful return links |
| Portable backup and revision protection | Browser data loss, moving devices, conflicting edits | Retain; explain storage and recovery at backup/restore or real failure, not across every screen |
| Source hashes, versions and exact anchors | Traceability, changed sources and reproducibility | Retain in the data and exports; progressively disclose implementation detail |
| Source refresh and selective acquisition | Catalog changes and files not yet retained | Retain as a research capability with clear scope and progress; do not require bulk mirroring or silently promote new interpretations |
| Scientific units, comparability, origin and model gates | Invalid conversions, pooled unlike data, overstated prediction | Retain enforcement and contextual explanations; reduce repetitive warning text |
| Private receipts, authorization and consent | Access to uploads, conversations, results and selected private inputs | Retain server enforcement; routine protection is automatic, with a decision only when sharing requires it |
| Isolated Python/shell and resource limits | Submitted code, expensive work and host safety | Retain for actual execution; qualify on the target host, keep advanced code optional |
| Spend bounds and cancellation | Model/voice costs and operations with uncertain completion | Retain existing bounds and visible recovery; do not introduce paid retries or new providers for cosmetic reliability |
| Durable jobs and worker | Long-running analysis, export, acquisition and interruption | Retain; show task-specific progress/results rather than require users to operate a job administration screen |
| Custom roles, plans and low-level tool configuration | Specialist repeat research when useful | Keep accessible as advanced options; the standard question path must work without them |
| Dashboards and charts | Exploring or communicating selected evidence | Retain useful artifacts, link them to their data; do not require composing a dashboard before obtaining an answer |
| Storybook and a standalone brand review packet | Potential future component/asset workflow | Remove as release gates; inspect actual component states and shipped screens now |
| Fixed-size scientific benchmark | Broader claims about extraction, retrieval and answer quality | Defer the prescribed size; retain honest evaluation and independent labels/held-out evidence when the claims require them |
| Scientific regression tests and source checks | Preventing real errors in calculations, endpoints and provenance | Retain independently known expected results and important refusal cases |
| End-to-end tests | Main actions connecting correctly across pages and storage | Prioritize essential journeys and recovery; do not preserve tests that merely encode an obsolete layout or wording |
| Broad device matrix and formal studies | Evidence across users, devices and assistive technologies | Adapt to practical checks now; keep unperformed coverage explicit rather than fabricate acceptance |
| Database/files restore and release rollback | Losing retained evidence or an unusable public release | Retain a practical tested recovery path on the actual host; browser backup is separate |
| External error-monitoring service | Possible future unattended-service diagnostics | No Sentry integration exists to remove; do not add one without a specific need |

## Verification scope

The audit searched dependency manifests/lockfiles, `apps/`, `services/`, `packages/`, `infra/`, `scripts/`, the example environment and active/historical planning documents for Sentry and comparable monitoring integrations. It inspected actual request tracing configuration, startup telemetry settings, worker logs and the health endpoint. It did not read or expose secret values and made no external service changes.

These decisions support the [active brief](../MASTER_BRIEF.md) and [acceptance plan](../IMPLEMENTATION_PLAN.md). They do not mark a removed process as completed or establish that a redesigned workflow, deployment or scientific result has passed verification.
