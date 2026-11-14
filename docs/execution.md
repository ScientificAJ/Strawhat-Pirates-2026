# Scientific workflows, artifacts and local execution

The backend keeps public research data separate from browser-owned cases and
short-lived private operations. It adds no account, database, execution-provider
or notification-service integration. PostgreSQL already used by the application
holds the job queue, leases, ordered events, approvals and artifact manifests.
The existing CPU host runs the worker and direct gVisor execution.

## Public scientific interfaces

`POST /v1/queries` accepts a bounded `QuerySpec` over an exact public source
checksum and corpus snapshot. Column indices refer to the preserved source
header. Each field chooses original or reviewed canonical representation.
`source_rows: null` or an omitted field selects all source records; `[]` means
an explicitly empty selection. Physical lines and source row roles remain
available, and the response never calls the row count an independent-run count.
An unresolved value remains null. Missing canonical units do not turn a valid
unit-bearing column into a schema conflict.

`POST /v1/queries/aggregate` and `QuerySpec.aggregations` compute bounded
source-record summaries with Polars. The equivalent internal DuckDB path uses
an Arrow table, generated identifiers, one thread, a 128 MiB query budget and
external access/extension loading disabled. Neither interface accepts SQL.
Mean, minimum, maximum, sum and sample standard deviation retain contributing
physical rows, nonmissing counts, units and method settings. An all-missing
sum stays missing. These are descriptive summaries, without certified condition
comparability, independent replicates or inferred measurement uncertainty.
A truncated input cannot define a statistic.

`POST /v1/charts/validate` returns the numerical selection and a restricted
Vega-Lite specification. It accepts no external data URL, JavaScript or arbitrary
expression. Axes have explicit quantitative, nominal or ordinal types and source
units. A source-record standard-deviation bar is calculated by the registered
`source-record-summary-v1` method from the same frozen inputs as its mean, with
explicit units, justification, ddof and contributing counts. An arbitrary numeric
column cannot become measurement uncertainty, SEM or a confidence interval.
Qualified fit/prediction artifacts retain their own asymmetric bounds, level and
interpretation. Empty selections stay empty, including in frozen bundles: their
unavailable state and exported values remain present without an invented figure.

Source charts include point/line/bar, exact-bin distributions, categorical outcome
maps, paired fields and observed response grids. Maps carry an explicit support
mask; missing cells stay unobserved rather than becoming zero, and no interpolation
or predicted surface is invented. Named response columns share only their declared
source clock and compatible units, without automatic synchronization or pooling.
Linear/log scales are explicit; nonpositive values or interval bounds prevent a
logarithmic display. Optional `centered-moving-average-v1` overlays record window,
maximum source-coordinate gap, justification and library version, preserve raw
points and never bridge missing records or declared gaps.

`POST /v1/charts/method` resolves selected, unexpired, receipt-owned registered
calculations into fit, residual, interval, observed-versus-predicted, calibrated or
candidate track, and original-pixel boundary views. It retains source anchors,
exclusions, assumptions and method status. Fit confidence intervals and Monte Carlo
central output intervals keep their exact lower/upper bounds, level and distinct
interpretation; absent justification is not repaired. Multiple methods remain
separate series with compatible units. `DashboardComponent.method_chart` and
`CaseExport.method_charts` reuse this exact resolver and renderer. Pending method
dependencies keep a dashboard incomplete.

Matplotlib exports actual SVG/PDF/PNG figures with units, source identity,
source-record count and uncertainty meaning, alongside exportable numbers.

`POST /v1/dashboards/validate` checks typed components, snapshot consistency,
private artifact access, bindings and the expected browser revision.
`POST /v1/dashboards/select` proposes the next revision without overwriting the
browser's copy. A binding changes only its own filter and preserves manual
filters. Empty-selection behavior is explicit. Same-source fields can link;
reviewed CFI-G normal/inverse navigation mappings also cover reported fuel labels,
adiabatic temperatures and peak burner temperatures. They require the matching
representation and units, retain configuration differences and do not establish
comparability or permission to pool observations. Unknown cross-source mappings
are refused. Source-linked components with missing data remain visible.

