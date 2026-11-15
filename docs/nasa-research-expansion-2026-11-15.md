# NASA research expansion and assistant repairs

Implemented on 15 November 2026. This succeeds the [redesign report](product-redesign-2026-11-15.md); its earlier observations and source snapshots remain intact.

## Connected research coverage

The current catalog contains **35 investigations and one SoFIE program entry**.
The 24 PSI combustion studies remain unchanged. The supplement adds Saffire IV,
V and VI; SoFIE and its RTDFS, NCA, GEL, MIST and SMuRF studies; FLARE; FM2; and
LUCI. `NASA-*` identifiers are application identifiers for these research records.
They are separate from PSI accessions and NTRS publication identifiers.

The [reviewed collection](../data/nasa-research/README.md) retains 17 original
NASA HTML or NTRS metadata captures, 12 catalog records, 14 publication-table
assets and references to seven original NTRS PDFs. The collection checksum is
`7da1a24973053a7dbf72fea2e449f0bfc336c9e8b756567c5a76cd20db8f9ad4`.
The resulting local source snapshot is
`e81130f82be29a1f222cee7fa2649b3851f279ff61ba6ffadee56ae1bcc77ef1`.

| Research | Data available in this release |
| --- | --- |
| Saffire IV–VI | Published experimental conditions, thin-fuel flame geometry, calorimetry, temperatures and carbon-oxide increases. Separate methods and source locations are retained. |
| SoFIE-GEL | Five selected published extinction cases with flow, oxygen, pressure, strain rate and reported heat loss. |
| LUCI | Published SIBAL flame-base/tip and PMMA flame-tip fits, original units and rounded ratios. The flight simulated lunar gravity. |
| FM2 | Four planned atmospheres and shared fabric geometry from March 2026 science requirements. |
| SoFIE program, RTDFS, NCA, MIST, SMuRF and FLARE | Research descriptions, program relationships and relevant NASA/NTRS publications. No suitable numerical result table was located in the bounded source review. |

The 29 retained table rows include repeated reporting, paired endpoints and
planned conditions. Their source record types remain explicit. Missing cells
stay missing. Pressure, energy, heat-flux, fraction and rate conversions retain
their raw values and conversion methods.

## End-to-end behavior

Catalog and literal/semantic search discover the additions. A SoFIE program page
opens its five studies. Dossiers connect summaries to original NASA sources and
captured report pages. The data tab offers each available dataset, including
separate conditions and results, and preserves that choice in its URL.

Selected records enter side-by-side comparison, variable selection, canonical
queries, charts, CSV/Parquet exports and saved research. Source inspectors resolve
the retained cell or metadata field and show its original publication. The SI
tools accept the same identifiers, preserve data origins and cite those records.

The bounded search index contains 2,576 metadata/passage records, of which 1,024
have vectors. Remaining projected passages participate in lexical retrieval.
Allocation across sources prevents large early tables from consuming all report
coverage. Existing limits remain 4,096 projected records, 128 passages per source
and 1,000 characters per passage. Rebuilding the unchanged index reused all 1,024
vectors and made no new embedding request.

## Storage and material outside this release

The original PSI catalog declares **13,496,771,103,733 bytes**, approximately
13.5 TB, across its 24 combustion studies. That number describes upstream
holdings. The inspected local immutable object store occupied **25,693,381
bytes**; unique selected asset payloads account for **12,426,690 bytes**. The
seven added original reports total **23,034,817 bytes** in the separate ignored
document cache. The committed NASA research pack occupies about 3.76 MB; its
14 transcribed CSV assets total 4,459 bytes. These counts describe different
collections and should not be added as a whole-project disk measurement.

Most raw experiment movies, instrument recordings and unrequested originals
remain upstream. File inventories support discovery without downloading their
contents. Deliberate source transfers retain the existing 256 MiB transfer and
2 GiB cache defaults. Readers and scientific adapters determine which retained
files support numerical analysis; original figures are not automatically
digitized into measurements. A bounded text index does not cover every cell or
page of every retained source.

All seven reviewed reports were acquired with their expected checksums. The PDF
reader retains usable surrounding pages when a large figure stream exceeds its
decoding limit. Text retrieval excludes pages 4–6 of NTRS 20210011521 and page 5
of NTRS 20240002981. The interface names those pages and links the original NASA
reports. The relevant reviewed Saffire table pages remain available.

Original captures, extracted text, curation and generated tables remain separate.
The offline builder checks source hashes and field quotations. Published facts
can be exported with provenance; original papers keep their recorded rights.
Reproduction and explicit report acquisition commands are in
[local development](local-development.md).

## Assistant completion and presentation

The BASS-II visualization request previously searched unrelated calibration and
table tools, then lost its final answer after a malformed model response. A
direct source-visualization tool now prepares the available NASA image or video
from the requested investigation. The BASS-II image is the retained 37,525-byte,
1200 × 797 JPEG with checksum
`aa0bf2369cf77833e95e353519e634ab5cbb5b2918db08849e9bde82267aade3`.
Its image citation resolves through the ordinary source reader.

Malformed gathering output can proceed to the reserved answer stage using facts
already collected. Provider attempts receive distinct checkpoint IDs, including
failed attempts. If the model still cannot finish, deterministic completion
selects a useful prepared output, completed result or source finding and checks
it through the same evidence gates. It makes no additional paid call. Older
saved incomplete replies can display their stored source excerpts and imagery.
The original job record and failure diagnostics are preserved.

Table previews now compact repeated provenance before reducing rows, preserving
all columns of each retained row. This fixes the live Saffire case where a preview
had dropped the requested calorimetry columns. Conventional thousands grouping
remains a single scalar; table/page/sample references are checked as publication
locators rather than scientific quantities.

The response prompts and UI remove stock validation prose, per-paragraph source
labels, repeated caveats and the generic incomplete-answer message. The answer,
visual and numbered sources appear first. Optional details retain source notes
and method configuration. Current research selections reconcile revision-checked
writes across tabs; saved conversations and authored notes keep their existing
conflict protection.

## Verification

- Python: **758 passed, 7 skipped** with the separate PostgreSQL test database.
  The skipped cases are the opt-in gVisor execution tests. The browser checks
  also exercised actual local Python execution successfully.
- Browser: **74 distinct checks passed** across the full suite and targeted
  rechecks. The full run passed 71 checks; three expectations for notes that had
  moved behind disclosures were updated to open those controls and passed on
  recheck. Coverage includes desktop and mobile NASA data/export flows, exact
  source reveal, old incomplete replies, inline BASS imagery, multi-tab selection
  persistence, saved research, private inputs, simulation and output recovery.
- Ruff, formatting, Python and TypeScript checks, generated-contract comparison,
  reproducible source-pack verification and the production build passed.
- Live BASS-II check: the original question, with the earlier pinned source
  snapshot and unrelated current study selection, returned a completed answer
  and the actual BASS-II source image. Request cost was **$0.017893**.
- Live Saffire VI check: the answer returned **3217 W peak** and **3,650 W average**,
  with source-cell citations and the distinction between the two calorimetry
  methods. Both claims passed the checks; none were withheld. Request cost was
  **$0.023426**. Earlier incomplete/withheld verification outputs remain in the
  ignored local evidence files alongside the final result.
- Actual LUCI semantic discovery returned NASA metadata and NTRS passages; all
  four inspected result anchors resolved against their pinned sources.
- Original PSI snapshot reopening, source corruption refusal, publication
  revision mismatch refusal, missing measurements and invalid unit/locator
  combinations remain covered by regression checks.

These observations cover the local application and configured model service.
Public deployment and hosted acceptance remain separate work in the active plan.
