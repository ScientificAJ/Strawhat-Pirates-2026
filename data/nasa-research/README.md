# NASA combustion research collection

This collection supplements the PSI snapshot with twelve cited NASA research
records: Saffire IV–VI; the SoFIE program and its GEL, MIST, NCA, RTDFS and SMuRF
investigations; FLARE; FM2; and LUCI. The `NASA-…` identifiers are application
identifiers, not NASA PSI accessions.

The collection contains fourteen table assets associated with six investigations.
Their 29 rows are published summaries or planned conditions. Repeated reporting
of a Saffire burn and multiple LUCI endpoints are not independent experiments.
The four earlier Saffire I–III rows in the source paper are excluded here because
those investigations already have PSI records.

## Rebuild and verification

Run from the repository root:

```sh
python3 scripts/build_nasa_research.py
python3 scripts/build_nasa_research.py --check
```

The build is offline and deterministic. It uses the pinned original captures in
`sources/` and the reviewed metadata and literal table cells in `curation/`.
It produces `collection.json`, metadata documents, extracted source text and
per-investigation CSV files. Captured timestamps describe the retained source
release; rebuilding does not replace them with the current time.

Original NTRS PDFs are separate from this pack. Their official download URLs,
original-byte checksums, sizes, rights codes and investigation associations are
recorded in `collection.json`. If those original files are stored by checksum in
the ignored evidence-document cache, verify them with:

```sh
python3 scripts/build_nasa_research.py --check --document-cache .data/evidence-documents/objects
```

Reproduction preserves reviewed factual transcriptions; it does not claim that
an automatic PDF extraction reproduces the scientific interpretation. A changed
publication or capture requires a new source review and deliberate curation.

## Scientific scope

- **Saffire IV–VI:** reported conditions, flame sizes, calorimetry, temperatures
  and carbon-oxide increases. Peak oxygen-consumption and average
  fuel-consumption calorimetry remain separate. Empty cells stay missing.
- **SoFIE-GEL:** five selected PMMA-sphere extinction cases. Sample location,
  changing oxygen, source-derived Reynolds numbers and strain rates remain
  explicit. “not recorded” is a missing observation, never zero.
- **LUCI:** published descriptive flame-spread fits in simulated lunar gravity.
  SIBAL values use mm/s and PMMA values use cm/s. Ratios retain source rounding.
  These are sounding-rocket observations, not lunar-surface measurements.
- **FM2:** four planned initial atmospheres from the March 2026 requirements,
  with shared fabric geometry. Tolerances remain separate from nominal values.
  These rows contain no measured lunar outcomes. The 2026 fabric design differs
  from earlier SIBAL/PMMA concepts.
- **Other records:** research descriptions and cited sources. The retained
  sources document actual SoFIE-RTDFS research in March 2025. NCA/SMuRF future
  wording is qualified as an October 2024 statement. FLARE's historical flight
  expectation is not presented as a verified current schedule.

No raw telemetry release was located in the bounded official-source research
used for this collection. This does not establish that no release exists.
Selected published rows do not establish a predictive training cohort, a
validated gravity-transfer model or a safety certification.

## Provenance and rights

Original NASA HTML and original NTRS citation JSON bytes remain separate from
derived plaintext and curated metadata. Metadata quotations must occur literally
in the retained source text; the collection loader verifies that relationship.
Each CSV has reviewed headers, original cell strings, quantity and unit rules,
numeric companions, missing-value reasons, and document/page/table/row/cell
locators. Per-investigation splitting does not alter source cell precision.

Only factual table transcriptions are redistributed as CSV. No original NTRS PDF
is included. Public availability is not treated as a CC0 license: source-specific
NTRS rights and original NASA notices are preserved, and asset licenses remain
unassigned.
