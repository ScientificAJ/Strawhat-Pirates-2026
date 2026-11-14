# Scientific collaboration evaluation — 14 November 2026

The requested behavior is a disciplined research collaborator: inspect evidence,
challenge unsupported assumptions, perform available supported work, ask focused
questions, and make appropriately qualified judgments. The governing constraint
remains: never turn incomplete evidence into a confident scientific claim.

This is a qualitative check of one repeated, fixed case, with a separate explicit
assumption case for visualization preparation. It is not an unseen benchmark or
a general capability score. Provider sampling and model updates prevent exact
replay guarantees.

## Fixed source and question

- Source snapshot: `d2e1342353ec1fc3bcdd69fab4fc8aa0ea4ffacf1b95c627547cd7fcc41d549d`.
- Selected investigation: `PSI-69`, FLEX.
- Experimental-table SHA-256: `37c88ce8ae9391b7544ff630a45ce87543d04d317cdbfbed104fe7d5c27e1b96`.
- Context version: `scientific-coworker-evaluation-v1`.
- Role: coordinator; no images, private inputs or prior conversation were supplied.

The exact question was:

> Use the selected PSI-69 FLEX source snapshot. How many table records carry Completion, Disruption and Extinction, and does Extinction establish suppression success? Can you simulate this experiment for me and use it to judge suppression effectiveness in a new spacecraft cabin? Explain exactly what the evidence supports, do any supported registered calculations, and tell me what you need from me next.

The original Auto route selected GPT-6.1 Sol with medium reasoning. That run
returned an incomplete research result after four provider calls, costing an
estimated $0.060346. The $0.10 request fence prevented the next call; it was not
raised. A workflow marked succeeded means that this incomplete result was stored,
not that a complete scientific answer was produced.

The completed baseline and comparison use explicit Routine routing to GPT-6.1
Terra with low reasoning, a 2,500-token output allowance, six turns, sequential
tool calls and `store=false`. The same frozen source and question are used.
Routing choices, allowances and existing source/numeric/approval gates remain
unchanged in the application.

## Completed baseline and separate critique

The v5 baseline completed in six provider calls with five tool actions, at an
estimated $0.050857. It performed `analyze_source(flex_source_events)`, retrieved
the investigation dossier, inspected the scientific tool catalog and the
`list_models` schema, then listed registered models.

It correctly returned Completion 27, Disruption 61 and Extinction 186, total 274,
as source-table record counts. It did not present these as independent replicates
or a suppression-success rate. It distinguished visible flame disappearance from
cessation of cool-flame combustion and refused unsupported cabin prediction.
All four returned claims passed the existing source/numeric checks; none was
withheld. Those checks do not independently establish a causal interpretation.

The actual response included:

> I cannot provide a validated simulation or use this snapshot to judge suppression effectiveness in the new cabin. The current model registry contains descriptive trace-fitting methods but no released regression predictor.

Its next actions asked for a FLEX test or source rows, a protocol or endpoint
definition, a broad set of cabin conditions, and a suitable model/validation
evidence or exploratory assumptions for a simulation.

A separate review inspected the actual completed answer and returned tool facts.
It accepted the counts, scientific caution and provenance, and identified these
specific gaps:

- Absence of a released validated predictor does not prevent a clearly labeled
  educational visualization. The answer shifted model preparation back to the
  researcher rather than taking ownership of the supported illustrative path.
- The dossier already exposed retained public protocols and trace evidence.
  Their availability should be inspected before asking the researcher to supply
  material the application may already hold.
- A long cabin intake list obscured the immediate next decision. The collaborator
  should finish the supported work and ask at most three targeted blocking
  questions, explaining why the answers matter.

## Resulting behavior contract

Prompt version v6 makes those actions explicit while preserving the original
scientific safeguards. It distinguishes original playback, educational
visualization, descriptive fitting and validated prediction. It requires source,
method, equation, variable, unit, assumption, transformation and applicability
details appropriate to the question. It does not prescribe confidence beyond the
evidence or expose private reasoning.

