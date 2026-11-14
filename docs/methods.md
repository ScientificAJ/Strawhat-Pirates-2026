# Registered scientific methods

The deterministic methods take explicit typed inputs and return their original
request, context, source references, method identifier, assumptions and limits.
`MethodContext.input_origin` distinguishes measured inputs, analyst inputs and
synthetic references. A successful calculation does not establish that the
supplied calibration, protocol or scientific interpretation is correct.
Original source cells and files remain separate from these derived objects.

## Trace fits

`nova_ember.analysis.fits.fit_trace(TraceFitRequest)` implements the two
registered descriptive fits. It converts explicit length/time units to SI and
fits a straight line with time centered on the selected interval. Input samples
remain ordered; duplicate or reversed times are rejected. Every excluded point
retains its source locator and reason. The result includes original selected
points, fitted values, residuals, signed slope, intercept at interval start,
RMS residual, coefficient of determination when defined, and a lag-one residual
correlation diagnostic when defined. Python, NumPy and SciPy versions are saved.

- `flame_front`: calibrated front position versus time; the signed slope is
  reported in m/s. The observable, direction, viewing geometry, clock,
  spatial calibration and ignition-transient treatment must be explicit.
- `droplet_d_squared`: measured diameter is squared explicitly and fitted
  against time; the negative slope is reported in m²/s. The diameter definition,
  support, burning regime and regime evidence must be explicit. A nondecreasing
  squared-diameter fit does not become a positive burning constant.

