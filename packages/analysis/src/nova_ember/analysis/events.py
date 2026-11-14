"""Endpoint-specific timing and labeled detector metrics without outcome relabeling."""

from __future__ import annotations

from math import fsum, isfinite, ulp
from typing import Literal

from nova_ember.domain.scientific import (
    Finite,
    Identifier,
    MethodContext,
    Nonnegative,
    Refusal,
    ScientificInput,
)
from pydantic import Field, model_validator

EventKind = Literal[
    "failed_ignition",
    "sustained_burning",
    "visible_extinction",
    "cool_flame_cessation",
    "disruption",
    "intentional_termination",
    "observation_end",
]


class TimedEvent(ScientificInput):
    kind: EventKind
    time_seconds: Finite
    source_locator: Identifier
    definition: Identifier


class EventTimingRequest(ScientificInput):
    start_time_seconds: Finite
    start_definition: Identifier
    clock_reference: Identifier
    endpoint: EventKind
    endpoint_definition: Identifier
    events: tuple[TimedEvent, ...] = Field(min_length=1, max_length=1000)
    terminal_event_policy: dict[
        EventKind, Literal["right_censored", "competing_event", "insufficient_evidence"]
    ] = Field(default_factory=dict)
    policy_reference: Identifier
    context: MethodContext


class EventTimingResult(ScientificInput):
    method_id: Literal["protocol-specific-event-timing-v1"] = "protocol-specific-event-timing-v1"
    status: Literal[
        "endpoint_observed", "right_censored", "competing_event", "insufficient_evidence"
    ]
    endpoint: EventKind
    endpoint_definition: str
    elapsed_seconds: Nonnegative | None
    terminal_event: TimedEvent
    context: MethodContext
    request: EventTimingRequest
    limitations: tuple[str, ...]


def event_timing(request: EventTimingRequest) -> EventTimingResult:
    previous = request.start_time_seconds
    for event in request.events:
        if event.time_seconds < previous:
            raise ValueError("Events must be ordered on the declared common clock after the start.")
        previous = event.time_seconds
    endpoint = next((event for event in request.events if event.kind == request.endpoint), None)
    # A declared terminal competing event stops follow-up for the selected endpoint.
    terminal = next(
        (
            event
            for event in request.events
            if event.kind == request.endpoint or event.kind in request.terminal_event_policy
        ),
        request.events[-1],
    )
    status: Literal[
        "endpoint_observed", "right_censored", "competing_event", "insufficient_evidence"
    ]
    if endpoint is not None and terminal is endpoint:
        status = "endpoint_observed"
    else:
        status = request.terminal_event_policy.get(terminal.kind, "insufficient_evidence")
    return EventTimingResult(
        status=status,
        endpoint=request.endpoint,
        endpoint_definition=request.endpoint_definition,
        elapsed_seconds=(
            terminal.time_seconds - request.start_time_seconds
            if status != "insufficient_evidence"
            else None
        ),
        terminal_event=terminal,
        context=request.context,
        request=request,
        limitations=(
            "A censoring policy does not establish noninformative censoring or a survival model.",
            "Visible extinction, cool-flame cessation and complete chemical extinction differ.",
            "Original event categories remain unchanged; no binary outcome is inferred.",
        ),
    )


class DetectorTimingRequest(ScientificInput):
    start_time_seconds: Finite
    alarm_time_seconds: Finite
    start_event_definition: Identifier | None = None
    alarm_endpoint_definition: Identifier | None = None
    clock_synchronization_reference: Identifier | None = None
    transport_path_reference: Identifier | None = None
    instrument_response_reference: Identifier | None = None
    threshold_definition: Identifier | None = None
    measured_generation_delay_seconds: Nonnegative | None = None
    measured_transport_delay_seconds: Nonnegative | None = None
    measured_instrument_delay_seconds: Nonnegative | None = None
    measured_processing_delay_seconds: Nonnegative | None = None
    component_timing_reference: Identifier | None = None
    context: MethodContext


class DetectorTimingResult(ScientificInput):
    status: Literal["calculated"] = "calculated"
    method_id: Literal["synchronized-detector-timing-v1"] = "synchronized-detector-timing-v1"
    context: MethodContext
    request: DetectorTimingRequest
    total_delay_seconds: Nonnegative
    measured_components_seconds: dict[str, float]
    remaining_unallocated_delay_seconds: Nonnegative | None
    limitations: tuple[str, ...]