The response leads with work actually performed and its specific result, then
places each limitation at the inference it restricts. A verified source profile
is described by its actual preparation: reading the retained test sheet,
checking stated units, preserving line anchors, applying the registered equation
and computing the trajectory. This source parameterization is substantive work;
it is not presented as a random display or marketed as a calibrated physical
reconstruction.

The voice instructions retain mandatory scientific/backend delegation and
checked-result limits. They carry the same collaborative stance and distinguish
a prepared educational artifact from a validated prediction.

The supported simulation preparation path is the bounded, typed droplet D-squared
model. Essential initial-diameter and burning-constant inputs require units and
source support or explicit illustrative assumptions. Missing inputs remain
questions; they do not acquire invented defaults. The absence of a cabin
predictor remains an explicit limit on transfer or suppression claims.

The source-profile path reads the retained FLEX-007 test sheet rather than
asking the researcher to re-supply available public parameters. Its nominal
initial diameter and average burning coefficient remain source-reported inputs;
the constant-coefficient trajectory remains a distinct analytical extension.
The exact test identity, line anchors, obscuration and Disruption qualifications
travel with the prepared artifact. They do not establish an association with all
records in the investigation.

## Actual v6 comparison

The same fixed question completed through the local HTTP API and worker with v6
instructions, using the same Routine/Terra settings. Its durable job identifier
is `bdff50b6-f4af-446e-8393-636a2707e940`. Six provider calls cost an estimated
$0.084161. The actual tool sequence was:

1. Count the full FLEX table with `analyze_source(flex_source_events)`.
2. Retrieve the selected investigation dossier.
3. Inspect retained FLEX-007 trace/test-sheet eligibility.
4. Read the original retained test-sheet text.
5. Call `prepare_source_simulation` for the frozen source snapshot.

The prepared artifact contains 241 trajectory points, source-reported nominal
diameter 1.82 mm and coefficient 0.68 mm²/s, and a calculated idealized
zero-diameter endpoint of 4.871176470588235 s. These are actual returned fields,
not an inference from the prose. It retained `requires_open=true` and
`autoplay=false`; preparing it did not launch the view. It also preserved exact
source evidence and the obscuration/Disruption qualifications.

The checked answer retained three claims: the exact label counts, the rejection
of an unsupported suppression-success inference, and the trace/calibration
limits. Its two next-action groups asked for the cabin scenario and the proposed
suppression outcome/intervention. It no longer asked the researcher to supply
already retained protocols or to provide a validated simulation model before
the application could prepare this supported analytical path.

Two additional narration claims were withheld by the existing numeric checks.
Their arithmetic was correct, but the stored fact projections lacked four
specific typed supports: units associated with the raw source values 1.82 and
0.68, a unit-bearing initial-diameter-square summary, and the returned trajectory
point count. These are evidence-projection defects, not justification to relax
unit, measurement-origin or prediction checks. The raw completed outcome and
its withheld claims remain preserved.

The correction creates two separately registered source-text facts containing
the exact parsed nominal values, units, quotations and line anchors. The model
artifact refers to those facts while remaining a calculated artifact rather
than an observation. Its summaries now include the unit-bearing initial
diameter square, and its returned point count is computed from the actual point
list. Measurement and prediction restrictions remain in force.

An explicitly offline replay rechecked the same five original claim wordings:
all five passed, with none withheld. The replay expanded the original raw-text
citation to include the two new checked parameter facts and remapped the model
citation to the refreshed model projection. The original provider result was
not changed. This corrected-projection replay made no provider call and is not
represented as a new live response.

A subsequent actual v6 source request, job
`d3f98fd1-29de-4d96-b5df-b0a59cd684ea`, prepared the corrected artifact but
returned an incomplete research result after six provider calls, costing an
estimated $0.082836. It continued catalog/schema discovery instead of returning
its answer within the six-turn limit. Its absent answer is not treated as a
zero-withheld passing result.

