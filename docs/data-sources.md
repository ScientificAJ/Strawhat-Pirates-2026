# NASA source collections

The current successor retains the 24 PSI combustion investigations and adds 11
investigations from NASA research pages and NTRS publications, together with a
separate SoFIE program entry. The [NASA research pack](../data/nasa-research/README.md)
contains the pinned originals, reviewed curation and reproducible table builder.
Its 14 tables connect to record search, SI evidence tools, comparison, queries,
charts and exports. FM2 rows describe planned conditions; LUCI rates are published
descriptive fits. Neither is relabeled as raw measurement data.

The [expansion report](nasa-research-expansion-2026-11-15.md) describes current scope
and exclusions. The observations below describe the original PSI starter capture.

## Original PSI starter capture

The starter-capture observations below are historical. The successor supporting,
media and method packs, complete manifest discovery, refresh and selective source
transfers are recorded in [evidence](evidence.md), [the data dictionary](data-dictionary.md)
and [the backend report](backend-2026-11-14.md). Original capture hashes remain unchanged.

The local starter snapshot is stored in `tests/fixtures/nasa-psi/`. Its JSON index
contains exact retrieval times, source identifiers, investigation and file versions,
record-level license assertions, stable resolver URLs, byte lengths and locally
computed SHA-256 hashes. `load_snapshot()` verifies the referenced hashes before
the application imports it. Raw responses and downloaded files are unchanged.

Git treats original capture directories as byte-preserved data so line-ending
conversion and whitespace cleanup cannot alter their scientific checksums.
The snapshot index remains text for review; source tests verify captured bytes.

The capture on 14 November 2026 retrieved the public catalog's 133 records,
all 24 Combustion Science investigation metadata records, ten selected experimental
tables and the complete FLEX, BASS-II and SAME-R manifests. The 24 metadata records
declare 13,496,771,103,733 bytes; this is an upstream declaration, not downloaded
volume or a requirement to mirror the archive. This starter collection occupies
about 25.4 MB, including images embedded in NASA's metadata responses.

## Source access and rights

- [NASA PSI repository](https://psi.nasa.gov/physci/repo): public source discovery.
- [PSI user guide](https://science.nasa.gov/wp-content/uploads/2024/11/psi-database-guide.pdf):
  investigation records, file organization and download workflow.
- [FLEX, PSI-69](https://psi.nasa.gov/physci/repo/data/investigations/PSI-69),
  [DOI 10.60555/mbq8-0451](https://doi.org/10.60555/mbq8-0451): first source-backed case.

The adapter uses observed PSI frontend services. These are not a confirmed supported
or versioned public API. Schema changes, timeouts, incomplete catalog responses,
oversized inputs and denied downloads produce an explicit unavailable or incomplete
state. Requests have a 30-second network timeout; each metadata response is limited
to 8 MiB, each manifest to 32 MiB, and starter-capture assets to 5 MiB. The manifest
limit accommodates the observed 9,935,155-byte SLICE manifest. Larger deliberate
transfers use the separate streaming/cache profile rather than increasing the
starter-capture limit. The metadata limit
accommodates the observed 8,127,138-byte s-Flame record. Only three metadata requests
run concurrently. The acquisition command starts with FLEX and saves completed
source captures incrementally, so a later source failure does not erase earlier work.

Download resolvers return expiring URLs. Those URLs are used only in memory and are
not stored in the snapshot, logs or application records. Downloads are restricted to
the observed HTTPS hosts `psi.nasa.gov` and `psi-repo-prod.s3.amazonaws.com`.
Host-changing redirects are refused. Returned HTML and responses exceeding the
declared limits are rejected. These controls do not establish scientific validity.

Twenty-three investigation records assert CC0-1.0. PSI-10 does not supply a license
identifier and remains unresolved for redistribution. License assertions are retained
at their source scope; public access alone does not establish the license of every
linked paper or asset. Source citations, notices and per-asset rights remain required.
The local checksums verify the bytes we captured; they are not NASA checksum attestations.

## First reproducible case

The first question is: **Which test-end categories occur in the published FLEX
experimental table, and why should they remain separate?** The version-1 file in
investigation version 5 contains 274 records and 15 columns. Exact source labels
count as 186 `Extinction`, 61 `Disruption` and 27 `Completion`. The downloaded
SHA-256 matches the earlier audit:
`37c88ce8ae9391b7544ff630a45ce87543d04d317cdbfbed104fe7d5c27e1b96`.

The FLEX adapter requires the exact reviewed header sequence and preserves unexpected
labels. Each counted record points back to one-based physical lines in the original
CSV, with line 1 being the header. Blank cells remain blank, explicit zero remains
zero, and quoted multiline cells retain both their first and last physical lines.
FLEX uses CP1252 decoding. The other nine captured CSVs decode strictly as UTF-8.

These counts are source-table records, not a verified independent-replicate count.
Disruption is not a negative extinction observation, and visible flame disappearance
does not itself prove the end of cool-flame combustion. The ambiguous `O`, `N`, `CO`
headers and `Burning rate; mm` header remain unchanged. No chemical relabeling,
burning-rate unit conversion, calibrated measurement, new-run prediction or whole-cabin
suppression recommendation is authorized by this table mapping.

The other nine CSVs are retained for source inspection and subsequent source-specific
adapters. Their row roles, calibration, endpoint meanings and joins still need the
W06/W07 work in the implementation plan. Three complete manifests establish the
available file inventory; the remaining 21 manifest acquisitions and the five earlier
audited supporting files remain separate planned work. No raw-media archive has
been downloaded or analyzed by this capture.

## Reproduce the acquisition

From a configured checkout, capture a new source directory rather than overwriting
the committed fixture:

```sh
python3 scripts/python.py -m nova_ember.adapters.acquire .data/acquisitions/psi-new
```

The command preserves acquisition errors and catalog-only entries explicitly.
`capture_complete: true` means the selected capture requests succeeded; it does not
mean all PSI assets have been acquired or that their scientific meaning is validated.
The source unit tests independently check the audited file hashes, known label counts,
physical row anchors, empty records, explicit encodings, changed inputs and blocked
download destinations.
