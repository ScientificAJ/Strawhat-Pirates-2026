# Source-record interpretation dictionary

The version-1 adapters interpret the ten frozen experimental CSVs in the local PSI
snapshot. They preserve the original files and index. `interpret_table(asset, table)`
returns the shared Pydantic `InterpretedTable` contract from
`nova_ember.domain.records`. An interpretation identifies source grain and explicit
field meaning; it does not verify experimental independence, calibration, causal
effects, detection performance or model applicability.

## Table grains

| Source | Row kind and count | Interpretation boundary |
|---|---|---|
| FLEX, PSI-69 | 274 `source_test_record` | Keep Extinction, Disruption and Completion as distinct source labels. The ambiguous O/N/CO and burning-rate headers remain unresolved. |
| BASS-II, PSI-25 | 129 `source_test_record` | Fan, air and radiometer controls remain settings. An uncalibrated display is not physical airflow. No extinction label is manufactured. |
| SAME-R, PSI-101 | 109 `condition_record` | Heating, velocity and timing conditions do not provide alarm endpoints, labeled negatives or detector false-positive rates. |
| CFI-G normal, PSI-159 | 179 `source_test_record` | Preserve source codes and configuration. Approximate pressure, composition basis and stream location are not silently resolved. |
| CFI-G inverse, PSI-159 | 154 `source_test_record`; 861 empty records skipped | A zero burn time, failed-ignition comment and dash termination code remain distinct. Blank CSV records are not trials. |
| Saffire-II, PSI-99 | 9 `sample_record`, 2 `flow_visualization`, 4 `note` | Sample data, flow assets and explanatory notes remain separate. No material fill-down, damaged-header repair or inferred ninth-to-fifteenth trial is performed. |
| BRE, PSI-20 | 18 `daily_summary` | Concentration lists and daily flame counts cannot be expanded into test combinations. The notes say pressure varied but is not identified here. |
| FLEX-2, PSI-68 | 8 `range_summary` | Fuel/condition ranges are not eight independent burns. Multiple settings remain text. |
| CFI, PSI-39 | 87 `condition_record` | The source gives conditions and support information without an explicit outcome column. |
| DAFT, PSI-47 | 2 `session_record` | Dust sessions and hardware descriptions do not become smoke-detector performance examples. |

`independent_run_count` is always null in this contract. A source test identifier
alone does not resolve independence across specimens, campaigns, repeat tests,
channels or reused publications. Counts refer to the captured files, not every
asset available for the investigation.

## Source and field anchors

The table retains its accession, exact file name, file version, SHA-256 and stable
resolver URL. Every record exposes:

- `source_row`: first one-based physical CSV line; the header is line 1.
- `line_end`: final physical line, preserving quoted multiline cells.
- `row_kind`: the source grain above, or `unclassified_record` when unreviewed.
- `raw_cells`: every decoded original cell, including blank cells and explicit zero.
- `fields`: interpretations keyed by zero-based `column_index` and unchanged
  `source_column`, including spaces, source spelling and damaged characters.

Each field retains `raw_text`, optional quantity kind and original unit, any safe
canonical value/unit, a status, missing reason, qualifier and explanatory notes.
`basis` and `location` are populated only where their source meaning is established.
Unknown composition basis/location is explicitly `not_reported`; it is not an
assumed cabin atmosphere. A malformed row with an extra cell retains that cell with
an absent source-column label rather than inventing a header.

`source_value_kind` records the defensible origin class: `source_reported`,
`measurement`, `condition`, `setting`, `derived`, `code` or `not_specified`.
These are descriptions of source assertions, not independent verification stamps.
In particular:

- BASS-II fan, air and radiometer fields are settings. The source's calibrated
  O2-header assertion is retained without claiming that the app validated its calibration.
- Saffire-II O2 is source-derived: Note 1 describes CO2 production and an initial ISS
  oxygen reference. It is not relabeled a direct O2 sensor measurement.
- CFI-G `Tad` is a source-derived thermodynamic quantity. Peak burner temperature is
  source-reported measurement data; these fields remain separately identified.
- CFI-G normal and inverse `XO2`/`Xf` columns remain distinct. Their CSV headers do
  not explicitly anchor composition basis and stream location. More specific
  chamber/burner mappings require the protocol or paper source anchor.

## Values, missingness and uncertainty

| State | Representation |
|---|---|
| Unqualified scalar with reviewed units | `normalized`, original text retained, canonical value/unit and transformation provenance present |
| Ordinary source text or retained label | `text`; no invented numerical value |
| Empty cell | `missing` with `not_reported` |
| Exact `n/a` or `not applicable` | `missing` with `not_applicable` |
| Dash or `none` | `unresolved` with `ambiguous`; not silently zero, false or no event |
| Spreadsheet error such as `#DIV/0!` or `#VALUE!` | `unresolved` with `invalid`; no non-finite numerical result |
| Approximation, range, multiple settings or ambiguous semantics | `unresolved`, qualifier and original text preserved |

Approximation can come from the header: every CFI-G `approx p (bar)` field retains
the approximate qualifier even when its cell has no tilde. A range stays a range;
it is not replaced by a midpoint. Approximate values and significant digits do not
supply a measurement-uncertainty model. No uncertainty interval is fabricated.

The literal Saffire-II `037 mm` is flagged for source clarification. It is neither
repaired to `0.37 mm` nor promoted to a resolved `37 mm` thickness. The damaged
`?-g` headings remain unresolved. Composite-sample strings and `Insignificant`,
`Complete`, `Acceleratory` and note references remain qualitative source text.
BRE's `3400%` and `2100%` are flagged invalid as percentages while preserving their
original text; they are not repaired to 34% and 21%.

## Unit conversions

Conversions use a small closed vocabulary of exact metric scale factors and the
Celsius-to-kelvin offset. They operate only on complete finite scalar numerals with
explicit, reviewed source units. Decimal arithmetic retains the source precision
until JSON numeric serialization. Examples include:

- SAME-R inlet velocity `8.1 cm/s` → `0.081 m/s`.
- Saffire-II thickness `0.27 mm` → `0.00027 m`.
- BASS-II source volume percentage `22.2%` → volume fraction `0.222`.
- CFI-G peak burner temperature `27.1 °C` → `300.25 K`.

Every converted field records `transformation_id: source-unit-conversion-v1` and
the factor/offset formula. Unit conversion does not add a pressure reference,
composition basis, calibration record, endpoint interpretation or independent run.
Unknown pressure references, ppm basis, damaged headers and FLEX's dimensionally
ambiguous burning-rate field remain unresolved even when a numerical token exists.

## Mapping refusal and verification

The adapter checks the exact reviewed file identity, version and header sequence.
Changed headers, changed versions, unregistered files or mismatched row widths
produce `schema_unrecognized` with explicit `refusals`. The original headers,
all source records and every raw cell remain readable. No typed numerical mapping
is supplied for that unsupported schema. Unknown Saffire row roles remain
unclassified instead of being counted as samples.

Run the focused checks with:

```sh
uv run pytest tests/test_records.py tests/test_quantities.py
```

The checks use independent metric/temperature answers, actual source-role counts,
source-line examples, derived-versus-measured distinctions, original zeros and blanks,
failed-ignition records, ambiguous thickness, damaged headers, range preservation
and deliberate schema/identity changes. They do not establish scientific validity
of analyses that require calibration, source protocols or independent validation.