## Temporary private operations

`POST /v1/exports` submits the selected frozen case. The browser's HttpOnly,
SameSite=Strict receipt cookie scopes its jobs, events, approvals, cancellation,
deletion and downloads. HTTPS makes the cookie Secure. Existing `X-Job-Receipt`
clients remain supported. A separate browser, an expired receipt and the public
MCP interface cannot fetch private results. Receipts never belong in a research
export. Temporary jobs and their artifact bytes expire after 24 hours; early
deletion removes access immediately and removes retained files.

The requester can confirm selected private data at submission or approve the
pending input checksum and approval revision. This is a confirmation of that
operation, without another participant or an accuracy sign-off. Approval survives
a worker restart. Scoped idempotency keys reuse the original operation only when
its kind, snapshot and canonical inputs agree. A changed or expired operation
conflicts rather than silently rerunning.

The worker claims renewable leases, fences abandoned attempts, persists significant
progress before replay and refuses late publication after cancellation or expiry.
Completed deterministic steps can be reused. A provider step with uncertain
completion requires inspection before replay. Internal voice continuations can
queue against a stored owner hash without storing or returning the raw credential;
no public route accepts that hash as authority.

Artifacts are content addressed outside the web root. Incomplete outputs remain
inspectable with explicit status and incomplete filenames; only a successful job
activates a complete result. Printed Python/native-process stdout and stderr stream
in bounded private events, and interruption retains a labeled partial record.
Every download rechecks job scope, expiry,
size and checksum. Downloads use attachment disposition, no-store, nosniff and a
restrictive sandbox policy. CSV/JSON/Parquet, figures, notebooks, source acquisition
references and deterministic rerun code preserve the selected snapshot, source
hashes, units, assumptions and limitations. Original bytes are included only when
selected and their redistribution license is known. Explicitly selected private
uploads require the researcher's separate export-permission assertion even if the
license text says CC0; that assertion is retained as user-supplied, without
independent verification. Frozen fit, model, execution,
scenario, evidence and other research artifacts retain their original payload and
provenance; exporting a record does not independently validate it.

## Direct Python and shell on the existing host

Prepare or rebuild the scientific environment with:

```bash
python3 scripts/python.py sandboxes/python-analysis/prepare.py
```

Close analysis sessions before rebuilding. The script verifies the pinned gVisor
release archive, builds the scientific image from `uv.lock`, records hashes and
qualifies actual Python, shell and numerical/vector-output paths. It does not
create a cloud resource or call OpenAI. The current x86-64 Linux recipe pins
Python 3.13.18 and uv 0.13.8 image digests and gVisor release 20261109.0. Hosting
and other architectures still require qualification on the actual machine.
A changed lockfile or execution profile disables new sessions until rebuilt and
qualified. Failure leaves an explicit unavailable state, with no paid or host-shell
fallback.

The tested layout starts gVisor in a fixed trusted Docker envelope using the
existing Docker installation. Submitted code runs only inside gVisor's guest.
The envelope supplies hard CPU, memory and process controls; it does not mount the
Docker socket, home directory, project tree or credentials. Its added runtime
capability and relaxed outer seccomp/AppArmor rules let gVisor establish its own
namespaces and seccomp boundary. The container is not privileged; gVisor's inner
seccomp protection remains enabled. No daemon configuration is changed.
This envelope is infrastructure for the same local runtime, not an ordinary
container fallback for untrusted code.

