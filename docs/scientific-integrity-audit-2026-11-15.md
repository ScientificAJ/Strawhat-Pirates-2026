# Scientific workflow and evidence audit

Review date: 15 November 2026. This review covers the base dashboard's source,
record, comparison, ranking, evidence-planning and research-answer boundaries.
It is a code and focused offline verification review, with primary-source
cross-checks. It does not establish independent scientific validation of every
ingested result, an operational fire-safety assessment, hosted behavior, or
general reasoning quality across unseen questions.

Quantitative calculations and uncertainty propagation are reviewed separately
in [science-calculations-audit-2026-11-15.md](science-calculations-audit-2026-11-15.md).
The umbrella review covers unit/display behavior separately. No paid research
or configuration-drafting request was made for this audit.

## Primary-source checks and their scope

The [NASA PSI BASS-II investigation](https://psi.nasa.gov/physci/repo/data/investigations/PSI-25)
identifies ventilation, oxygen and fuel geometry as separate experimental
variables. Its hypothesis and intended applications are not universal findings
about spacecraft materials. The retained dossier correctly exposes objectives,
hypotheses and prospective impacts in their original scientific roles and
leaves `findings` unset rather than manufacturing conclusions from them.

The [NASA BASS-II summary report, NASA/TM-20210011385](https://ntrs.nasa.gov/citations/20210011385)
describes chamber dilution calibration and several fuel/flow configurations.
Its experimental setup in section 2.2.3, printed page 21, distinguishes the fan
control from calibrated velocity and describes a radiometer check when the
visible flame disappears. This supports preserving calibration, measurement
location, configuration and endpoint definition rather than interpreting a fan
setting or image brightness as a measured flow or a confirmed final state.
[Original report](https://ntrs.nasa.gov/api/citations/20210011385/downloads/TM-20210011385.pdf).

The [NASA FLEX detailed-results report, NASA/TP-2015-216046](https://ntrs.nasa.gov/citations/20150023456)
describes hardware, diagnostics, procedures and data analysis for its first 284
tests; that publication scope is distinct from the retained PSI-69 CSV's 274
table records. Its FLEX-134 discussion, printed page 162, describes continued
rapid droplet vaporization after visible extinction and identifies behavior
indicative of cool-flame burning. Consequently a visible endpoint cannot alone
establish complete cessation of combustion, suppressant causation or cabin
effectiveness. [Original report](https://ntrs.nasa.gov/api/citations/20150023456/downloads/20150023456.pdf).

The [original cool-flame research abstract reproduced in the NASA FLEX presentation](https://www.nasa.gov/wp-content/uploads/2013/10/issrdc_2013-07-16-0945_nayagam2013.pdf)
also distinguishes radiative loss of the visible flame from a subsequent
low-temperature stage and a second finite-diameter endpoint. These conditions
do not authorize extrapolation to every FLEX record or every fuel. The direct
PSI-69 page did not expose readable text through this review's browser reader;
the frozen source files and their recorded identities remain the local evidence
for table and test-sheet statements.

## Source and record mechanisms

`Discovery.dossier` resolves a frozen snapshot, verifies retained metadata bytes
against their hash and checks accession/version before producing exact metadata
anchors. `Discovery.read_anchor` resolves source kind, investigation/document
identity, checksum and locator against that snapshot. Identical content hashes
do not by themselves identify an experimental record; ambiguous copies require
the appropriate source selector.

The source adapters preserve physical line positions, raw cells, row roles and
reviewed field interpretations. A normalized field requires a finite canonical
value, its unit and transformation provenance. Unknown, textual and unresolved
fields cannot also carry canonical values. Source value kinds distinguish
measurements, source reports, conditions, settings, codes and derived values.
Unknown pressure reference, composition basis, calibration or chemical meaning
blocks the relevant normalization; it is not replaced with an assumed value.

Record discovery applies explicit text, row-role and typed field predicates.
Numeric predicates use the reviewed canonical unit and normalized value; they
do not convert an uncalibrated setting into a velocity. Returned rows retain
their source snapshot and anchors. A result count describes matching source
records. A zero count is a gap in the inspected frozen assets, rather than proof
that the science was never studied.

`freeze_selection` sorts source hashes and physical row positions, rejects
duplicate or absent rows, records adapter identities, and hashes the frozen
definition. Its result explicitly retains `independent_run_count=None`.
Freezing rows neither demonstrates independent experimental units nor qualifies
quantitative pooling. Range, day, condition, session and note roles remain
visible.

The FLEX stop-label method checks the exact reviewed table headers and counts
each retained record's literal label. It keeps unrecognized labels visible and
does not collapse Completion, Disruption and Extinction into success/failure.
The source species headers `O`, `N`, `CO` and the table's `Burning rate; mm`
header remain unresolved for chemical/rate interpretation. The separate
FLEX-007 test sheet has explicit unit-bearing inputs; those do not silently
repair every table row. The difference between the 274 retained records and the
publication's 284-test scope remains a reconciliation question, not a reason to
rewrite either count or invent missing runs.

## Comparison and ranking algorithms

The investigation-level comparison supports side-by-side reading, marks
quantitative pooling unsupported and scenario transfer unresolved, and explains
the missing run-level material, atmosphere, gravity, flow and endpoint mapping.
Shared titles or apparatus do not establish comparable experiments.

The registered detailed condition comparison evaluates the supplied profiles
field by field. It retains units, reference basis and measured/nominal/derived
status. Different representations are unresolved. Numeric matching uses the
declared absolute tolerance in the same unit; nonzero tolerances need a domain
justification. Missing and conflicting states remain explicit. Its overall
status follows the most restrictive reported condition status. Eligibility for
a declared pooling protocol additionally requires every core field to be
critical and matched, distinct independent-unit IDs, known dependency groups,
a correction reference for shared groups and a pooling-protocol reference.
This is an assessment of supplied profiles and references, not an independent
reading of every underlying experiment. Supplying matching strings or a
protocol identifier does not validate physical equivalence or the protocol.

The two ranking policies are versioned discovery heuristics:

| Policy | Weighted components |
|---|---|
| Question relevance | question/outcome 0.30; material/geometry 0.25; environment 0.25; measurement 0.10; scale/protocol 0.10 |
| Scenario applicability | endpoint 0.25; material/geometry 0.20; atmosphere 0.20; flow/gravity 0.20; apparatus/measurement 0.15 |

Exact-filter failures are excluded before scoring. For known components the
contribution is `L = Σ(wᵢ cᵢ)` and known weight is `W = Σwᵢ`. If a component is
missing, the displayed complete score is absent and the possible-score upper
bound is `min(1, L + 1 − W)`; missingness is not hidden by renormalization. This
bound is not a statistical confidence interval. Ordering uses descending known
weighted contribution, with stable item ID as the tie breaker. Evidence support,
critical mismatches and modeling readiness remain separate. Every ranked item
has `eligible_for_inference=False`; a high score grants no predictive, causal
or safety authority. These weights are product policies, not NASA-derived
physical laws or empirically calibrated probabilities.

## Evidence plans and interpretation

Claim comparison builds a matrix across the full required condition list and
any extra supplied conditions. It first distinguishes unknown endpoints,
different conditions and missing scope. Equal units and reported values under
matched nominal conditions can produce `same_reported_value`; unequal values
can produce `potential_conflict`. Both retain
`scientific_verification=not_established_by_this_comparison`. Measurement
uncertainty, dependence and a physical explanation still require assessment.
This method does not perform unit conversion, uncertainty-overlap analysis or
semantic verification of the claims' text.

Hypothesis plans retain a mechanism, supporting and contrary evidence,
discriminating observation, falsifier, assumptions and variables. Information
gain remains absent without a validated probabilistic observation model. A
planning result neither performs nor authorizes a physical experiment.

Control and Earth-transfer routes resolve their supplied evidence anchors
before returning a planning record. They keep mechanisms, countereffects,
interactions, transfer constraints and validation needs visible. Operational
suitability is not established and automatic Earth/space equivalence is false.
A caller's chosen label such as `documented_application` is retained as a
submitted evidence status; anchor existence alone does not independently
establish that label's scientific interpretation.

## Concrete corrections from this review

An offline reproduction found that a metadata fact containing `record_count=274`
could mechanically support a claim labeled `calculated`, and that a qualitative
sentence asserting a measurement could pass with only metadata because it had
no numeral to check. This was a provenance defect, separate from the broader
challenge of interpreting scientific prose.

The answer verifier now requires a completed deterministic-calculation fact
for a `calculated` claim. Refusals do not establish a result. Numeric support
for that origin comes from those calculations, so an unrelated metadata numeral
cannot fill a missing result. The analogous restriction applies to `predicted`:
an actual in-domain prediction must supply the numeric support. A prediction
fact plus unrelated source metadata cannot manufacture a different prediction.

Explicit measured wording now requires a reviewed measurement field even when
the sentence is qualitative. A nominal setting, raw metadata or scenario
calculation cannot supply that status. Local qualifications such as `not a
measured burn time` remain readable; each occurrence is checked so an earlier
negated clause cannot mask a later positive measurement assertion. Literal
summaries of separately selected private inputs retain their user-supplied
origin and do not become canonical NASA measurements.

The related tool-origin audit also separates source inspection from actual
transformations. BASS calibration-evidence and FLEX trace-evidence inspection
now return `source_text` facts; reading their reported nominal inputs or
eligibility notes is not a newly performed calculation or fit. FLEX label
counting retains `deterministic_calculation`. A frozen cohort's explicit
selection/count transformation now has that calculated origin as well, while
its source rows, unknown independence and pooling limitations remain intact.
Stored historical jobs and provider captures were not rewritten or re-evaluated
as new live outcomes.

The research tool's investigation reader also now reuses that authoritative
`Discovery.dossier` path. It previously returned a general investigation record
with a broad metadata marker, omitting the dossier's exact field anchors. It
now retains and validates the actual metadata-field anchors, including nested
typed anchor objects, while preserving the metadata origin, scientific field
roles, limitations and absent findings. This lets core research citations
resolve the original metadata location without treating an objective as a
measurement. The focused workflow case checks the real retained-source walk
with a typed metadata anchor and verifies that it is resolved.

A second reproduction found that claim comparison treated identical natural
language `not measured` placeholders as matched, while the underscore form was
recognized as unknown. Missing-marker handling now normalizes case, whitespace
and underscore spelling before identifying unresolved conditions. The same
rule includes bounded unreported, unavailable and undetermined labels and
normalizes hyphen variants as well. It keeps unknown text visible in control
and transfer reports. A numeric zero
or an explicit `0 m/s` is preserved as a value. The related supplied-profile
validation correction is recorded with the quantitative-method review.

## Verification and remaining limits

Five new offline claim-origin cases passed, plus two existing affected
measurement/unit cases: metadata-only and refusal-only calculation rejection,
cross-origin numeral rejection, prediction support, qualitative measurement
provenance, local negation, original/canonical unit pairing and legitimate
scenario calculation display. Two focused evidence cases passed for unknown
condition spellings and control/transfer handling with zero preserved.
The method-origin correction added one focused mocked workflow case covering
source inspection, the exact metadata-dossier anchor path, actual count/selection
calculations and their downstream claim eligibility. The existing missing-marker case also passed with the
additional spellings. Those corrections were covered by ten distinct focused cases. Ruff
and Mypy passed for the four changed source modules. No broad suite, provider
evaluation retry or new live experiment was run for this review.

The verifier still performs mechanical provenance, locator, numeric and unit
checks. It does not prove that an arbitrary sentence has the same meaning as a
cited passage, that a causal mechanism follows from an association, or that
matching nominal values imply comparable experiments. The measured-word check
is lexical and does not recognize every possible synonym or linguistic form.
Any claim presented as an interpretation remains an interpretation. Independent
source-passage reading, protocol/endpoint review, uncertainty assessment and
domain judgment remain necessary for consequential conclusions.

This audit did not reconcile all source rows into independent experiments,
resolve the FLEX table's ambiguous headers, establish measurement uncertainty
for every source, calibrate a cabin model, verify every scientific mechanism in
the catalog, or establish prospective Earth benefits as demonstrated
applications. These are explicit evidence gaps, rather than confident claims
created from incomplete material.

## Subsequent full-product verification

After the scoped audit, the researcher explicitly requested a full-product test.
The complete Python suite passed 639 cases against the separate
`nova_ember_test` and `nova_ember_sources_test` databases with actual qualified
gVisor execution enabled. There were no failures or skips. Global Ruff passed,
all 164 Python files passed formatting, and Mypy passed all 82 source files.

A final read-only parser check then reproduced a narrow unit-token defect:
`0.68 mm^2/s` was recognized in the correct unit but its exponent was also
treated as an additional scientific numeral. Numeric claim parsing now excludes
exponents inside an already recognized scalar-unit span, including a terminal
sentence period absorbed by the numeral matcher. Standalone quantities remain
checked. Unknown or malformed exponents such as `mm^2.3/s` remain visible and
cannot gain support through this exclusion. One additional focused case checks
caret/superscript equivalence, standalone time and area values, wrong units,
wrong values and malformed exponents.

The final complete Python rerun after that patch passed **640 cases in 57.01
seconds**, with **zero failures and zero skips**, using the same two separate
test databases and actual gVisor execution. Ruff, formatting and Mypy passed
for the final affected module/test changes. The test process used an offline
provider placeholder rather than a paid provider credential. This did not
exercise live-provider scientific interpretation. Browser and web build checks
are reported separately by the full-product review.

Logs are retained under `/tmp/nova-full-product-2026-11-15/`. The initial full
run is `python-suite.log`; the final 640-case run is `python-suite-final.log`.
Global static-check logs are `ruff.log`, `python-format.log` and `mypy.log`.
The application database, stored provider results and historical audit outcomes
were not rewritten by these tests.
