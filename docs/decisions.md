# Implementation decisions

## 14 November 2026 — First local research case

Question: which test-end labels occur in the published FLEX experimental table,
and which scientific interpretations does that table support?

The input is PSI-69 investigation version 5, experimental-table file version 1,
DOI `10.60555/mbq8-0451`. The planning audit records 274 data rows: 186
Extinction, 61 Disruption and 27 Completion. These are independently specified
regression expectations to check against the newly retrieved source, not values
to populate an application response. The application must calculate the counts
from the preserved CSV and return the actual source rows and checksum.

The first result is a description of source labels. It does not establish a
probability, independence of all rows, a physical definition of extinction, or
a cabin suppression requirement. Ambiguous species and the burning-rate header
remain unresolved until the relevant protocol supports normalization.

The comparison workflow must expose differences and unavailable conditions.
Matching terms in investigation metadata does not establish compatible runs.

## 14 November 2026 — Local runtime boundary

Use the documented Python 3.13 and Node.js 24 runtimes, a local PostgreSQL 17
database with pgvector, Next.js and FastAPI. The database and application bind
to loopback. PostgreSQL also owns the local trusted-worker job queue.
Scientific source bytes and database files remain separate.

This environment supports development. OpenAI setup waits for the owner's
decision at W11, and selecting or enabling hosting waits for W19. Interactive
Python and shell remain unavailable until the distinct gVisor execution
boundary has been implemented and tested; ordinary worker jobs cannot execute
user-supplied commands.

The development database uses a documented loopback-only fixture password.
It is not a public-deployment credential. Local setup does not configure
provider keys, cloud resources, user accounts, or paid services.

## 14 November 2026 — Complete backend, then complete frontend

This owner-directed strategy supersedes the implementation ordering in the
local runtime decision above. Preserve the current implementation, unfinished
source-record integration, all F01–F20 features, the full Ignition Glass
experience and all scientific accuracy, provenance, applicability and
validation requirements. Resume the existing work rather than restarting it.

Complete the backend as one delivery, including NASA data access, scientific
methods and evidence handling, API/jobs/tools, exports/read-only API/MCP,
project-hosted isolated Python/shell, contextual/voice server support and
OpenAI secure credential setup and inference. Then complete the frontend as
one delivery. Final integrated testing and conditional hosting follow both.
There are no delivery milestones or internal milestones within either
implementation. W00–W21 remain requirement references, not a prescribed
execution order or intermediate handoff schedule.

The owner has completed secure OpenAI key creation and approved its ignored
`.env.local` destination. This records credential provisioning, not verified
backend loading or live inference. Hosting remains unselected and
unprovisioned. Evaluate eligibility, payment/card requirements, actual
capacity, offer limits, expiration and operating costs with the owner only
after both implementation deliveries and final local integration checks.
No separate Python/shell execution service or paid execution fallback is added.

Keep relevant numerical, API, isolation and recovery checks running during
implementation. Scientific support and prediction validity still depend on
the original source-specific evidence and tests. The revised delivery strategy
does not remove scientific checks or treat missing data as a supported result.
Dated build reports and earlier observed outcomes remain historical evidence.


## 14 November 2026 — Backend implementation evidence

The [backend report](backend-2026-11-14.md) supersedes earlier statements that
OpenAI loading and gVisor were unimplemented. Both reasoning models, embeddings
and a synthetic voice transport/closure check have now used the configured
backend connection. Actual local Python/shell, resource limits, interruption and
restart teardown have been exercised through gVisor. No separate execution
service or cloud resource was provisioned. Future hosting still requires its own
eligibility, terms, capacity and owner decision after the frontend and final checks.

Keep the existing psycopg transactions and checksum-checked incremental SQL
migrations instead of introducing SQLAlchemy/Alembic for the same small schema.
The master brief and plan now reflect that implementation choice. Scientific
entities, source history, transaction guarantees and migration verification remain.

Private processing uses temporary browser receipts and existing project storage.
It does not create an account or a shared workspace. Source/case/model proposals
remain inspectable, with the scientific meaning of a source-backed judgment
separate from mechanical source/hash/quotation checks. No external reviewer or
formal human accuracy approval is introduced. Scientific evidence requirements
and all product features remain in force.


## 14 November 2026 — Frontend implementation choices

Continue the existing light-first Ignition Glass interface and React/CSS Modules
implementation. Use native dialogs, disclosure and form controls with explicit
focus handling, controlled paginated tables, abortable snapshot-scoped requests,
CSS motion and Playwright state fixtures. Reuse semantic CSS variables as the
palette authority. The code workbench provides exact plain-text editing, explicit
Run, streamed output, environment/source provenance and keyboard exit. These
choices replace planned framework/build packages for equivalent responsibilities;
they do not remove the scientific, screen, interaction or accessibility contracts.

Bundle the restricted Vega/Vega-Lite renderer with the application, without a CDN,
remote editor or chart hosting service. Research stays in IndexedDB: revisions,
sources, scenarios, comparisons, dashboards, sessions, annotations and case reports
are portable files. A separate local workspace has its own browser database.
Switching another tab does not change an already open tab's storage destination.

Imports create independent copies and remap current local references. Case
companions retain their copied case address; frozen research payloads and their
hashes retain original content. Copied selections are available in Settings,
where the researcher can deliberately resume a scope. Temporary remote access
credentials and active job records are excluded. Saving output bytes locally is
explicit; a downloaded research report includes private notes/data only when
selected and retains scientific qualifications. No account, sync provider,
additional execution service or cloud integration is introduced.


## 14 November 2026 — Optional source-parameterized model workspace

Reuse the provided observatory’s useful chamber/flame presentation in a bounded, lazily loaded Three.js 0.187.0 view. Keep the MIT notice, exact dependency lock and existing CSS/native-control conventions. Scientific equations live in the shared Python analysis module; the renderer receives calculated states rather than implementing another physical model. No CFD service, new executor, synthetic optical diagnostic or unsupported physics engine is introduced.

Source-linked parameter facts and model calculations have separate origins. Preparing a model returns a closed, non-autoplay artifact; dossier and conversation viewers require explicit opening. See the [model report](source-parameterized-models-2026-11-14.md) and [actual collaborator evaluation](scientific-coworker-evaluation-2026-11-14.md).