| Bound | Qualified local profile |
|---|---|
| Concurrent interactive sessions | One; replacement waits for observed teardown |
| CPU / memory / outer process limit | 1 CPU / 1 GiB / 128 processes |
| Guest user and process limit | UID/GID 65534; 64 processes |
| Network | Denied in the envelope and guest |
| Default / confirmed extended command | 60 / 90 seconds |
| Session lease / wall deadline | Five minutes, renewable within a 15-minute deadline |
| Cumulative execution / command count | 300 seconds / 100 commands |
| Frozen inputs | At most eight MiB, read only |
| Scratch / output storage | 64 MiB scratch and 16 MiB guest output tmpfs |
| Published outputs | 32 files, two MiB each, with checked types and no links |

`POST /v1/execution/sessions` freezes explicitly selected public source inputs.
`source_job_ids` can also select the originating browser's completed NASA
acquisitions without promoting them to the canonical corpus; hashes, snapshot and
combined input limits are rechecked before copying them into the guest.
`upload_ids` selects the originating browser's explicitly submitted private files
through the same frozen-input boundary. Intended use, asserted rights, processing
location, expiry, source hash and generated guest input filename remain in the
input manifest. Public, acquired and uploaded files share the eight-MiB session
budget. Upload deletion/expiry closes dependent sessions and the worker records
actual teardown before freeing the slot. The upload API supports receipt-scoped
bounded chunks, offset-based resume, pre-submission removal, safe-format validation
and explicit finalize; it never promotes private bytes into the public corpus.
Commands use `POST /v1/execution/sessions/{id}/commands`. Python globals and shell
variables persist across cells in the live guest. Code, seeds where supplied,
input hashes, runtime/image/lock identity, stdout/stderr, exit state and output
hashes are retained in an execution record for saving before job expiry.
Scientific conclusions still require their independent source and method checks.

Stop, timeout, expiry and worker shutdown terminate the guest rather than letting
late results become active. After a worker restart, abandoned guests are removed;
their Python state is reported interrupted instead of being reconstructed by
silently replaying cells. `GET /v1/execution/sessions/{id}` distinguishes requested
closure from an observed `terminated_at` result. The fixed registered numerical
methods use their own trusted CPU path and remain available without a user session.

## Public MCP and source refresh

`/mcp` implements stateless read-only MCP over Streamable HTTP, protocol version
2025-11-25. Initialize, tool listing and calls expose public investigation search,
dossiers, snapshots, bounded dataset queries and the source-linked FLEX label
analysis. Browser origins are checked. Unknown/write tools and private parameters
are rejected. An external client needs no account for this public corpus.
The protocol is documented in the official
[MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
and [transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
specifications.

The worker also maintains one background source-refresh thread and one
receipt-scoped source-transfer thread in the same process. Transfers claim only
`source_acquisition` jobs; the foreground queue excludes that kind so a large
NASA transfer does not block research or fitting. No extra service is started.
The refresh scheduler never starts
a second refresh while the previous handle is alive. The adapter enforces the daily
schedule and holds its acquisition checkpoint. Source I/O does not block the
interactive job queue. Shutdown requests cooperative cancellation; an in-flight
HTTP request remains bounded, and the last complete corpus stays available.
Voice expiry maintenance runs separately from this source-fetch thread.

## Verification commands

```bash
NOVA_TEST_DATABASE_URL=postgresql://nova:nova-local@127.0.0.1:55432/nova_ember_test \
NOVA_TEST_EXECUTION=1 python3 scripts/python.py -m pytest \
  tests/test_artifacts.py tests/test_exports.py tests/test_workflows.py \
  tests/test_execution.py tests/test_mcp.py tests/test_jobs_postgres.py
```

These checks use actual local PostgreSQL and gVisor, without paid model calls.
They cover known numerical selections, columnar equivalence, missingness,
standalone bundle rerun, figures, scoped approvals/idempotency, private downloads,
source-linked execution, persistent language state, denied network/host files,
resource limits, cancellation, timeout, abandoned-guest recovery and teardown.
They do not establish eligibility or capacity on a future public host, or replace
the final whole-application science/interface verification.
