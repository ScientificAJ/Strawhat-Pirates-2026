# Science, units and source traceability review — 15 November 2026

This review covers the base research dashboard as well as its optional analytical
visualizations. It checks the implemented scientific workflow, registered
formulas, numerical boundaries, uncertainty language and source traceability.
It is a bounded software/reference audit, not independent validation of every
NASA measurement, calibration, scientific interpretation or predictive model.

## Reviewed workflow

1. Original source bytes remain separate from interpreted values. Source hashes,
   investigation/asset identities and physical cell/line/page locators remain
   attached to their frozen snapshot. A source record is not automatically an
   independent experimental run.
2. Reviewed adapters preserve raw strings, original units, composition/location
   basis, qualifiers and missingness. Canonical numbers require a supported,
   explicit transformation; ambiguous values, ranges, codes and unreported units
   are not silently repaired or replaced with zero.
3. Comparisons retain condition differences and unknowns. Quantitative pooling
   needs the declared comparability and independence contract. Relevance and
   applicability rankings are explicit policies, separate from evidence support,
   prediction readiness and safety probability.
4. Registered calculations retain input origin, equations, units, assumptions,
   settings and limitations. Reference/calibration declarations require source
   inspection; their presence does not certify their scientific quality.
5. Charts use checked quantities and explicit units. Missing observations remain
   missing, smoothing is a recorded display overlay and response surfaces retain
   observed support without interpolation. Source-record standard deviation is
   distinct from measurement uncertainty or an independent-run confidence interval.
6. Research claims pass mechanical origin, source, numeric and prediction-domain
   gates. Their citations expose the supporting facts and recorded source
   locations. Resolving a citation is not proof that the source entails every
   interpretation in a sentence.

The [calculation review](science-calculations-audit-2026-11-15.md) records the
specific equations, units, assumptions, original references and numerical fixes.
The [scientific-integrity review](scientific-integrity-audit-2026-11-15.md)
records the mechanism, evidence, comparison, ranking and claim-origin findings.

## SI and displayed-value findings

The source-unit vocabulary was checked for mm/cm to m, mm/s and cm/s to m/s,
mg/s to kg/s, percent to unit-one fractions, and Celsius to kelvin. These are
scale/offset conversions only. They do not establish pressure reference,
composition basis, calibration accuracy or experimental comparability.
Source-native units remain available; an unresolved non-SI field is not assigned
a guessed SI value. The conversion and quantity-label conventions were checked
against the [BIPM SI Brochure](https://www.bipm.org/documents/20126/41483022/SI-Brochure-9-EN.pdf/2d2b50bf-f2b4-9661-f402-5f9d66e4b507?version=7.0)
and [NIST SP 811, chapter 7](https://www.nist.gov/pml/special-publication-811/nist-guide-si-chapter-7-rules-and-style-conventions-expressing-values).

Three concrete issues were corrected at these boundaries:

- **Celsius offset cancellation:** default Decimal precision could round source
  values immediately above and below −273.15 °C into the same valid 0 K result.
  The converter now retains the supplied significant digits during affine
  arithmetic. A positive 10⁻³⁰ K remains positive, a below-zero result is refused,
  and exactly −273.15 °C still converts to exactly 0 K. Original source precision
  is preserved as text; serialization is still finite binary floating point,
  not a claim of physical precision.
- **Calculated chart coordinates:** stored-method tables omitted x-coordinate
  units and could present a display index as a physical source-row number.
  Calculated coordinates now retain both axis units, meaningful quantity titles
  and an explicit calculation origin. Point numbers are labeled as points;
  recorded source locators remain visible. Aggregate tables identify their actual
  contributing source rows. Derived columns are not assigned source-column indices.
- **Error summaries:** held-out RMSE, mean absolute error and signed bias now
  display their declared endpoint unit. Covariance displays continue to identify
  output units and explain that entry (i, j) carries their unit product.

Calculation jobs remain separate series, with no claim that the job count is an
independent-run count. Source hashes and calculation-provenance digests have
different labels. Values are not rounded for computation to match the screen.

## Uncertainty and evidence interpretation

The first-order covariance rule is conditional on the supplied Jacobian,
covariance and linearization justification. Standard uncertainty is not an
automatic coverage interval. This follows the distinction made in
[NIST TN 1297, appendix A](https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-appendix-law-propagation-uncertainty).
The calculation report documents the additional normal-denominator Monte Carlo
restriction and its primary references. No unreported uncertainty, confidence
percentage, missing observation or physical mechanism was fabricated.

The Sources feature uses numbered bracket citations on shown claims and a
per-response Sources list. Source facts, calculated results, interpretations and
unresolved citations retain their different meanings. Exact-location inspection
uses the existing frozen evidence reader; input anchors on a calculation are
labeled as source inputs, not original measurements of the calculated output.
Unsupported or absent source locators remain explicit instead of acquiring a
guessed page, row or video time.

Where a table fact retains a preview rather than a claim-specific cell, the
selector is explicitly labeled with that scope. Only its recorded physical rows
and matching original cell text supply locations. Selecting such a cell reveals
the source; it does not assert that every preview cell supports the sentence.

## Verification boundaries

Initial unit verification was limited to the changed scientific boundaries and
affected known-answer controls. Three Celsius boundary cases and two stored-chart
cases passed locally. The delegated calculation and integrity reports record
their own focused checks. No paid inference request was needed for this audit.

Two focused citation-helper cases and one bounded rendered chat flow passed.
The reply was an explicit interface fixture, while the source reader resolved
actual retained FLEX-007 lines 18–19 through the local HTTP API. The check covered
bracket/footer numbering, missing references, calculation-input qualifications,
keyboard return, a dark mobile view and a calculated table retaining Time [s]
without inventing source rows. The production build and generated-contract drift
check passed. This verifies the local source-reading path rather than a new live
model response.

The source reader is owned once per conversation, so citations in different
replies share one inspector. Switching conversation, scientific context or
visibility clears it; exact citations in compact chat open in place.

The owner subsequently requested a full product test pass after these changes.
Its suite, integration, runtime, browser and static/build outcomes are recorded
in [the full verification report](full-product-verification-2026-11-15.md).

Remaining scientific requirements include source-specific calibration and
uncertainty review, justified experimental independence, appropriate distribution
and residual assumptions, and an applicable validation domain for prediction.
The application does not infer those from matching labels, a source link, a
successful calculation or a passing software test. Hosted behavior and external
scientific acceptance are separate from this local review.