def detector_timing(request: DetectorTimingRequest) -> DetectorTimingResult | Refusal:
    required = (
        "start_event_definition",
        "alarm_endpoint_definition",
        "clock_synchronization_reference",
        "transport_path_reference",
        "instrument_response_reference",
        "threshold_definition",
    )
    missing = tuple(name for name in required if getattr(request, name) is None)
    if missing:
        return Refusal(
            status="needs_data",
            method_id="synchronized-detector-timing-v1",
            reasons=(
                "Detector response timing lacks required event, clock or instrument definitions.",
            ),
            required_inputs=missing,
            context=request.context,
        )
    total = request.alarm_time_seconds - request.start_time_seconds
    if not isfinite(total):
        raise ValueError("Detector delay exceeds the finite numerical range.")
    if total < 0:
        raise ValueError("Alarm precedes the selected start on the declared synchronized clock.")
    component_names = (
        "measured_generation_delay_seconds",
        "measured_transport_delay_seconds",
        "measured_instrument_delay_seconds",
        "measured_processing_delay_seconds",
    )
    components = {
        name: getattr(request, name)
        for name in component_names
        if getattr(request, name) is not None
    }
    if components and request.component_timing_reference is None:
        raise ValueError("Component delays need their measurement/synchronization reference.")
    try:
        component_total = fsum(components.values())
    except OverflowError:
        raise ValueError("Component delays exceed the finite numerical range.") from None
    remaining = total - component_total
    # These are arithmetic-rounding bounds, not an assumed measurement uncertainty.
    rounding_bound = 2 * (ulp(total) + ulp(component_total))
    if remaining < 0 and (total == 0 or remaining < -rounding_bound):
        raise ValueError("Measured sequential component delays exceed the total declared delay.")
    return DetectorTimingResult(
        context=request.context,
        request=request,
        total_delay_seconds=total,
        measured_components_seconds=components,
        remaining_unallocated_delay_seconds=max(0.0, remaining) if components else None,
        limitations=(
            "The total is relative to the supplied start event, not necessarily generation onset.",
            "Unreported components remain unknown; remaining delay is not an identified mechanism.",
            "A condition table or dust session does not by itself establish an alarm endpoint.",
        ),
    )


class LabeledDetectorCase(ScientificInput):
    case_id: Identifier
    independent_unit_id: Identifier
    positive_label: bool = Field(strict=True)
    score: Finite
    source_locator: Identifier


class DetectorMetricsRequest(ScientificInput):
    cases: tuple[LabeledDetectorCase, ...] = Field(min_length=1, max_length=100000)
    threshold: Finite
    positive_definition: Identifier
    negative_definition: Identifier
    score_definition: Identifier
    label_protocol_reference: Identifier
    request_roc: bool = Field(default=False, strict=True)
    context: MethodContext

    @model_validator(mode="after")
    def unique_units(self) -> DetectorMetricsRequest:
        if len({case.case_id for case in self.cases}) != len(self.cases):
            raise ValueError("Duplicate case IDs would double-count detector evaluations.")
        if len({case.independent_unit_id for case in self.cases}) != len(self.cases):
            raise ValueError(
                "Use one evaluated score per independent unit; aggregate repeats explicitly."
            )
        return self


class RocPoint(ScientificInput):
    threshold: Finite | None
    threshold_position: Literal["at_score", "above_maximum"]
    true_positive_rate: float
    false_positive_rate: float


class DetectorMetricsResult(ScientificInput):
    status: Literal["calculated", "partial"]
    method_id: Literal["labeled-detector-classification-v1"] = "labeled-detector-classification-v1"
    context: MethodContext
    request: DetectorMetricsRequest
    true_positive: int
    false_positive: int
    true_negative: int
    false_negative: int
    sensitivity: float | None
    specificity: float | None
    false_positive_rate: float | None
    precision: float | None
    independent_unit_count: int
    roc: tuple[RocPoint, ...] | None
    limitations: tuple[str, ...]


def detector_metrics(request: DetectorMetricsRequest) -> DetectorMetricsResult | Refusal:
    cases = request.cases
    positives = sum(case.positive_label for case in cases)
    negatives = len(cases) - positives
    if request.request_roc and (positives == 0 or negatives == 0):
        return Refusal(
            status="needs_data",
            method_id="labeled-detector-classification-v1",
            reasons=("An ROC curve requires labeled positive and negative independent cases.",),
            required_inputs=("both positive and negative labeled cases",),
            context=request.context,
        )
    tp = sum(case.positive_label and case.score >= request.threshold for case in cases)
    fp = sum(not case.positive_label and case.score >= request.threshold for case in cases)
    fn, tn = positives - tp, negatives - fp
    roc = None
    if request.request_roc:
        points = [
            RocPoint(
                threshold=None,
                threshold_position="above_maximum",
                true_positive_rate=0.0,
                false_positive_rate=0.0,
            )
        ]
        score_counts: dict[float, list[int]] = {}
        for case in cases:
            bucket = score_counts.setdefault(case.score, [0, 0])
            bucket[0 if case.positive_label else 1] += 1
        cumulative_positive, cumulative_negative = 0, 0
        for threshold, (count_positive, count_negative) in sorted(
            score_counts.items(), reverse=True
        ):
            cumulative_positive += count_positive
            cumulative_negative += count_negative
            points.append(
                RocPoint(
                    threshold=threshold,
                    threshold_position="at_score",
                    true_positive_rate=cumulative_positive / positives,
                    false_positive_rate=cumulative_negative / negatives,
                )
            )
        roc = tuple(points)
    return DetectorMetricsResult(
        status="calculated" if positives and negatives else "partial",
        context=request.context,
        request=request,
        true_positive=tp,
        false_positive=fp,
        true_negative=tn,
        false_negative=fn,
        sensitivity=tp / positives if positives else None,
        specificity=tn / negatives if negatives else None,
        false_positive_rate=fp / negatives if negatives else None,
        precision=tp / (tp + fp) if tp + fp else None,
        independent_unit_count=len(cases),
        roc=roc,
        limitations=(
            "Rates describe the supplied labels, protocol, threshold and independent units only.",
            "Unknown class denominators remain unknown; no deployment prevalence is inferred.",
            "A threshold chosen on these evaluation cases requires a separate held-out evaluation.",
        ),
    )
