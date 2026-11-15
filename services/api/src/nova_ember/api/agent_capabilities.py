"""One action-capability policy for direct and nested research tools."""

CAPABILITY_INFO = (
    ("sources", "Sources", "Inspect selected evidence, source spans and datasets."),
    ("analysis", "Analysis", "Use registered calculations, comparisons and evidence assessments."),
    (
        "visualization",
        "Visualization",
        "Prepare inspectable figures, dashboards and analytical models.",
    ),
    ("modeling", "Modeling", "Inspect models and run bounded fits or qualified prediction."),
    ("code", "Code", "Propose or queue isolated code; execution approval is still required."),
    ("workspace", "Workspace proposals", "Propose case or metadata changes for review."),
    ("export", "Exports", "Prepare frozen exports; existing confirmation is still required."),
)
DIRECT_CAPABILITIES = {
    "inspect_private_input": "sources",
    "search_investigations": "sources",
    "get_investigation": "sources",
    "inspect_dataset": "sources",
    "read_evidence": "sources",
    "compare_investigations": "analysis",
    "compute_quantity": "analysis",
    "create_cohort": "analysis",
    "analyze_source": "analysis",
    "prepare_simulation": "visualization",
    "prepare_source_simulation": "visualization",
    "prepare_source_visualization": "visualization",
    "prepare_bass_fire_illustration": "visualization",
}
SCIENTIFIC_CAPABILITIES = {
    "search_runs": "sources",
    "get_run": "sources",
    "search_evidence": "sources",
    "search_semantic_evidence": "sources",
    "get_source_span": "sources",
    "query_dataset": "analysis",
    "compare_runs": "analysis",
    "compare_cohort": "analysis",
    "check_applicability": "analysis",
    "compute_metric": "analysis",
    "method_catalog": "analysis",
    "assess_evidence": "analysis",
    "compare_claims": "analysis",
    "identify_research_gaps": "analysis",
    "propose_hypothesis": "analysis",
    "assess_control": "analysis",
    "assess_earth_transfer": "analysis",
    "prepare_simulation": "visualization",
    "prepare_source_simulation": "visualization",
    "prepare_source_visualization": "visualization",
    "prepare_bass_fire_illustration": "visualization",
    "create_chart": "visualization",
    "propose_dashboard": "visualization",
    "list_models": "modeling",
    "predict": "modeling",
    "fit_model": "modeling",
    "propose_python": "code",
    "execute_python": "code",
    "propose_case_update": "workspace",
    "propose_metadata_correction": "workspace",
    "export_case": "export",
}
ORCHESTRATION_TOOLS = frozenset(
    {"list_scientific_tools", "scientific_tool_schema", "run_scientific_tool"}
)


def allowed_tool(name: str, capabilities: frozenset[str] | None, *, nested=False) -> bool:
    if capabilities is None:
        return True
    if not nested and name in ORCHESTRATION_TOOLS:
        return True
    required = (SCIENTIFIC_CAPABILITIES if nested else DIRECT_CAPABILITIES).get(name)
    return required is not None and required in capabilities


def require_tool(name: str, capabilities: frozenset[str] | None, *, nested=False) -> None:
    if not allowed_tool(name, capabilities, nested=nested):
        raise ValueError(f"The selected agent profile does not permit the {name} action.")
