# Source-parameterized droplet models — 14 November 2026

The optional model workspace complements original investigation evidence and
media. It applies an inspectable analytical method to retained source parameters
or explicitly assigned inputs, then renders the computed droplet history.

## Opening and preparing a model

FLEX (`PSI-69`) and FLEX-2 (`PSI-68`) dossiers offer **Open simulation** in the
overview and methods sections. The workspace starts closed, with no calculation
or simulation GPU allocation. Opening exposes the input choices; calculating or
selecting the source profile prepares a paused view. Closing releases the
renderer. A different experiment or snapshot starts closed again.

The collaborator can prepare the same artifact when requested.
`prepare_source_simulation` resolves the selected FLEX-007 profile;
`prepare_simulation` requires explicit diameter and burning-constant inputs.
The result appears in the conversation and the Simulations artifact category.
Each view requires an explicit Open action and starts paused, including after a
session reload or artifact change. Preparation does not launch playback or
execute arbitrary code.

## Source-specific calculation and provenance

The FLEX-007 profile reads the retained test sheet through the owning source
reader. It checks identity, explicit field units, the disruption endpoint and
the visibility qualification. Lines 18 and 19 report nominal **D₀ = 1.82 mm** and
**kavg = 0.68 mm²/s**. Quotations, line anchors, asset hash, investigation version,
frozen snapshot, conditions and trace qualifications accompany the result. The
ambiguous experimental-table burning-rate header is not reinterpreted.

The registered `droplet_d_squared_v1` method applies:

```text
D²(t) = D₀² − Kt
D(t) = sqrt(D₀² − Kt)
t_ideal = D₀²/K
m(t)/m₀ = [D(t)/D₀]³
```

For the reported nominal inputs, calculated initial D² is **3.3124 mm²** and the
idealized zero-diameter endpoint is **4.871176470588235 s**. Extending the reported
average coefficient as a constant is a model assumption. The source describes
disruption and luminous-flame obscuration; this endpoint is not an observed
disruption/extinction time or a newly calibrated trace fit.

The model assumes one spherical droplet, constant liquid density, quasi-steady
transport, fixed properties and a constant coefficient. It omits initial
heating, support/flow effects, radiation and finite-rate chemistry. It does not
calculate cool-flame transitions, temperature, species fields, soot, flame
stand-off or suppressant performance. The basis and limits are documented in
[NASA TM-4069](https://ntrs.nasa.gov/citations/19890010934) and the
[original Princeton background](https://www.princeton.edu/~fldryer/nasa.dir/backgrnd.htm).

The server returns 241 states by default within a 2–601 state profile. It retains
computational precision, equations, units, origins, qualifications and a count
computed from the returned point list. Display uses seven significant digits;
the complete record is exportable. Relative mass follows spherical geometry at
constant density; no density or measured mass is inferred.

Manual results retain `analyst_assumptions`. The source path retains
`source_reported_nominal`; unchanged recalculation preserves its anchors.
Changed values become explicitly assigned inputs on calculation. Generic
requests cannot claim source provenance. Separately citable, anchor-validated
parameter facts support literal reported values while model states remain
calculations rather than source observations or predictions.

The same source reader preserves the six reported ambient quantities with exact
units or mole-fraction basis and line anchors. Zero fractions remain valid.
Pressure is retained in atm with its absolute/gauge reference unreported;
no reference or conversion is inferred. Verified source-line positions are
checked as locators, separately from physical quantities.

## Rendering and interaction

The supplied observatory’s chamber/flame presentation is adapted into a contained
Three.js view. Droplet scale follows calculated diameter. Chamber geometry,
shell thickness, stand-off and colors are visual guides rather than additional
observables or a dimensional apparatus reconstruction. Cosmic effects,
synthetic optical diagnostics, unsupported metrics, audio and particles are
omitted.

The buffer is at most 640 × 400 at DPR 1. Paused views render on demand; explicit
playback is capped at 20 fps. Offscreen/hidden state, reduced motion, closing and
unmounting stop ongoing drawing. Front/Top/Reset camera controls offer keyboard
alternatives, and wheel zoom does not intercept dashboard scrolling. Missing or
lost WebGL leaves calculated values usable. Each effect owns and disposes its
canvas and resources, including during React development remounts.

Playback maps the calculated interval to 12 seconds of viewing time. The model
clock and timeline retain scientific seconds. Reduced-motion users inspect
states directly. Inputs are read-only while preparation is pending. Failed
requests preserve inputs and previous results; changed inputs mark the result
stale. Serialized artifacts need consistent snapshot, origins, anchors,
quantities, units and bounded states before receiving the prepared-model UI.

## Collaborator and verification

The [response evaluation](scientific-coworker-evaluation-2026-11-14.md) records the
fixed source/question, actual baseline, independent critique, revisions,
projection corrections and subsequent provider outcomes. The collaborator
inspects evidence, challenges unsupported inferences, performs supported work,
makes qualified judgments and asks focused questions. It describes actual
source-specific work before limits relevant to that work. Existing permissions
and claim verification remain active.

Next research steps are visible in the response. Follow-up history retains the
questions and scientific qualifications as untrusted conversation context,
rather than dropping the questions or treating earlier prose as fresh evidence.

Local checks cover known answers, invalid inputs, exact source/unit resolution,
changed/missing fields, provenance laundering, HTTP/tool boundaries, browser
recovery, source preservation, inline persistence, graphics lifecycle and mobile
behavior. Final run evidence is recorded with the delivery. Physical mobile GPU
performance, hosted behavior, general agent reliability and independently
validated experimental reconstruction remain distinct from these checks.

The integrated model/collaborator stage completed a local run of 603 Python
cases with seven opt-in sandbox cases skipped, and 50 Chromium browser cases.
Those runs preceded the later optional Agents extension and the owner's request
to limit further testing. Subsequent reader corrections used three focused
offline cases; the optional profile/draft boundaries used ten focused offline
cases across implementation. The broad suites were not repeated for that
extension. Its rendered and build evidence is recorded in
[the Agents report](custom-agents.md).
