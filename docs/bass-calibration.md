# BASS-II calibration and supporting-source inspection

Inspection date: 14 November 2026. This is a successor to the empirical audit's
download-and-hash observation. The original audit and first source snapshot are
unchanged. No new fit or run-level calibrated velocity is claimed here.

## Retained sources

The independent `tests/fixtures/nasa-psi-supporting/snapshot.json` contains five
original files totaling 4,120,870 bytes. Every size and locally computed SHA-256
matches the earlier audit. Three investigation metadata records and three complete
manifests are copied byte-for-byte alongside them so source versions and file
visibility remain inspectable. NASA's manifest checksum fields are blank; these
are locally verified hashes, not NASA-attested checksums.

| Investigation | File and version | Bytes | SHA-256 |
|---|---|---:|---|
| PSI-25 v4 | Fan calibration data.xlsx, file v2 | 23,973 | `bc0dca3efdef44a7774d8dd37aebc0cedae8d67d7bae8c9cbde9590014a3c983` |
| PSI-25 v4 | BASS-II_Test.Matrices.xlsx, file v2 | 28,956 | `1a3b283dd0adec861793bbc4a454aab64d398cd32d6f37d7a1ad0f642879e686` |
| PSI-101 v4 | SAME, SAME-R_Results.xlsx, file v1 | 4,061,669 | `6d3a539ccf425b1fa8edc19cc75d828f57d650c7ce734d4e7aa686fea9593218` |
| PSI-69 v5 | FLEX-007_DropletData.txt, file v1 | 5,366 | `b23c77bbca5896142369d6b6e2c1c964ce527ea0fbaaebea6de69bb3e7b79f6b` |
| PSI-69 v5 | FLEX-007_TestSheet.txt, file v1 | 906 | `cb748242c189bca59b861d0bb0f406fb7a80aee1710cee363f7620c43d66e2a0` |

The snapshot stores exact stable resolver URLs, DOI, investigation/file versions,
manifest entry, timestamps, source hashes and the investigation-level CC0-1.0
license assertion. That scope remains explicit rather than inventing a separate
asset-specific license declaration. Expiring download URLs are used only in
memory. The official resolver for these supporting files returned the additional
exact host `psi-curation-prod.s3.amazonaws.com`; the client permits that observed
host and rejects lookalike suffixes.

## What the fan workbook actually says

The workbook has one sheet, `Fan Calibration data`, with 1,755 populated cells and
38 formula cells. The reader exposes original strings, raw numeric values, styles,
formula text, shared-formula attributes and cached formula values separately. It
does not calculate formulas, reinterpret date serials or assign physical units.

- `A33` states `*U =1.0066(AIR)`; `E6` labels the example output `U cm/s*`.
- `E2`, `E3` and `E5` identify that column as an example of estimating test-section
  flow. For example, `C7` is the Air Display value `29`, `E7` contains formula
  `1.0066*C7`, and its source cache is `29.191399999999998`.
- `A34` ties the example to SPICE fan calibration data at 56 mm downstream and
  36 mm from the bottom, identified as the centerline.
- `D4`, `D14` and `D23` identify zero-, one- and two-restrictor sections. `D1`
  explains incomplete calibration days, fixed-voltage operation and the warning
  against using the nominal 3.8 V zero-flow point. Decreasing-pot annotations are
  present in the source.
- Separate day/session blocks include post-soot-cleaning and door-repair context.
  Day 188 has both a post-cleaning profile (`AZ4`) and an end profile (`BD4`).
  Their entries at fan display `88.5` differ: `BA28` gives air display `15.5`,
  whereas `BE28` gives `20`. One universal fan-display-to-flow curve would erase
  this recorded dependence.
- `B3` and `T3` both store date serial `41730`, while `B4` and `T4` label different
  days, `2014-043` and `2014-091 - door repair`. Both assertions remain visible;
  no date was silently corrected.

## Run identity is useful, but does not establish calibration validity

The matrix workbook has six sheets: `Bhattacharjee`, `Ferkul`, `Miller`, `Olson`,
`Fernandez-Pello`, and `T'ien`. They contain 2,141 populated cells and no formulas.
The source date column is a numeric date serial with workbook style metadata;
the GMT, investigator, test, sample and controls retain separate anchors.

For B1, experimental CSV line 2 matches `Bhattacharjee!C2` (`B1`) and `D2` (`147`).
The controls also agree: `F2` is restrictor `2`, `G2` is fan display `62`, and `H2`
is air display `5`. GMT day 50 has a retained calibration block at `P4`.

This is a traceable identity join. It does not prove that the SPICE-based example
is an applicable local-velocity calibration for the specimen in this BASS run.
The retained files do not establish a reviewed mapping of measurement location,
apparatus state, environmental dependence and calibration uncertainty. The code
therefore returns `calibration_unresolved`, `velocity: null`, and exact source
anchors. It does not interpolate between fan settings or treat a displayed number
as velocity. B6 additionally has changing controls and two same-day profiles, so
it cannot be represented by one silently averaged setting.

Next work is to inspect the source-specific calibration protocol and apparatus
documentation, resolve conflicting dates/session applicability, define the
measurement location and valid regime, and validate any chosen conversion against
independent known examples. Missing uncertainty must remain unreported rather
than receiving invented error bars.

## FLEX-007: stronger units, incomplete fit support

The raw trace contains 141 records and explicitly names time in seconds and
diameter in millimeters. Empty X/Y-position cells and negative time values remain
unchanged. The time-zero event and diameter/calibration method are not inferred
from the column names.

The test sheet supplies stronger evidence for this particular run:

- Line 19 reports `kavg (mm2/s) = 0.68`; that is a source-reported value, not a
  reproduced fit, and it does not authorize rewriting every ambiguous CSV header.
- Line 20 states `Fiber: No`, and line 21 records `Dext (mm) = Disruption`.
- Line 25 describes luminous-flame obscuration during much of the test and the
  last part of the droplet history. An ending trace is not an observed complete
  chemical-extinction event.

The app can show the source trace, reported result and limitations. A new D² fit
still needs a source-validated diameter definition, image calibration, visible
time interval, ignition/time reference and appropriate burning regime. No new
fit is released from these files alone.

## SAME supporting workbook scope

The SAME/SAME-R workbook expands to 20,900,278 OOXML bytes. Structural inspection
finds 43 sheets, 165,666 populated cells and 147,559 formula cells, including
`SAME R Results`, `Reduced Data with ISS Det` and detection-analysis sheets.
Formula caches remain distinct from direct observations. This structural count
does not validate the detector definitions, source joins, alarm timing or
false-positive labels; those require their own source-specific analysis.

## Repeatable checks

Run `python3 scripts/python.py -m pytest tests/test_supporting.py tests/test_calibration.py`.
Tests verify every captured hash, formula/cache distinction, retained dates and
session differences, exact B1 anchors, explicit refusals and FLEX's obscuration
and endpoint limits. The bounded OOXML reader uses the Python standard library;
no spreadsheet service or new package is required.
