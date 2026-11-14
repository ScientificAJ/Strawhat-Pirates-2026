# Source discovery, evidence and updates

Implementation verification date: 14 November 2026. These are backend contracts
for the complete account-free research workflow. Source location, interpretation
and scientific validation remain distinct. A visitor can read the public corpus;
personal cases and their revisions remain browser-owned.

## Discovery and exact source locations

`nova_ember.api.discovery.create_discovery_router(corpus)` supplies the public
routes. `POST /v1/discovery/investigations` accepts explicit text, accession,
hardware, platform, license and availability predicates. `POST
/v1/discovery/records` searches the interpreted source records, including row
roles, source text and typed field predicates. Numeric predicates require the
reviewed canonical unit; a fan setting cannot become a calibrated velocity.
Returned query definitions, source snapshots and cursors are pinned together.
Changing the query invalidates its cursor.

The record response retains the source file, physical line, adapter version and
raw cells. Daily summaries, ranges, condition rows, samples, sessions and notes
remain distinct. The independent experimental-run count stays unknown until an
independent-unit mapping supports it. Discovery does not certify pooling or
predictive suitability.

`GET /v1/investigations/{accession}/dossier` retains exact scientific metadata
fields and their anchors. Objectives and prospective impacts do not populate
findings. `POST /v1/evidence/search` performs literal search over frozen scientific
metadata and locally captured NTRS page text. It reports its actual scope. Exact
Unicode character spans are resolved back to the original extracted text even
when case folding expands characters. Semantic retrieval is a separate qualified
projection over the same versioned sources.

`POST /v1/evidence/read` resolves metadata fields, physical CSV cells, text lines,
XLSX/XLS cells, PDF pages, DOCX/RTF paragraphs and embedded original DOCX figures.
Each location retains its source checksum and investigation/document identity.
An embedded figure additionally carries its archive member and member checksum.
A valid source location does not itself prove an interpretation.

Identical bytes can belong to different source records. Saffire-I and Saffire-III
README copies have the same byte checksum but different accessions and file
names. Use accession/asset selectors on source-format requests and exact asset
identities on anchors; the application must not silently attribute one copy to
the other. Content storage can still deduplicate their bytes.

## Format and media readers

`GET /v1/assets/{sha256}/format` returns bounded source-format inspection. The
`accession` and `asset_id` query selectors disambiguate identical source copies.
PDF page text is extracted by a fixed trusted child with a 30-second wall limit,
512 MiB address-space limit, 64 MiB source limit, 500-page limit and bounded text
output. This is the document reader, not execution of submitted code. No OCR,
scientific table meaning or calibrated measurement is inferred from extraction.

DOCX reading preserves original XML paragraph indices, table locations, merge
markers and tracked deletions. Original embedded PNG/JPEG figures can be read
through `/v1/assets/{sha256}/embedded-figure?member=...`; active vector content is
not served as an inline document. RTF reading retains explicit platform/code-page
headers, Unicode escapes and visible text, while reporting unresolved font
mappings and layout limits. Original files remain available for inspection.

The legacy XLS reader uses xlrd and preserves cell types, styles, date mode and
merged ranges. It exposes stored or cached values; it neither exposes nor
recalculates formula expressions. XLSX keeps formula text and cached values
separate. No workbook executes macros. MATLAB v4/v5 inspection uses the existing
SciPy metadata reader and does not execute MATLAB code. Two MAT files occur in
the inspected manifests; no HDF5 file was observed, so an additional HDF5 runtime
has not been introduced. A future HDF5 source requires its appropriate reader,
not a claim that the file is scientifically absent.

ZIP/tar inspection preserves member inventories without writing their contents
to the host filesystem. It rejects traversal, links/devices, duplicate ZIP names,
unsupported encryption and profiles that exceed declared member/expanded-byte
bounds. Readers do not relabel a source row, archive member or array element as
an independent experimental run.

`GET /v1/assets/{sha256}/media` returns actual container/stream metadata and source
association. The separate media fixture contains a NASA BASS-II representative
JPEG and two original FLEX-007 camera views, totaling 5,226,273 bytes. The
32.165467-second droplet view and 26.659967-second flame view have retained codec
timebases. Their different durations do not establish synchronized clocks.
Spatial calibration, camera alignment, temperature and extinction endpoints
remain unestablished by container metadata. Figures and original footage remain
source evidence rather than generated illustrations.

## Scientific evidence tools

`POST /v1/evidence/condition-coverage` maps actual joint combinations of one to
three explicit source fields. Numeric bins are supplied explicitly; outside-bin
values and unknowns remain visible. The final bin includes its upper edge. Counts
refer to source records, and an unobserved combination is only a gap within the
specified frozen query. It is not global novelty or an independent replication
count.

