# Catalog facets and source scope

Discovery supports purpose, fuel phase, material, facility/apparatus, instrument,
endpoint, publication and scientific-review facets at both investigation and
source-record level. These are **catalog classifications**, separate from the
physical source-field predicates that filter actual rows.

`catalog-focus-annotations-v1` uses the retained PSI metadata capture. Declared
research area/sub-area, apparatus and publication entries retain their original
source fields. A small accession-specific annotation table selects literal
objective/approach passages for additional classifications. Each annotation is
pinned to its metadata SHA-256; a changed capture does not inherit an old
classification. Source inspectors expose the original field, quotation, version
and hash. An annotation establishes source scope, not independent validation.

| Facet              | Meaning and limits                                                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose            | Declared research focus plus explicitly annotated research objectives. A proposed benefit is not a demonstrated result.                                                                             |
| Fuel phase         | A declared category or source-pinned objective/approach annotation. It does not assign a phase to every run.                                                                                        |
| Material           | Materials or fuels named in catalog scope. Selecting PMMA at catalog level includes the investigation’s other sample rows; use the actual source-column predicate to restrict individual materials. |
| Facility/apparatus | The declared hardware name, with the existing explicit alias map. Shared names do not establish common configuration or calibration.                                                                |
| Instrument         | Source-pinned instrument descriptions. A replacement, modified instrument or control keeps that distinction. No sensor-performance value is inferred.                                               |
| Endpoint           | A declared research target, including explicitly labeled simulated observables. It is not an observed outcome or proof that a test completed.                                                       |
| Publication        | Titles and DOIs listed in retained metadata. A listing is not a verified finding or an assertion that a paper was acquired.                                                                         |
| Scientific review  | Not classified; no formal scientific review is recorded by this index. Publication status is not substituted for scientific review.                                                                 |

Annotations are partial. “Not classified / not reported” means this index has no
classification for that investigation in that dimension. It is not evidence that
the source contains no relevant material or that a scientific condition is absent.
Literal and semantic source search remain available. Physical record predicates
continue to distinguish measurements, conditions, derived values, settings,
canonical units, missing values and unclassified original text.

## Queries and counts

Both discovery queries accept `catalog_facets`, with OR among selected values in
one facet and AND across different facets. The query allows eight named groups
and up to 32 values per group. Saved queries, collections, frozen query IDs and
source-coverage requests retain the selection.

Counts cover the full matching query before pagination. Each facet’s options
retain other applied filters while excluding that facet’s own selections. This
lets a researcher see alternatives without clearing a group first. Counts use the
selected entity grain: one investigation in investigation mode, or original
source records in record mode. A count of nine sample records is not a count of
nine independent experiments. Multiple facet values can refer to the same item,
so option counts must not be summed as mutually exclusive populations.

The narrow-screen drawer stages changes until Apply. Count labels identify
previous results while a query updates; unapplied selections do not establish a
new count. Long vocabularies have an option search, and active values remain
visible and removable. No inference service, migration or new external service
is required for these facets.