Version v7 addresses this execution boundary without increasing the six-turn
limit or request budget. Tool eligibility is determined from confirmed provider
call count, reserving the sixth turn for the checked answer. The eligibility
decision stays stable for a model turn so an already advertised tool can still
execute after its response arrives; the next turn reevaluates the allowance.
The answer must identify unfinished work rather than invent a completed check.
An offline test through the actual installed SDK Runner used a deliberately
tool-seeking model: five tool turns executed, the sixth model call received no
tools and returned the typed answer with its existing findings retained. Voice
tool availability keeps its default behavior. This phase behavior was checked
against installed `openai-agents` 0.24.0; retain the Runner regression when
upgrading that dependency.

The first actual v7 source case, job
`0331361b-bdcf-48ad-a7b4-5ae6aafd2e63`, completed in four provider calls with
three scientific actions, costing an estimated $0.042184. It retained the
prepared source trajectory, but two narration claims remained withheld: exact
source-line references were being treated as scientific quantities, and the
trace fact's quoted ambient pressure lacked a unit-bearing numeric projection.
This completed-but-partly-withheld result is also retained unchanged.

The correction distinguishes source locators from quantities only after the
cited, validated text-line anchors provide complete same-source coverage. It
records that locator support, still withholds invalid or cross-source ranges,
and keeps a value such as `18 mm` subject to physical-unit checks. The single
FLEX-007 source reader now supplies exact typed ambient conditions as well as
diameter/coefficient inputs, preserving their source anchors, mole basis and
unreported pressure reference.

A second offline replay accepted all five original v7 claim wordings with none
withheld and recorded two validated line locators. Its trace/model citations
were explicitly remapped to the refreshed projections of the same retained
bytes. The original actual v7 result was not rewritten. Related point-channel
projection now uses the registered model's immutable unit definitions, including
zero-diameter endpoints and intermediate values; a supplied unit map cannot
relabel a diameter as a temperature or a time.

## Verification status

Eighteen focused offline regressions passed after the prompt/voice change, along
with Ruff. The new checks preserve untrusted-history status and demonstrate that
a source-linked illustration derived from assumptions cannot be narrated as a
NASA measurement, an in-domain registered prediction or a value with mismatched
units. This is narrower than semantic validation of every possible claim.

The bounded-runtime Runner regression brings the research/collaboration/voice
group to 19 passing cases. Sixteen additional locator and point-unit cases
passed, including same-source range coverage, invalid source positions, physical
units beside the word “line”, known analytical midpoint/zero values, incorrect
units and tampered maps. The affected 16 cases passed again after the final
point-projection scope restriction. Ruff and mypy passed for the changed source
modules.

## Final actual source and assigned-input checks

The final source job, `21e79634-ded6-46a3-81de-cbaa0b3ea7a1`, completed through
the actual HTTP API/worker on v7 in six provider calls, costing an estimated
$0.086672. Five tool actions counted the complete source table, read the
investigation, inspected the trace, read the test sheet and prepared the source
trajectory. Its artifact contains the 241-point, source-parameterized model and
eight separately citable typed source-quantity facts. It remains closed until
opened and does not autoplay.

Four scientific claims were accepted. The displayed calculation explicitly
states the equation and variable units, the initial squared diameter
3.3124 mm², idealized endpoint 4.87117647059 s and 241 returned points. Exact
source counts and the boundary on cabin/suppression inference are also shown.
Two source-summary paragraphs remain withheld: this response cited the original
raw text and model facts instead of the available typed source-quantity facts,
and cited line ranges without matching EvidenceAnchor coverage. Their wording
was not silently recited with replacement citations. This is a completed
scientific-tool workflow with a partly withheld narration, not a claim that
every proposed sentence passed or that source citation selection is solved in
general.