`GET /v1/evidence/lineage` exposes exact related-investigation metadata and
versioned hardware-name aliases. Shared CIR, ACME, MSG, MDCA or diagnostic context
does not establish equal configuration, calibration or endpoints. DAFT dust and
SAME smoke records remain separate.

The contradiction endpoint preserves both claims and a condition matrix. It can
report a condition difference, unknown scope or potential disagreement, while
explicitly declining to treat that mechanical comparison as scientific
verification. Dependency invalidation follows the recorded graph transitively
and does not mutate cases.

Hypothesis assessment retains mechanism, supporting/contrary claims,
discriminating observation, falsifier, assumptions and variables. It does not
invent information gain without a defensible probability model. Control and
Earth-transfer assessments retain configurations, mechanisms, countereffects,
interactions, validation needs and transfer constraints. Metadata that describes
prospective Earth impacts remains a research hypothesis, not a documented
technology deployment or certified control.

## Frozen source collections

The original starter snapshot remains unchanged. Separate supporting, media and
methods supplements retain their own original files and source proofs. The
methods supplement contains seven protocols/readmes and three actual XLS/RTF/MAT
format examples: ten source identities totaling 3,019,461 bytes.

The complete local manifest collection was captured from all 24 combustion
investigations: 30,609,224 response bytes and 66,567 file entries. These counts do
not establish unique scientific data, valid independent trials or a request to
mirror the declared 13.50 TB. Raw responses live in the ignored
`.data/catalog-manifests` content-addressed store. Its complete collection ID is
`649dd04054ef94d58b3d2b86c9e48cf7c4a45af2d8016654038cb25a8493a567`.
The 9,935,155-byte SLICE listing required the bounded 32 MiB manifest profile.

Recreate or refresh the collection with:

```bash
python3 scripts/python.py -m nova_ember.adapters.manifests \
  --source tests/fixtures/nasa-psi/snapshot.json \
  --destination .data/catalog-manifests
```

A partial acquisition resumes verified captures; `--fresh` requests all current
listings. Failed attempts cannot replace a prior completed collection. Acquisition
of a manifest downloads no scientific asset.

Locally captured NTRS sources include BASS-II report 20210011385 (144 pages), FM2
record 20240015307 (one page) and LUCI record 20250010653 (44 pages). Their actual
PDF hashes, page-text hashes, reader versions and capture IDs remain in the
ignored `.data/evidence-documents` store. Their public distribution records carry
`GOV_PERMITTED` copyright determinations; public availability is not treated as
unrestricted redistribution permission. The API provides selected excerpts and
official source/page links while retaining original-byte restrictions.

## Daily refresh and personal evidence watches

`nova_ember.api.discovery.refresh_public_sources(settings, force=False,
stop_event=None)` is the trusted maintenance callback. It captures the current
public catalog, combustion metadata and all manifests, using bounded sequential
NASA requests and durable checkpoints. A completed UTC day is idempotent; a
partial or interrupted attempt resumes only missing captures. A nonblocking
local lock prevents overlapping work. Stop requests are checked between source
calls and before publication; an in-flight request remains bounded by its
network timeout.

The callback stores atomic status/checkpoints in
`.data/source-refresh/status.json`. Complete observations are immutable objects
with an atomic `current.json` pointer. Partial failures preserve the previous
complete observation. No visitor account, scheduler service, broker or cloud
integration is required. The application worker invokes this callback; it is
not a public acquisition endpoint.

`GET /v1/source-refresh/status` reports actual progress/errors. `GET
/v1/snapshots/{pinned_snapshot_id}/changes` separates changes in released
scientific snapshots from newer source observations. It records metadata,
file-version/size/access changes, additions, absent listings, affected source
identifiers and listing limits. An unavailable source does not erase its last
successful snapshot. An absent listing does not establish scientific
nonexistence.

Refresh does not promote newly ambiguous rows, recalibrate measurements, activate
a model, alter a frozen case or claim a corrected scientific result. Canonical
promotion uses the maintainer path and the existing format, provenance and
scientific checks. Personal watches compare pinned IDs with these public change
records when the researcher returns; accepting new evidence creates a deliberate
personal revision.

The new tests exercise actual frozen source files, exact source identities,
reader limitations, known joint coverage, conservative contradictions,
transitive invalidation, source refresh failures/cancellation/recovery and
read-only API behavior. Live source observations and local reader tests remain
distinct from the complete application benchmark or hosted verification.

## Selective large-source acquisition

