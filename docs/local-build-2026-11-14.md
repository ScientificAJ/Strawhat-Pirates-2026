# First local build — 14 November 2026

This is the preserved first-build record. Later backend implementation and
verification are recorded in [the backend report](backend-2026-11-14.md).

The implementation has started. This report records a working local research
path, not completion of the full F01–F20 application or the release gates.
The master brief and implementation plan retain the full target.

## Verified local workflow

`pnpm run setup` installs the lockfiles and `pnpm dev` starts the local
PostgreSQL, web application, scientific API and trusted worker. The database
uses PostgreSQL 17.12 with pgvector. The compatibility build used Node.js
24.18.0, pnpm 11.20.0, Python 3.13.18, Next.js 16.4.6, React 19.3.1,
FastAPI 0.162.7, Pydantic 2.14.3 and psycopg 3.3.9. Exact dependencies and
the database image digest are locked in the repository.

The committed NASA snapshot contains 24 combustion investigation metadata
records, ten original experimental CSVs, and three full file manifests.
Its index SHA-256 is
`fb60f9f747f8d6f5863c9933584b6385ab530e9e1a077fbcd6ad2c67af74fc54`.
All ten CSV hashes reproduce the independently documented audit values.
Raw data, normalization and scientific interpretation remain distinct.

A researcher can find FLEX, inspect the original CP1252 source cells and
physical line anchors, reproduce its 274 reported test-end records, inspect
the limitations, and export the calculation. Its 186 Extinction, 61 Disruption
and 27 Completion labels remain distinct. The independent-run count remains
unknown, and ambiguous species and burning-rate units remain unresolved.

The atmosphere calculator reproduces 3.087 psia for 21% oxygen at 14.7 psia
absolute, and 3.06 psia for 30% at 10.2 psia absolute. These are arithmetic
results under explicit assumptions, not equivalent flammability or safety.

Personal cases, notes, saved revisions, appearance and backup/import use
IndexedDB. A backup restored in an independent browser receives new case IDs
and does not mutate the original workspace. Cases retain snapshot/source IDs.
Expired, deleted, canceled and unrelated private export-job receipts are denied.

## Checks completed

- 73 Python tests passed, including actual PostgreSQL integration, source
  hashes, encoding/row anchors, known-answer calculations, invalid requests,
  search, frozen snapshots, job ownership, expiry, cancellation, lease recovery
  and rejection of late or duplicate publication.
- Three Playwright tests passed against the running local application in
  Chrome. They exercised source inspection, calculation values and stale
  inputs, comparison refusal, request failure/retry, save/reload, independent
  backup/import, mobile overflow and navigation focus.
- Python and TypeScript checks passed; Ruff and frontend formatting passed.
- The optimized Next.js production build passed. This is a local build result,
  not deployment evidence.
- The runtime dependency checks with `pnpm audit --prod` and pip-audit reported
  no known vulnerabilities in their checked package sets on this date.
- Desktop and 390-pixel mobile layouts were rendered and inspected. These
  checks do not replace the full screen/state matrix or human usability work.
- The foreground stack stopped and restarted while retaining the same source
  snapshot. The database remained on its persistent local directory.

Starlette's test client currently emits one deprecation warning about its
httpx compatibility path. The tests pass; the warning is not suppressed.
The full scientific benchmark, uncertainty/calibration qualification,
performance targets, independent database/files backup restoration and
public-host qualification remain unverified.

## Feature progress

| Feature | Evidence now and remaining implementation |
|---|---|
| F01 Discovery | Source-indexed search across 24 records; semantic retrieval, advanced run filters and saved searches remain. |
| F02 Dossiers | Source metadata, versions, provenance and ten original table views; calibrated run dossiers and further source-specific interpretation remain. |
| F03 Comparison | Investigation-level inspection and explicit refusal to pool unmatched data; run-level compatibility and matched cohorts remain. |
| F04 Scenarios | Explicit oxygen/absolute-pressure calculation; full presets, applicability passports and scenario evidence mapping remain. |
| F05 Ranking | Source search is available; the separate scientific ranking policies remain to implement and evaluate. |
| F06 Visual analysis | Source tables and the source-linked FLEX chart/export work; dashboard editing, linked plots and calibrated media analysis remain. |
| F07 Materials | Relevant investigation metadata is inspectable; specimen/assembly normalization and material-specific analysis remain. |
| F08 Smoke/detection | SAME/SAME-R/DAFT sources are discoverable; calibration, timing and detector analysis remain. |
| F09 Suppression/extinction | FLEX source labels remain distinct; protocol-defined endpoints and quantitative suppression analysis remain. |
| F10 Hardware lineage | Hardware source descriptions are retained; the apparatus/configuration/sensor relationship workflow remains. |
| F11 Research assistant | Local scientific endpoints are being established; integration waits for the owner's OpenAI decision at W11. |
| F12 Context and voice | Planned; structured context, optional images and voice require their implementation and verification. |
| F13 Python/shell | Unavailable until the local gVisor runtime is implemented and tested; the trusted worker cannot execute user code. |
| F14 Modeling | Planned two descriptive fits and optional independently validated regression; no model or simulation is claimed operational. |
| F15 Contradictions/gaps | Source quality notes and unresolved interpretations are visible; the full contradiction/gap workflow remains. |
| F16 Hypotheses/experiments | Planned, with mechanisms, contrary evidence and falsifiers retained in scope. |
| F17 Controls | Planned, including evidence, applicability and tradeoffs. |
| F18 Earth transfer | Planned, including source-backed transfer limits and educational content. |
| F19 Personal notebook | Cases, notes, revisions and portable backup/import work; exact-anchor annotations, watches, complete artifacts and revision merge/restore remain. |
| F20 Exports/API/MCP | FLEX calculation JSON, licensed raw-file download and source/snapshot API work; complete bundles, other export formats and MCP remain. |

No OpenAI key, hosting account, cloud resource or paid integration has been
configured. The next implementation work continues with source-specific
contracts, independent runs, calibration and comparison semantics. See
[local development](local-development.md), [source collection](data-sources.md)
and the [decision register](decisions.md) for reproducible commands and limits.