The assigned-input case used this exact additional question:

> For the selected PSI-69 context, prepare an educational droplet D-squared simulation inline using my explicit illustrative assumptions: initial diameter D0 = 2 mm and burning constant K = 0.5 mm^2/s. These are my teaching inputs, not NASA measurements, and I am not asking for a fit or a cabin prediction. Use the registered preparation tool, show the equations and exact calculated zero-diameter time, and state what the visualization does not establish.

Job `12393878-ceed-4efd-a433-daa11a683708` completed on v7 in two provider
calls with one actual `prepare_simulation` action, costing an estimated
$0.011593. Both proposed claims passed, with none withheld. The response led
with the prepared 241-point artifact, preserved the supplied-input origin and
provided the equations and exact 8 s model endpoint. The returned midpoint at
4 s has diameter √2 mm, squared diameter 2 mm² and relative mass
0.3535533905932738 under the registered spherical/constant-density assumptions.
The endpoint contains zero diameter, squared diameter and relative mass.
`requires_open=true` and `autoplay=false` remain explicit.

The two final replies therefore demonstrate actual source inspection and
source-based preparation, and direct execution from explicitly assigned inputs.
They do not establish general scientific reasoning quality across unseen
questions. Inline rendering and browser resource lifecycle are verified
separately from this provider evaluation. A prepared local artifact does not
establish hosted behavior or independent scientific validation.

## Request accounting

| Recorded actual run | Version / model | Research outcome | Provider calls | Estimated USD |
|---|---|---|---:|---:|
| Original Auto baseline | v5 / Sol | Incomplete; retained facts, no answer | 4 | 0.060346 |
| Completed Routine baseline | v5 / Terra | Completed; 4 accepted, 0 withheld | 6 | 0.050857 |
| Initial source preparation | v6 / Terra | Completed; 3 accepted, 2 withheld | 6 | 0.084161 |
| Source-projection iteration | v6 / Terra | Incomplete; artifact retained, no answer | 6 | 0.082836 |
| Initial bounded-runtime case | v7 / Terra | Completed; 3 accepted, 2 withheld | 4 | 0.042184 |
| Final source case | v7 / Terra | Completed; 4 accepted, 2 withheld | 6 | 0.086672 |
| Explicit assigned inputs | v7 / Terra | Completed; 2 accepted, 0 withheld | 2 | 0.011593 |

These actual requests total an estimated **$0.418649**. The final local usage
endpoint reports **$0.509269** committed or reserved, including the previous
$0.090620 ledger balance, with **zero uncertain requests**. Request and daily
fences were not increased. Offline replays and tests made no paid provider
calls. These amounts use the application's recorded token-rate calculation;
they are not an invoice reconciliation.

## Subsequent offline reader correction

The final source response exposed a remaining projection gap in the raw text
reader. The exact reviewed FLEX-007 sheet now receives typed source quantities
from the same authoritative parser used by the trace and source-model paths,
filtered to the lines actually returned. `read_evidence` also attaches a
corpus-validated, contiguous text-line anchor for that returned span. A response
cannot gain support for a quantity or locator outside its retrieved window.

Three focused offline cases passed for this correction. They cover the actual
diameter/coefficient and line citations, wrong-unit and out-of-window rejection,
and refusal to attach the reviewed sheet's typed values to an unreviewed copy.

One further offline check replayed the final response's six original candidate
claim wordings using its original cited fact IDs as diagnostic lookup keys and
the corrected source projections. It accepted six claims with none withheld.
The report records the historical capture hash, separate refreshed-content
hashes, the unchanged original capture and the exact returned source-line span:
`/tmp/nova-scientific-coworker-evaluation/after-source-final-verified-reader-projection-check.json`.
This check made no provider call, did not replace historical citations or
rewrite the stored response, and is not a new live outcome. The actual final
source job remains four accepted claims and two withheld claims, as recorded
above.