`create_source_acquisition_router(settings)` supplies a receipt-scoped transfer
workflow. The researcher selects a frozen snapshot, investigation/file versions,
exact manifest key and hash, and the displayed exact byte count. The server
resolves this selection against its retained manifest and public access flags;
the request cannot supply a URL, host command, cache path or license override.
Repeated identical entries in a repository listing are accepted only when their
underlying source identity/size/access fields agree.

`POST /v1/source-acquisitions` queues the existing worker's `source_acquisition`
job. Its progress, cancellation, deletion and expiry use the ordinary workflow
receipt. One background source-transfer slot shares the existing worker process,
so the foreground scientific queue remains available. This adds no hosted
execution, queue, cache or data service.

The transfer streams bounded chunks to `.data/source-cache`, verifies its exact
manifest size, checks content signatures, calculates SHA-256 and atomically
publishes an immutable raw object. That is source acquisition, not promotion of
canonical measurements. A locally calculated checksum is not presented as a
NASA-attested checksum. Unexpected HTML error pages and invalid lengths/ranges
cannot become scientific assets; unknown or mismatched scientific formats remain
explicitly unqualified raw sources.

The default owner profile permits 256 MiB per external transfer, 2 GiB of raw
source cache, a 128 MiB free-disk reserve and 600 seconds elapsed. These limits are
visible at `GET /v1/source-acquisitions/profile` and configurable through
`NOVA_SOURCE_TRANSFER_BYTES`, `NOVA_SOURCE_CACHE_BYTES`,
`NOVA_SOURCE_DISK_RESERVE_BYTES` and `NOVA_SOURCE_TRANSFER_SECONDS`. They replace
the starter downloader's fixed five MiB ceiling for requested source transfers.
The actual host must support the selected profile; the application does not
mirror the declared archive or silently raise its budget.

Strong-ETag/If-Range transfers resume a retained prefix only after verifying the
returned range and source validator. A server returning the whole file causes a
clean restart rather than concatenation. Without a usable validator, the prefix
is discarded and the source starts again. Completed partial captures can resume
validation without another network request. Re-resolving an expired destination
never stores its signed URL. Identical frozen source identities deduplicate
across application snapshot revisions. Existing retained corpus bytes are
verified and reused without re-downloading them.

Cache eviction protects inputs referenced by active source jobs; a full cache of
pinned data rejects a new request rather than deleting those inputs. Original
NASA cache bytes can be reused after a private job ends, but another browser
cannot read that job or its results. `GET
/v1/source-acquisitions/{job_id}/content` authorizes the receipt and streams the
original, including HTTP byte ranges. Save selected originals and their frozen
manifest before temporary access expires if they are needed independently of
future NASA availability. Public source-cache reuse does not retain personal
notes or private uploads.

A raw CSV preview uses bounded streaming and reports physical line anchors and
unknown total/independent counts. A byte limit cannot turn a truncated record
into a complete reported value. Newly acquired sources can also become explicitly
selected frozen inputs to the existing isolated execution session, within its
separate eight MiB input profile. Owner, expiry, snapshot, source identity, size
and checksum are checked before the copied input reaches the guest. Research
case exports include selected CC0 originals within the bundle budget and retain
reasoned, exact-version source references otherwise.

Selected source frames or clips are prepared by the fixed trusted FFmpeg child
on existing CPU capacity: one decoder/encoder thread, 512 MiB address space,
30-second wall time and an eight MiB preview output bound. Preview geometry and
encoding transformations are explicit. Requested clip duration is checked
against the decoded output with its actual frame/audio-packet cadence; a source
or output limit cannot silently become a complete requested interval. Source
camera time is not equated with the experimental clock, and previews do not
establish spatial calibration or measurement accuracy. Original bytes remain
unchanged and independently downloadable under the receipt.

## Selected private uploads

The account-free browser receipt also scopes explicitly selected private files.
`POST /v1/uploads` records the file name, exact size and SHA-256, intended use,
license and processing-rights assertion, host processing location and expiry.
The researcher confirms temporary host processing before bytes are sent.
Ordered `PUT /v1/uploads/{id}/chunks?offset=...` requests resume from the server's
recorded byte offset after a tab or connection closes. Uncommitted trailing bytes
are discarded when that offset resumes. `POST /v1/uploads/{id}/finalize` requires
separate submission confirmation, complete length, exact checksum and the format
checks. An incomplete or rejected file cannot become an execution input.