At least three selected points are required for diagnostics. Missing calibration
or regime information returns a structured `needs_data` result with no value.
By default, uncertainty remains unreported. A slope confidence interval is
available only for an explicitly justified independent normal residual model;
it does not include unmodeled calibration error or within-run dependence.
Neither sample count nor fit quality establishes independent experimental runs,
prediction outside the observed interval, or physical validity of the selected
regime. See [SciPy's regression documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.linregress.html)
for the conditional slope-error interpretation.

## Atmosphere and dimensionless calculations

The original oxygen-partial-pressure method remains unchanged. The added
ideal-gas molar-density method uses mole fraction, absolute pressure in Pa,
temperature in K and an explicit ideal-gas justification. Equal partial pressure
or molar density does not imply equal flammability.

The dimensionless registry uses these specific conventions:

| Method | Definition | Required source-specific quantities |
|---|---|---|
| Reynolds | ρUL/μ | Density, velocity, length, dynamic viscosity |
| Thermal Peclet | UL/α | Velocity, length, thermal diffusivity |
| Mass Peclet | UL/D | Velocity, length, mass diffusivity |
| Advective Damköhler | (L/U)/τchemical | Velocity, length, chemical timescale |
| Grashof magnitude | gβ\|ΔT\|L³/ν², ν=μ/ρ | Gravity, thermal expansion, temperature difference, length, density, viscosity |
| Bulk Richardson magnitude | gβ\|ΔT\|L/U² | Gravity, thermal expansion, temperature difference, length, velocity |

Every request records the characteristic-scale definition, property temperature,
property reference and approximation justification. Missing inputs stay unknown;
zero gravity is a real value, while a zero advective denominator is unsupported.
These definitions do not automatically prove dynamic similarity, match an
acceleration history, or replace gravity with an electric-field-driven flow.

Oxygen-consumption heat release uses supplied, corrected inlet/outlet **oxygen
mass flows** and a source-specific heat yield. It requires mass-balance, flow,
sensor, transient-correction and coefficient references. The method supplies no
universal coefficient and never converts a before/after oxygen concentration
reading directly into heat release.

## Event and detector methods

Event timing keeps failed ignition, sustained burning, visible extinction,
cool-flame cessation, disruption, intentional termination and observation end
separate. The request includes the start and endpoint definitions, common clock
and source-specific terminal-event policy. A prior competing/terminal event
stops follow-up for the selected endpoint. Right censoring is reported only
under the supplied policy; noninformative censoring and survival probabilities
are not inferred from a label.

Detector timing requires a defined start, alarm endpoint, synchronized clocks,
transport path, instrument response and threshold. Separately measured component
delays retain their measurement reference; unallocated delay does not acquire an
invented physical mechanism.

Labeled detector evaluation takes one score per declared independent unit and
returns the confusion matrix and the defined sensitivity, specificity,
false-positive rate and precision. A missing class denominator stays unknown.
An ROC curve requires both positive and negative labeled cases; tied scores
cross the threshold together. Threshold selection on evaluation data still
requires a separate held-out evaluation. Smoke-condition rows and dust sessions
are not implicitly labeled detector-performance examples.

## Uncertainty, sensitivity and information gain

First-order propagation calculates `J Σ Jᵀ` with a supplied Jacobian, correlated
covariance, units and linearization justification. Matrix dimensions, symmetry,
nonnegative variances and positive semidefiniteness are checked. Numerical matrix
checks use correlation scaling and a dimension-dependent floating-point tolerance, not a
scientific tolerance or a replacement for missing covariance. See
[NIST's propagation guidance](https://www.itl.nist.gov/div898/handbook/mpc/section5/mpc55.htm).

Monte Carlo propagation supports bounded registered product, ratio, oxygen
partial pressure and ideal-gas oxygen-density functions. It draws a justified
multivariate-normal input distribution with its supplied covariance and records
the seed, PCG64 generator, NumPy version, sample count, output interval definition
and two-half mean/standard-deviation convergence diagnostics. Invalid physical
samples are rejected as a distribution/domain error; none are clipped,
discarded or resampled silently. Nonconvergence remains visible. A central
output probability interval is not a confidence percentage for scientific truth.
Analyst sensitivity distributions retain that label and do not become measured
uncertainty.

Expected information gain is calculated only for an explicitly justified finite
hypothesis/outcome probability model. Priors and conditional likelihoods must
sum to one; normalization corrects only accepted floating-point summation noise.
The result includes expected bits, outcome probabilities and posterior
probabilities, with impossible outcomes left without a posterior. Feasibility,
cost, mechanisms, contrary evidence and falsifiers remain separate parts of the
research-design brief.

## Comparability, ranking and scenarios

Comparison preserves each supplied condition's raw value, unit, reference basis,
measured/nominal/derived status and source locator. It reports matched, different,
unknown, incompatible and unresolved conditions separately. A nominal fan setting
cannot match a measured flow through equal numerals. Units or reference locations
that differ remain unresolved until an explicit transformation establishes a
common representation. Nonzero numerical tolerances require a justification.

Side-by-side display stays available with differences visible. Quantitative
pooling additionally needs all core fields matched under critical rules, known
independent-unit and dependency-group identities, a declared pooling protocol,
and a correction reference for shared groups. Omitting or making a core field
noncritical cannot qualify pooling. Matching profiles do not establish causal
or certified safety equivalence.

The two preserved ranking policies have their own exact versioned weights:
`question-relevance-v1` (30/25/25/10/10) and
`scenario-applicability-v1` (25/20/20/20/15). Exact filters precede scoring;
missing components retain unknown scores, known contribution/coverage and an
upper bound rather than being silently renormalized. Ties use stable item IDs.
Evidence support, critical mismatches and modeling readiness stay separate.
Ranking alone never authorizes a scientific inference or becomes a safety
probability. Source-provided component scores and explanations remain inspectable.

Spacecraft/station, lunar, Mars, rover, suit and Earth-transfer presets identify
research contexts while leaving unspecified numerical conditions unknown. The
30%-oxygen/10.2-psia example is explicitly hypothetical, not a mission standard.

## Small regression and prediction

`nova_ember.modeling.regression.evaluate_regression` implements one fixed
single-predictor OLS method for a prespecified continuous endpoint. Its protocol
fixes the endpoint/units, predictor/units, target use, exclusions, grouping,
constant joint conditions, independent-group requirements and physical-unit
acceptance limits before evaluation. One analyzed outcome is accepted per
independent experimental unit. Shared group identities are connected transitively
so specimen, campaign or duplicate-publication links cannot cross training and
held-out splits. Centering and fit parameters use training data only.

The joint domain explicitly covers every shared `COMPARISON_FIELDS` condition,
including oxygen basis and location, pressure reference, flow, gravity magnitude,
direction and history, material preparation, apparatus, measurement and processing.
It additionally fixes the reference units/location and burning regime. Unknown,
unreported or unresolved values cannot qualify as a matched domain. Observations
and prediction requests must supply exactly the declared condition keys; extra
conditions are unsupported, rather than ignored.

An optional `predictor_condition` maps the single scalar predictor to one numeric
physical field: thickness, scale, oxygen fraction, pressure, temperature, flow
velocity, gravity magnitude or observation window. That field is removed from
`fixed_conditions`; its condition string must be the same finite numeral as
`predictor_value`, expressed in the declared `predictor_unit`, for each observation
and prediction. No unit conversion or extra varying dimension is inferred. All
remaining domain conditions stay fixed. For example, varying flow velocity does
not permit a simultaneous change of atmosphere, flow direction or gravity.

An inapplicable condition uses the exact value `not_applicable` and an entry in
`not_applicable_conditions` containing a specific `justification` and a `source`
(`EvidenceReference`). That reference must also occur in `MethodContext.sources`;
measured inputs additionally require its physical asset SHA-256. The local
registration path resolves these source hashes through its frozen evidence
anchors. Endpoint, protocol, reference units/location and regime cannot be
excluded. A source locator and justification are inspectable evidence claims,
not automatic proof of non-applicability; the maintainer must check their content.

For local registration, `--not-applicable-evidence <path>` supplies a JSON map
from every excluded condition to an `anchor` (the existing `EvidenceAnchor`
contract) and `source_quote`. The anchor must be included in the registration's
anchor list, identify the exemption's physical source, and resolve to text that
contains the exact quote. The stored registration retains the quote alongside
the justification and source reference. This checks the source content and its
location; the inference that it makes a condition inapplicable remains an
explicit maintainer assertion for the stated endpoint and domain, not an
automated scientific validation or a required external review workflow.

A card stores training/held-out counts and group counts, residuals, held-out
RMSE/MAE/bias, a frozen training-mean baseline, predictor range, domain,
qualification failures and an immutable content digest. Independent sample-size
adequacy requires the study's justification; the implementation's minimum counts
are mathematical prerequisites, not a universal scientific sample-size rule.
Insufficient groups, missing review/uncertainty evidence, failed physical-unit
limits, extrapolative evaluation or a failed baseline comparison block
qualification. The registered IID prediction interval additionally requires one
analyzed outcome per effective dependency group. Cross-investigation claims
require wholly held-out investigations.

Even an eligible candidate is **not an active registered model**. Prediction
requires an accepted immutable application-owned registration, and the card's
digest is verified. The public request must not supply a registration override.
A request outside the registered predictor range or fixed scientific conditions
returns `outside_validated_domain` with no numerical prediction. Reported
prediction intervals retain their conditional residual-model interpretation.
No NASA regression is activated by these analytical tests or by source-table row
counts.

## Calibrated images and trace conversion

`nova_ember.analysis.media.measure_image` reads selected bytes after verifying
their SHA-256. PNG/JPEG/TIFF/BMP inputs are bounded to 20 MiB compressed and
8 million decoded pixels; the selected ROI is bounded separately. The direct
measurement path accepts explicit 8-bit grayscale/RGB sources. Other pixel
depths, palette/alpha data and nondefault EXIF orientation require a visible,
recorded conversion first; no resizing, auto-orientation, hidden bit-depth
reduction or color correction is performed. See the
[Pillow image API](https://pillow.readthedocs.io/en/stable/reference/Image.html).

The request fixes the ROI, channel/luminance convention, threshold, polarity,
physical observable, axis and boundary direction. Four-connected components
are listed with original-coordinate bounding boxes and pixel counts. Multiple
components require explicit selection; the method does not guess the largest
object is the flame. The output preserves selected boundary pixels. Its front
coordinate is the median leading-edge pixel-center coordinate across occupied
scan lines. Projected droplet area can instead produce an explicitly labeled
area-equivalent diameter, which is not automatically a volume diameter.

A physical measurement additionally requires source-specific segmentation and
observable validation, matching calibration dimensions, either an evidenced
isotropic square-pixel scale or independently referenced x/y scales, and
validated planar orthographic geometry. Otherwise the result remains a
measurement proposal, with missing requirements visible and no validated value.
An empty threshold mask is not evidence of extinction. Camera color/intensity
is not a temperature or complete-extinction measurement. No unreported
calibration/quantization uncertainty is fabricated.

`calibrate_pixel_trace` preserves original pixel values, source hashes,
locators, exclusions and original timestamps or declared rational frame clock.
Coordinates must lie within the calibrated original frame. Variable-rate video
uses original timestamps, while constant-FPS timing requires its explicit
assumption. The converter does not choose an ignition interval, burning regime
or fit; repeated frames do not become independent runs. A video-frame extractor
can feed selected frozen images through the same measurement path while
retaining original video/frame/time anchors.

The known-answer tests use synthetic analytical inputs. Actual NASA calibration,
regime, endpoint and qualification evidence must independently establish whether
a particular source supports these methods. Process resource enforcement,
API authorization/persistence, media acquisition and interface presentation are
implemented at their owning application boundaries; these pure methods do not
claim those checks by themselves.


## Source media API and frozen original frames

The public media routes resolve the original asset identity and corpus snapshot,
verify retained byte hashes and require the selected source's recorded CC0
redistribution license. `/v1/assets/{sha}/media/preview` serves the authentic
JPEG/PNG/MP4 inline, with immutable content identifiers and video byte-range
support. Unknown redistribution rights do not become an implicit download grant.

`/v1/assets/{sha}/frames/{index}` and its `/image` route decode one explicit
original display-order frame. A fixed local ffprobe/ffmpeg child receives only a
selected frozen file, typed index and expected hash. It has one CPU affinity,
512 MiB per-process address limits, a sampled 512 MiB aggregate process-group RSS
cutoff, 30 seconds elapsed, bounded input/output and single-thread numerical/media
libraries. Its environment contains no model key or database credential. Network
protocols and external MOV data references are disabled; no caller-selected
command, path, filter or URL is accepted. The same local scientific slot prevents
concurrent cold extraction/fitting. Cached frames remain viewable while that slot
is busy. The derivative cache retains at most 512 MiB and reports a full-cache
state instead of silently discarding pinned artifacts or scaling source images.

The frame manifest records original SHA, asset/snapshot identity, decoded frame
index, original PTS, stream time base, exact rational timestamp, PNG hash, tool
version, field/pixel/color metadata and explicit decoding transformations. PNG
encoding converts decoded pixels to RGB8; it does not resize, autorotate,
deinterlace, resample time, supply physical scale or synchronize cameras. Original
files remain separate. The content-addressed manifest/PNG are reused and checked
on each access; altered cached bytes are rejected rather than silently replaced.
The [FFmpeg stream/option documentation](https://ffmpeg.org/ffmpeg.html),
[ffprobe documentation](https://ffmpeg.org/ffprobe.html) and
[frame-selection filter](https://ffmpeg.org/ffmpeg-filters.html#select_002c-aselect)
define this fixed decoding path.

A concrete source check exposed why original timestamps matter. The frozen
FLEX-007 droplet-view MP4 reports `nb_frames=1928` and nominal
`60000/1001` FPS, but the inspected decoder returns 964 full frames. Its field
order is `bb` and sample aspect ratio is `10:11`. Decoded frame 30 has original
PTS 60,060 on a `1/60000` time base, exactly **1.001 seconds**; dividing that decoded
index by nominal metadata FPS would give an incorrect timestamp. Interlaced fields
need not represent one physical instant, and this application applies no hidden
field-time correction. These are file/decoder observations, not experimental
synchronization or independent-trial counts.

On the checked FFmpeg 6.1.1-3ubuntu5 build, that 720×480 RGB PNG has SHA-256
`48a7756ca4f92d20ed3f32edbb15548524b106a7568942a1049f11041e0862d1`.
A cold extraction used approximately 1.27 seconds and sampled peak process-group
RSS 166,528 KiB on the local development host. Other tool/host versions require
their own derivative/version and resource evidence.

`POST /v1/media/measure` binds a selected source or original video frame to an
`ImageMeasurementRequest`. Its expected image hash, original-source anchor and
snapshot must match. Video PTS, source/derived hashes and transformation metadata
are retained with the private registered-analysis job. An actual nonsquare-pixel
video cannot be assigned an isotropic metric scale from display metadata. Explicit
x/y physical scales need their own source references. Boundary positions use the
selected axis; mask area uses pixel count × x-scale × y-scale; projected-area
equivalent diameter uses that physical area. Aspect metadata alone establishes
none of those physical scales. Calibration/segmentation proposals retain that
status, with validated area/value withheld while their conditional proposal is
inspectable.

`POST /v1/media/pixel-trace` verifies the frozen source/context anchors and queues
the existing fixed calculation child. Axis-aligned diameters and projected-area
equivalent diameters retain distinct definitions, including the correct
anisotropic conversion. Supplied clock/FPS assumptions do not become inferred
experimental synchronization; source-derived video traces should use retained
original timestamps and preserve their frame locators. Generic registered-method
inputs retain submitted lineage without claiming independently verified NASA
origin. Private job results require the same browser receipt as other analyses.

Local tests cover actual NASA inline/range previews, original PTS and field/aspect
metadata, immutable cached PNG checks, denied rights, malformed/out-of-range input,
real process-group timeout, busy/cached behavior, source/context mismatches, and
actual trusted-child image/trace calculations. Known synthetic anisotropic and
legacy isotropic cases verify physical positions, areas and diameters without
claiming NASA experimental calibration. No paid API call is involved.
