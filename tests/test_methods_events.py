import pytest
from nova_ember.analysis.events import (
    DetectorMetricsRequest,
    DetectorTimingRequest,
    EventTimingRequest,
    detector_metrics,
    detector_timing,
    event_timing,
)
from pydantic import ValidationError

CONTEXT = {
    "input_origin": "synthetic_reference",
    "sources": [{"source_id": "reference", "locator": "timing reference"}],
}


def event_request(**updates):
    data = {
        "start_time_seconds": 10.0,
        "start_definition": "source-defined ignition",
        "clock_reference": "same calibrated clock",
        "endpoint": "visible_extinction",
        "endpoint_definition": "source-protocol visible edge criterion",
        "events": [
            {
                "kind": "visible_extinction",
                "time_seconds": 15.0,
                "source_locator": "frame:150",
                "definition": "visible edge criterion",
            }
        ],
        "terminal_event_policy": {
            "observation_end": "right_censored",
            "disruption": "competing_event",
        },
        "policy_reference": "explicit source-specific event policy",
        "context": CONTEXT,
    }
    data.update(updates)
    return EventTimingRequest.model_validate(data)


def test_observed_endpoint_elapsed_time_does_not_imply_chemical_extinction():
    result = event_timing(event_request())
    assert result.status == "endpoint_observed"
    assert result.elapsed_seconds == 5.0
    assert result.endpoint == "visible_extinction"


def test_observation_ending_before_endpoint_is_censored_not_extinguished():
    result = event_timing(
        event_request(
            events=[
                {
                    "kind": "observation_end",
                    "time_seconds": 20.0,
                    "source_locator": "last frame",
                    "definition": "acquisition ended",
                }
            ]
        )
    )
    assert result.status == "right_censored"
    assert result.elapsed_seconds == 10.0
    assert result.terminal_event.kind == "observation_end"


def test_disruption_remains_competing_event_even_if_later_endpoint_is_listed():
    request = event_request()
    events = [
        {
            "kind": "disruption",
            "time_seconds": 12.0,
            "source_locator": "frame:120",
            "definition": "fiber disruption",
        },
        *[event.model_dump() for event in request.events],
    ]
    result = event_timing(event_request(events=events))
    assert result.status == "competing_event"
    assert result.elapsed_seconds == 2.0
    assert result.terminal_event.kind == "disruption"


def test_undefined_terminal_policy_remains_insufficient_evidence():
    result = event_timing(
        event_request(
            events=[
                {
                    "kind": "intentional_termination",
                    "time_seconds": 11.0,
                    "source_locator": "command",
                    "definition": "flow stopped",
                }
            ]
        )
    )
    assert result.status == "insufficient_evidence"
    assert result.elapsed_seconds is None


def test_unordered_event_clock_rejected():
    with pytest.raises(ValueError, match="ordered"):
        event_timing(
            event_request(
                events=[
                    {
                        "kind": "visible_extinction",
                        "time_seconds": 9.0,
                        "source_locator": "bad",
                        "definition": "bad relative clock",
                    }
                ]
            )
        )


def timing_request(**updates):
    data = {
        "start_time_seconds": 100.0,
        "alarm_time_seconds": 108.0,
        "start_event_definition": "generator switched on",
        "alarm_endpoint_definition": "threshold held for protocol duration",
        "clock_synchronization_reference": "shared clock",
        "transport_path_reference": "defined duct",
        "instrument_response_reference": "instrument transfer function",
        "threshold_definition": "selected calibrated signal threshold",
        "context": CONTEXT,
    }
    data.update(updates)
    return DetectorTimingRequest.model_validate(data)


def test_detector_total_delay_and_unknown_components_remain_distinct():
    result = detector_timing(timing_request())
    assert result.total_delay_seconds == 8.0
    assert result.measured_components_seconds == {}
    assert result.remaining_unallocated_delay_seconds is None
    result = detector_timing(
        timing_request(
            measured_transport_delay_seconds=3.0,
            component_timing_reference="tracer transit measurement",
        )
    )
    assert result.measured_components_seconds == {"measured_transport_delay_seconds": 3.0}
    assert result.remaining_unallocated_delay_seconds == 5.0


def test_detector_clock_and_alarm_definition_are_required():
    result = detector_timing(timing_request(clock_synchronization_reference=None))
    assert result.status == "needs_data"
    assert "clock_synchronization_reference" in result.required_inputs


def test_component_delays_need_measurement_reference_and_cannot_exceed_total():
    with pytest.raises(ValueError, match="reference"):
        detector_timing(timing_request(measured_transport_delay_seconds=3.0))
    with pytest.raises(ValueError, match="exceed"):
        detector_timing(
            timing_request(
                measured_transport_delay_seconds=9.0, component_timing_reference="measured"
            )
        )


def metrics_request(cases=None, **updates):
    if cases is None:
        cases = [
            {
                "case_id": f"case{i}",
                "independent_unit_id": f"unit{i}",
                "positive_label": label,
                "score": score,
                "source_locator": f"row:{i}",
            }
            for i, (label, score) in enumerate(
                [(True, 0.9), (True, 0.4), (False, 0.8), (False, 0.1)]
            )
        ]
    data = {
        "cases": cases,
        "threshold": 0.5,
        "positive_definition": "independently labelled smoke-positive case",
        "negative_definition": "independently labelled negative control",
        "score_definition": "higher score means positive",
        "label_protocol_reference": "known-answer label protocol",
        "request_roc": True,
        "context": CONTEXT,
    }
    data.update(updates)
    return DetectorMetricsRequest.model_validate(data)


def test_labeled_confusion_matrix_and_roc_match_hand_count():
    result = detector_metrics(metrics_request())
    assert (
        result.true_positive,
        result.false_positive,
        result.true_negative,
        result.false_negative,
    ) == (1, 1, 1, 1)
    assert result.sensitivity == result.specificity == result.false_positive_rate == 0.5
    assert result.precision == 0.5
    assert [(point.true_positive_rate, point.false_positive_rate) for point in result.roc] == [
        (0.0, 0.0),
        (0.5, 0.0),
        (0.5, 0.5),
        (1.0, 0.5),
        (1.0, 1.0),
    ]
    assert result.roc[0].threshold is None  # no non-finite +infinity in API JSON


def test_equal_score_ties_cross_threshold_together():
    request = metrics_request()
    cases = [case.model_dump() for case in request.cases]
    cases[2]["score"] = 0.9
    result = detector_metrics(metrics_request(cases))
    assert len(result.roc) == 4
    assert result.roc[1].true_positive_rate == 0.5
    assert result.roc[1].false_positive_rate == 0.5


def test_no_negative_labels_does_not_fabricate_false_positive_rate():
    cases = [case.model_dump() for case in metrics_request().cases[:2]]
    result = detector_metrics(metrics_request(cases, request_roc=False))
    assert result.status == "partial"
    assert result.false_positive_rate is None
    assert result.specificity is None
    assert detector_metrics(metrics_request(cases)).status == "needs_data"


def test_repeated_independent_unit_cannot_double_detector_sample_count():
    cases = [case.model_dump() for case in metrics_request().cases]
    cases[1]["independent_unit_id"] = cases[0]["independent_unit_id"]
    with pytest.raises(ValidationError, match="independent unit"):
        metrics_request(cases)