`GET /v1/uploads/profile` states the current limits and supported formats. The
default profile is 64 MiB per file, 256 MiB/100 files per browser, one GiB/1,000
files on the host, one MiB per chunk, a 128 MiB disk reserve and 24-hour expiry.
The three byte budgets are configurable through `NOVA_UPLOAD_FILE_BYTES`,
`NOVA_UPLOAD_BROWSER_BYTES` and `NOVA_UPLOAD_HOST_BYTES`. JSON/notebook parsing
has a separate eight MiB profile. ZIP/Office checks bound expanded bytes and
member count, reject traversal, links, macros and active embedded members, check
CRC without extracting files, and reject XML entity declarations. Text checks
use the selected explicit encoding. Binary signature checks are reported as
signature checks; they do not establish valid internal measurements or scientific
calibration. Unsupported formats are identified before transfer.

Original bytes are stored privately on the application host with restrictive
permissions. They are not rendered as active browser content, automatically
executed, submitted to a model provider or promoted to the public corpus.
`GET /v1/uploads/{id}` and `/content` require the originating browser; another
browser or an expired/deleted reference cannot retrieve them. `DELETE` removes
an accidental file before submission or a retained file afterwards. Existing
worker maintenance removes expired bytes and recovers interrupted deletions.
The browser's case, notes and backups remain separate from these temporary files.

The researcher can explicitly select ready upload IDs for F13. The execution
session freezes owner, source snapshot, file hash/size, intended use, rights
assertion, processing location and expiry; the worker rechecks them before copying
bytes into its read-only guest inputs. The combined eight MiB execution-input
profile still applies. A case export includes selected private originals only
when their explicit redistribution permission and the export byte profile allow
it; a CC0 label supplied by a visitor cannot bypass that permission. The manifest
retains user-asserted rights as assertions, with omission reasons when required.
Deleting or expiring an upload closes sessions that selected it; new commands are
denied immediately and worker maintenance observes guest teardown before marking
it terminated. Downloaded exports and previously published job artifacts remain
separate objects with their own deletion/expiry. Nothing here establishes
scientific equivalence to a NASA record with similar contents.

## Hybrid retrieval over retained passages

`POST /v1/search/semantic` searches the existing PostgreSQL/pgvector projection of
investigation metadata and bounded, actual source passages. The same operation
is available to research roles as the typed `search_semantic_evidence` tool.
Accession, physical source hash, PSI/NTRS origin and document-kind filters apply
before either ranked list is formed. Reciprocal-rank fusion uses `k = 60`, with
accession and stable source ID as deterministic tie breakers. Similarity and
fusion ranks describe retrieval; they are not experimental accuracy, evidence
quality, applicability or safety probabilities.

The projection reuses the reviewed CSV-cell, UTF-8 text-line, XLSX/XLS-cell,
PDF-page and DOCX/RTF-paragraph readers. Captured NTRS page text retains its exact
document/capture ID and associated investigation list. Each passage stores the
original physical source hash, investigation/version or NTRS capture identity,
and an existing typed `EvidenceAnchor` with exact extracted-text character
offsets. Source IDs include physical identity and locator but exclude the app
snapshot, allowing unchanged embeddings to be reused while anchors are rebound
to the requested frozen snapshot. Identical bytes attributed to two different
investigations retain separate source identities.

The initial profile retains at most 1,000 characters per passage, 128 passages
per source and 4,096 projection documents, with up to 1,024 embedded documents.
Metadata is included first, then sources in a deterministic order. These are
visible resource limits, not a claim that the whole raw archive was processed.
The coverage report identifies each source's actual passage count, reader
failure or limit and distinguishes the embedded subset from lexical-only text.
Images, videos, MATLAB arrays and unacquired files do not acquire invented text;
their available format/media views and exact source references remain usable.

Projection creation uses batches of at most 24 inputs, the existing OpenAI
embedding integration and shared usage reservations. A content-hash match reuses
an existing vector, including across snapshot versions. Text, vectors and the
completed coverage report publish together in one database transaction; a
failed embedding request preserves the previous complete projection. This
adds no search service, queue service or vector database subscription.

Non-embedded projected passages participate in lexical retrieval. When the
model key is absent or the provider fails, lexical passage search remains
available and the response identifies semantic retrieval as unavailable. A
snapshot without a completed projection returns a clear unavailable state;
literal metadata/NTRS evidence search and the retained source readers remain
available independently. Projection refresh never promotes measurements,
validates a model or updates a personal case.

Offline tests use explicit synthetic vectors in the separate PostgreSQL test
database to verify known reciprocal scores, ordering, ties, filters before
fusion, lexical fallback, cache reuse and atomic failure. Separate checks read
actual retained source passages through their older-snapshot anchors. The
synthetic ranking fixtures are implementation references, not NASA evidence or
a scientific retrieval-quality benchmark.
