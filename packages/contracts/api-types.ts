export interface paths {
    "/mcp": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** No Unsolicited Stream */
        get: operations["no_unsolicited_stream_mcp_get"];
        put?: never;
        /** Message */
        post: operations["message_mcp_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/agents/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Catalog */
        get: operations["catalog_v1_agents_catalog_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/agents/draft": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Draft */
        post: operations["draft_v1_agents_draft_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/analyses/bass-calibration": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Bass Calibration Evidence */
        get: operations["bass_calibration_evidence_v1_analyses_bass_calibration_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/analyses/flex-007-source": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Flex Trace Evidence */
        get: operations["flex_trace_evidence_v1_analyses_flex_007_source_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/analyses/flex-endpoints": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Flex Analysis */
        get: operations["flex_analysis_v1_analyses_flex_endpoints_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assets/{digest}/embedded-figure": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Embedded Figure */
        get: operations["embedded_figure_v1_assets__digest__embedded_figure_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assets/{digest}/format": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Source Format */
        get: operations["source_format_v1_assets__digest__format_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assets/{digest}/frames/{frame_index}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Frame */
        get: operations["frame_v1_assets__digest__frames__frame_index__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assets/{digest}/frames/{frame_index}/image": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Frame Image */
        get: operations["frame_image_v1_assets__digest__frames__frame_index__image_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assets/{digest}/media": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Media */
        get: operations["media_v1_assets__digest__media_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assets/{digest}/media/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Preview */
        get: operations["preview_v1_assets__digest__media_preview_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assets/{digest}/raw": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Download Asset */
        get: operations["download_asset_v1_assets__digest__raw_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assets/{digest}/records": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Scientific Records */
        get: operations["scientific_records_v1_assets__digest__records_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assets/{digest}/table": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Table */
        get: operations["table_v1_assets__digest__table_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assets/{digest}/text": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Text Source */
        get: operations["text_source_v1_assets__digest__text_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assets/{digest}/workbook": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Workbook */
        get: operations["workbook_v1_assets__digest__workbook_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/calculations/oxygen-partial-pressure": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Partial Pressure */
        post: operations["partial_pressure_v1_calculations_oxygen_partial_pressure_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/capabilities/models": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Capabilities */
        get: operations["capabilities_v1_capabilities_models_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/charts/method": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Method Chart */
        post: operations["method_chart_v1_charts_method_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/charts/validate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Chart */
        post: operations["chart_v1_charts_validate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/cohorts/resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Resolve Cohort */
        post: operations["resolve_cohort_v1_cohorts_resolve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/comparisons": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Compare */
        post: operations["compare_v1_comparisons_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/dashboards/select": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Select Dashboard */
        post: operations["select_dashboard_v1_dashboards_select_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/dashboards/validate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Dashboard */
        post: operations["dashboard_v1_dashboards_validate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/discovery/investigations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Investigations */
        post: operations["investigations_v1_discovery_investigations_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/discovery/records": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Records */
        post: operations["records_v1_discovery_records_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/evidence/condition-coverage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Condition Coverage */
        post: operations["condition_coverage_v1_evidence_condition_coverage_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/evidence/contradictions/compare": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Contradictions */
        post: operations["contradictions_v1_evidence_contradictions_compare_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/evidence/coverage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Coverage */
        get: operations["coverage_v1_evidence_coverage_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/evidence/dependencies/invalidate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Dependencies */
        post: operations["dependencies_v1_evidence_dependencies_invalidate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/evidence/documents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Documents */
        get: operations["documents_v1_evidence_documents_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/evidence/earth-applications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Earth Applications */
        get: operations["earth_applications_v1_evidence_earth_applications_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/evidence/lineage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lineage */
        get: operations["lineage_v1_evidence_lineage_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/evidence/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Read Evidence */
        post: operations["read_evidence_v1_evidence_read_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/evidence/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Search Evidence */
        post: operations["search_evidence_v1_evidence_search_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/execution/capability": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Execution Status */
        get: operations["execution_status_v1_execution_capability_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/execution/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** New Execution */
        post: operations["new_execution_v1_execution_sessions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/execution/sessions/{session_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Inspect Session */
        get: operations["inspect_session_v1_execution_sessions__session_id__get"];
        put?: never;
        post?: never;
        /** Close Session */
        delete: operations["close_session_v1_execution_sessions__session_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/execution/sessions/{session_id}/commands": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Execute */
        post: operations["execute_v1_execution_sessions__session_id__commands_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/execution/sessions/{session_id}/renew": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Renew */
        post: operations["renew_v1_execution_sessions__session_id__renew_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/exports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Export Case */
        post: operations["export_case_v1_exports_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/exports/flex-endpoints": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Flex Export */
        get: operations["flex_export_v1_exports_flex_endpoints_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Health */
        get: operations["health_v1_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/investigations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Investigations */
        get: operations["list_investigations_v1_investigations_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/investigations/{accession}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Investigation */
        get: operations["get_investigation_v1_investigations__accession__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/investigations/{accession}/dossier": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Dossier */
        get: operations["dossier_v1_investigations__accession__dossier_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/investigations/{accession}/manifest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Manifest */
        get: operations["manifest_v1_investigations__accession__manifest_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Export */
        post: operations["create_export_v1_jobs_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/jobs/{job_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Job */
        get: operations["get_job_v1_jobs__job_id__get"];
        put?: never;
        post?: never;
        /** Remove */
        delete: operations["remove_v1_jobs__job_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/jobs/{job_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel */
        post: operations["cancel_v1_jobs__job_id__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/jobs/{job_id}/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Events */
        get: operations["events_v1_jobs__job_id__events_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/media/measure": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Measure */
        post: operations["measure_v1_media_measure_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/media/pixel-trace": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Pixel Trace */
        post: operations["pixel_trace_v1_media_pixel_trace_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/methods": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Methods */
        get: operations["methods_v1_methods_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/methods/calculate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Calculate */
        post: operations["calculate_v1_methods_calculate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/models": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Models */
        get: operations["models_v1_models_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/models/{identifier}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Card */
        get: operations["card_v1_models__identifier__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/models/{identifier}/domain-check": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Domain */
        post: operations["domain_v1_models__identifier__domain_check_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/models/{identifier}/predict": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Prediction */
        post: operations["prediction_v1_models__identifier__predict_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/queries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Query Dataset */
        post: operations["query_dataset_v1_queries_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/queries/aggregate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Aggregate Dataset */
        post: operations["aggregate_dataset_v1_queries_aggregate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/research": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Research */
        post: operations["research_v1_research_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/research/controls/assess": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Control */
        post: operations["control_v1_research_controls_assess_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/research/earth-transfer/assess": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Transfer */
        post: operations["transfer_v1_research_earth_transfer_assess_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/research/hypotheses/assess": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Hypothesis Plan */
        post: operations["hypothesis_plan_v1_research_hypotheses_assess_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/scenarios/presets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Presets */
        get: operations["presets_v1_scenarios_presets_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/search/semantic": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Search */
        post: operations["search_v1_search_semantic_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/snapshots/current": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Current Snapshot */
        get: operations["current_snapshot_v1_snapshots_current_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/snapshots/{snapshot_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Frozen Snapshot */
        get: operations["frozen_snapshot_v1_snapshots__snapshot_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/snapshots/{snapshot_id}/changes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Changes */
        get: operations["changes_v1_snapshots__snapshot_id__changes_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/source-acquisitions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Acquire */
        post: operations["acquire_v1_source_acquisitions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/source-acquisitions/profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Profile */
        get: operations["profile_v1_source_acquisitions_profile_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/source-acquisitions/{job_id}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Content */
        get: operations["content_v1_source_acquisitions__job_id__content_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/source-acquisitions/{job_id}/table-preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Table */
        get: operations["table_v1_source_acquisitions__job_id__table_preview_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/source-refresh/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Source Refresh Status */
        get: operations["source_refresh_status_v1_source_refresh_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/uploads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Uploads */
        get: operations["list_uploads_v1_uploads_get"];
        put?: never;
        /** Prepare Upload */
        post: operations["prepare_upload_v1_uploads_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/uploads/profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Upload Profile */
        get: operations["upload_profile_v1_uploads_profile_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/uploads/{upload_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Upload */
        get: operations["read_upload_v1_uploads__upload_id__get"];
        put?: never;
        post?: never;
        /** Remove Upload */
        delete: operations["remove_upload_v1_uploads__upload_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/uploads/{upload_id}/chunks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Upload Chunk */
        put: operations["upload_chunk_v1_uploads__upload_id__chunks_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/uploads/{upload_id}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Download Upload */
        get: operations["download_upload_v1_uploads__upload_id__content_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/uploads/{upload_id}/finalize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Finalize Upload */
        post: operations["finalize_upload_v1_uploads__upload_id__finalize_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/usage/models": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Usage */
        get: operations["usage_v1_usage_models_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/visualizations/droplet": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Droplet */
        post: operations["droplet_v1_visualizations_droplet_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/visualizations/flex-007": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Flex 007 */
        post: operations["flex_007_v1_visualizations_flex_007_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/voice/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Sessions */
        get: operations["list_sessions_v1_voice_sessions_get"];
        put?: never;
        /** Start */
        post: operations["start_v1_voice_sessions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/voice/sessions/{session_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Status */
        get: operations["status_v1_voice_sessions__session_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/voice/sessions/{session_id}/context": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Update Context */
        post: operations["update_context_v1_voice_sessions__session_id__context_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/voice/sessions/{session_id}/controls": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Control */
        post: operations["control_v1_voice_sessions__session_id__controls_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/voice/sessions/{session_id}/questions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Text Question */
        post: operations["text_question_v1_voice_sessions__session_id__questions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/voice/sessions/{session_id}/renew": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Renew */
        post: operations["renew_v1_voice_sessions__session_id__renew_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/voice/sessions/{session_id}/tasks/{job_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Task */
        get: operations["task_v1_voice_sessions__session_id__tasks__job_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/workflows/{job_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Workflow */
        get: operations["read_workflow_v1_workflows__job_id__get"];
        put?: never;
        post?: never;
        /** Remove */
        delete: operations["remove_v1_workflows__job_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/workflows/{job_id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Approve */
        post: operations["approve_v1_workflows__job_id__approve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/workflows/{job_id}/artifacts/{artifact_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Download */
        get: operations["download_v1_workflows__job_id__artifacts__artifact_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/workflows/{job_id}/artifacts/{artifact_id}/metadata": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Artifact Metadata */
        get: operations["artifact_metadata_v1_workflows__job_id__artifacts__artifact_id__metadata_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/workflows/{job_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel */
        post: operations["cancel_v1_workflows__job_id__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/workflows/{job_id}/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Workflow Events */
        get: operations["workflow_events_v1_workflows__job_id__events_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** AcquisitionInputs */
        AcquisitionInputs: {
            /** Accession */
            accession: string;
            /** Declared Bytes */
            declared_bytes: number;
            /** File Name */
            file_name: string;
            /** File Version */
            file_version: number;
            /** Investigation Version */
            investigation_version: number;
            /** Manifest Key */
            manifest_key: string;
            /** Manifest Sha256 */
            manifest_sha256: string;
            preview?: components["schemas"]["MediaSelection"] | null;
            /** Snapshot Id */
            snapshot_id: string;
        };
        /** AgentDraftRequest */
        AgentDraftRequest: {
            /** Description */
            description: string;
            /**
             * Kind
             * @default profile
             * @enum {string}
             */
            kind: "profile" | "skill";
        };
        /** AgentDraftResponse */
        AgentDraftResponse: {
            /** Cost Usd */
            cost_usd: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "profile" | "skill";
            /** Limitations */
            limitations: string[];
            /** Model */
            model: string;
            profile?: components["schemas"]["CustomAgentProfile"] | null;
            /** Prompt Version */
            prompt_version: string;
            /** Provider Calls */
            provider_calls: {
                [key: string]: unknown;
            }[];
            /**
             * Schema Version
             * @default 1
             * @constant
             */
            schema_version: 1;
            skill?: components["schemas"]["AgentSkill"] | null;
            /**
             * Status
             * @default draft
             * @constant
             */
            status: "draft";
        };
        /** AgentSkill */
        AgentSkill: {
            /** Instructions */
            instructions: string;
            /** Name */
            name: string;
        };
        /** AggregateField */
        AggregateField: {
            /** Column */
            column: number;
            /**
             * Method
             * @enum {string}
             */
            method: "mean" | "minimum" | "maximum" | "sum" | "standard_deviation";
        };
        /** AggregateQuery */
        AggregateQuery: {
            /** Fields */
            fields: components["schemas"]["AggregateField"][];
            /** Group By */
            group_by?: number[];
            query: components["schemas"]["QuerySpec"];
        };
        /** ApprovalInputs */
        ApprovalInputs: {
            /** Expected Revision */
            expected_revision: number;
            /** Inputs Sha256 */
            inputs_sha256: string;
        };
        /** CaseExport */
        CaseExport: {
            /** Applicability */
            applicability?: {
                [key: string]: unknown;
            };
            /** Artifacts */
            artifacts?: components["schemas"]["FrozenArtifact"][];
            /** Assumptions */
            assumptions?: string[];
            /** Case Id */
            case_id: string;
            /** Charts */
            charts?: components["schemas"]["ChartSpec"][];
            /**
             * Format
             * @default bundle
             * @enum {string}
             */
            format: "bundle" | "json" | "csv" | "parquet" | "svg" | "png" | "pdf" | "report" | "notebook";
            /**
             * Include Original Bytes
             * @default false
             */
            include_original_bytes: boolean;
            /** Limitations */
            limitations: string[];
            /** Method Charts */
            method_charts?: components["schemas"]["MethodChartSpec"][];
            /**
             * Notes
             * @default
             */
            notes: string;
            /** Queries */
            queries?: components["schemas"]["QuerySpec"][];
            /** Question */
            question: string;
            /** Revision */
            revision: number;
            /**
             * Schema Version
             * @default 1
             * @constant
             */
            schema_version: 1;
            /** Snapshot Id */
            snapshot_id: string;
            /** Source Job Ids */
            source_job_ids?: string[];
            /** Upload Ids */
            upload_ids?: string[];
        };
        /** ChartSpec */
        ChartSpec: {
            /**
             * Caption
             * @default
             */
            caption: string;
            /**
             * Histogram Bins
             * @default 10
             */
            histogram_bins: number;
            /**
             * Mark
             * @default point
             * @enum {string}
             */
            mark: "point" | "line" | "bar" | "histogram" | "categorical_map" | "paired" | "response_surface";
            /** Pair Column */
            pair_column?: number | null;
            query: components["schemas"]["QuerySpec"];
            /** Response Columns */
            response_columns?: number[];
            /**
             * Schema Version
             * @default 1
             * @constant
             */
            schema_version: 1;
            /** Series Column */
            series_column?: number | null;
            smoothing?: components["schemas"]["SmoothingSpec"] | null;
            /** Title */
            title: string;
            /**
             * Uncertainty
             * @default not_available
             * @enum {string}
             */
            uncertainty: "not_available" | "measurement_uncertainty" | "standard_deviation" | "standard_error" | "confidence_interval" | "prediction_interval";
            /** Uncertainty Column */
            uncertainty_column?: number | null;
            uncertainty_provenance?: components["schemas"]["UncertaintyProvenance"] | null;
            /** X Column */
            x_column: number;
            /**
             * X Scale
             * @default linear
             * @enum {string}
             */
            x_scale: "linear" | "log";
            /**
             * X Type
             * @default quantitative
             * @enum {string}
             */
            x_type: "quantitative" | "nominal" | "ordinal";
            /** X Unit */
            x_unit?: string | null;
            /** Y Column */
            y_column: number;
            /**
             * Y Scale
             * @default linear
             * @enum {string}
             */
            y_scale: "linear" | "log";
            /**
             * Y Type
             * @default quantitative
             * @enum {string}
             */
            y_type: "quantitative" | "nominal" | "ordinal";
            /** Y Unit */
            y_unit?: string | null;
            /** Z Column */
            z_column?: number | null;
            /** Z Unit */
            z_unit?: string | null;
        };
        /** Claim */
        Claim: {
            /**
             * Anchors
             * @default []
             */
            anchors: components["schemas"]["EvidenceAnchor"][];
            /**
             * Assumptions
             * @default []
             */
            assumptions: string[];
            /** Calculation Id */
            calculation_id?: string | null;
            /** Conditions */
            conditions?: {
                [key: string]: string | number | null;
            };
            /** Endpoint */
            endpoint?: string | null;
            /** Id */
            id: string;
            /**
             * Limitations
             * @default []
             */
            limitations: string[];
            /** Model Version */
            model_version?: string | null;
            /** Numeric Value */
            numeric_value?: number | null;
            /**
             * Origin
             * @enum {string}
             */
            origin: "source_reported" | "measured" | "derived" | "predicted" | "synthesized" | "hypothetical" | "unknown" | "conflicting";
            /** Text */
            text: string;
            /** Unit */
            unit?: string | null;
        };
        /** ClaimPair */
        ClaimPair: {
            left: components["schemas"]["Claim"];
            right: components["schemas"]["Claim"];
        };
        /** CohortInputs */
        CohortInputs: {
            /** Selections */
            selections: components["schemas"]["SourceSelection"][];
            /** Snapshot Id */
            snapshot_id: string;
        };
        /** ComparisonInputs */
        ComparisonInputs: {
            /** Investigation Ids */
            investigation_ids: string[];
        };
        /** ControlCandidate */
        ControlCandidate: {
            /** Applicable Configuration */
            applicable_configuration: {
                [key: string]: string | number | null;
            };
            /**
             * Countereffects
             * @default []
             */
            countereffects: string[];
            /** Evidence */
            evidence: components["schemas"]["Claim"][];
            /** Intended Outcome */
            intended_outcome: string;
            /**
             * Interactions
             * @default []
             */
            interactions: string[];
            /** Limitations */
            limitations: string[];
            /** Mechanism */
            mechanism: string;
            /** Name */
            name: string;
            /** Necessary Validation */
            necessary_validation: string[];
            /**
             * Validation Status
             * @enum {string}
             */
            validation_status: "source_reported" | "research_hypothesis" | "unresolved";
        };
        /** ConversationTurn */
        ConversationTurn: {
            /**
             * Role
             * @enum {string}
             */
            role: "user" | "assistant";
            /** Text */
            text: string;
        };
        /** CoverageAxis */
        CoverageAxis: {
            /** Basis */
            basis?: string | null;
            /**
             * Bin Edges
             * @default []
             */
            bin_edges: number[];
            /** Canonical Unit */
            canonical_unit?: string | null;
            /**
             * Kind
             * @enum {string}
             */
            kind: "numeric" | "categorical";
            /** Location */
            location?: string | null;
            /** Quantity Kind */
            quantity_kind: string;
            /** Source Column */
            source_column?: string | null;
        };
        /** CoverageRequest */
        CoverageRequest: {
            /** Axes */
            axes: components["schemas"]["CoverageAxis"][];
            query: components["schemas"]["RecordQuery"];
        };
        /** CustomAgentProfile */
        CustomAgentProfile: {
            /** Capabilities */
            capabilities: ("sources" | "analysis" | "visualization" | "modeling" | "code" | "workspace" | "export")[];
            /**
             * Description
             * @default
             */
            description: string;
            /** Instructions */
            instructions: string;
            /** Name */
            name: string;
            /**
             * Skills
             * @default []
             */
            skills: components["schemas"]["AgentSkill"][];
        };
        /** DashboardComponent */
        DashboardComponent: {
            /** Artifact Id */
            artifact_id?: string | null;
            /** Artifact Job Id */
            artifact_job_id?: string | null;
            chart?: components["schemas"]["ChartSpec"] | null;
            /** Component Id */
            component_id: string;
            /** Empty State */
            empty_state: string;
            /** Evidence References */
            evidence_references?: string[];
            /** Job Id */
            job_id?: string | null;
            method_chart?: components["schemas"]["MethodChartSpec"] | null;
            query?: components["schemas"]["QuerySpec"] | null;
            /**
             * Scientific Status
             * @default unknown
             * @enum {string}
             */
            scientific_status: "measured" | "derived" | "interpretation" | "hypothetical" | "unknown" | "conflicting";
            /** Title */
            title: string;
            /**
             * Type
             * @enum {string}
             */
            type: "investigation_collection" | "run_table" | "condition_coverage" | "comparison_report" | "measurement_chart" | "evidence_summary" | "applicability_assessment" | "model_result" | "assumption_list" | "unresolved_questions";
        };
        /** DashboardSelection */
        DashboardSelection: {
            /** Binding Index */
            binding_index: number;
            /**
             * Binding Kind
             * @default filter
             * @enum {string}
             */
            binding_kind: "filter" | "selection";
            dashboard: components["schemas"]["DashboardSpec"];
            /** Expected Revision */
            expected_revision: number;
            /** Values */
            values: (string | number)[];
        };
        /** DashboardSpec */
        DashboardSpec: {
            /** Artifact Dependencies */
            artifact_dependencies?: string[];
            /** Base Revision */
            base_revision?: number | null;
            /** Cohort Ids */
            cohort_ids?: string[];
            /** Components */
            components: components["schemas"]["DashboardComponent"][];
            /** Corpus Snapshot Id */
            corpus_snapshot_id: string;
            /**
             * Dashboard Id
             * Format: uuid
             */
            dashboard_id: string;
            /** Filter Bindings */
            filter_bindings?: components["schemas"]["FilterBinding"][];
            /**
             * Mode
             * @default frozen
             * @enum {string}
             */
            mode: "live_query" | "frozen";
            /** Question */
            question: string;
            /** Revision */
            revision: number;
            /** Scenario Version Id */
            scenario_version_id?: string | null;
            /**
             * Schema Version
             * @default 1
             * @constant
             */
            schema_version: 1;
            /** Selection Bindings */
            selection_bindings?: components["schemas"]["FilterBinding"][];
        };
        /** DashboardValidation */
        DashboardValidation: {
            dashboard: components["schemas"]["DashboardSpec"];
            /** Expected Revision */
            expected_revision?: number | null;
        };
        /** DependencyQuery */
        DependencyQuery: {
            /** Changed Ids */
            changed_ids: string[];
            /** Relations */
            relations: components["schemas"]["EvidenceRelation"][];
        };
        /** DropletVisualizationPoint */
        DropletVisualizationPoint: {
            /** Diameter Mm */
            diameter_mm: number;
            /** Diameter Squared Mm2 */
            diameter_squared_mm2: number;
            /** Relative Mass */
            relative_mass: number;
            /** Time S */
            time_s: number;
        };
        /** DropletVisualizationRequest */
        DropletVisualizationRequest: {
            /** Burning Constant Mm2 S */
            burning_constant_mm2_s: number;
            context: components["schemas"]["MethodContext"];
            /** Initial Diameter Mm */
            initial_diameter_mm: number;
            /** Investigation Accession */
            investigation_accession?: string | null;
            /**
             * Model Id
             * @default droplet_d_squared_v1
             * @constant
             */
            model_id: "droplet_d_squared_v1";
            /**
             * Parameter Origin
             * @default analyst_assumptions
             * @constant
             */
            parameter_origin: "analyst_assumptions";
            /**
             * Sample Count
             * @default 241
             */
            sample_count: number;
        };
        /** DropletVisualizationResult */
        DropletVisualizationResult: {
            /**
             * Artifact Type
             * @default educational_simulation
             * @constant
             */
            artifact_type: "educational_simulation";
            /** Assumptions */
            assumptions: string[];
            /**
             * Autoplay
             * @default false
             * @constant
             */
            autoplay: false;
            context: components["schemas"]["MethodContext"];
            /** Equations */
            equations: string[];
            /** Idealized Endpoint S */
            idealized_endpoint_s: number;
            /** Initial Diameter Squared Mm2 */
            initial_diameter_squared_mm2: number;
            /** Limitations */
            limitations: string[];
            /**
             * Method Id
             * @default droplet_d_squared_v1
             * @constant
             */
            method_id: "droplet_d_squared_v1";
            /**
             * Model Id
             * @default droplet_d_squared_v1
             * @constant
             */
            model_id: "droplet_d_squared_v1";
            /**
             * Origin
             * @default deterministic_calculation
             * @constant
             */
            origin: "deterministic_calculation";
            /**
             * Parameter Origin
             * @enum {string}
             */
            parameter_origin: "analyst_assumptions" | "source_reported_nominal";
            /** Point Count */
            point_count: number;
            /** Points */
            points: components["schemas"]["DropletVisualizationPoint"][];
            /** References */
            references: string[];
            /** Request */
            request: components["schemas"]["DropletVisualizationRequest"] | components["schemas"]["SourceReportedDropletInputs"];
            /**
             * Requires Open
             * @default true
             * @constant
             */
            requires_open: true;
            /**
             * Scientific Qualification
             * @default An analytical teaching calculation using assumed parameters. This is not a NASA measurement, validated experimental reconstruction or operational safety prediction.
             */
            scientific_qualification: string;
            /**
             * Status
             * @default illustrative_model
             * @constant
             */
            status: "illustrative_model";
            /** Summaries */
            summaries: {
                [key: string]: components["schemas"]["VisualizationQuantity"];
            };
            /** Units */
            units: {
                [key: string]: string;
            };
        };
        /** EarthTransfer */
        EarthTransfer: {
            /** Evidence */
            evidence: components["schemas"]["Claim"][];
            /** Limitations */
            limitations: string[];
            /** Shared Mechanism */
            shared_mechanism: string;
            /**
             * Status
             * @enum {string}
             */
            status: "documented_application" | "supported_engineering_connection" | "research_hypothesis";
            /** Title */
            title: string;
            /** Transfer Constraints */
            transfer_constraints: {
                [key: string]: string | null;
            };
        };
        /** EvidenceAnchor */
        EvidenceAnchor: {
            /** Accession */
            accession?: string | null;
            /** Asset Id */
            asset_id?: string | null;
            /** Capture Id */
            capture_id?: string | null;
            /** Cell */
            cell?: string | null;
            /** Column */
            column?: number | null;
            /** Document Id */
            document_id?: string | null;
            /** End */
            end?: number | null;
            /** Field */
            field?: string | null;
            /** Frame */
            frame?: number | null;
            /** Investigation Version */
            investigation_version?: number | null;
            /**
             * Kind
             * @enum {string}
             */
            kind: "metadata_field" | "table_cell" | "text_lines" | "workbook_cell" | "document_page" | "document_paragraph" | "document_figure" | "media_frame";
            /** Line End */
            line_end?: number | null;
            /** Member */
            member?: string | null;
            /** Member Sha256 */
            member_sha256?: string | null;
            /** Page */
            page?: number | null;
            /** Paragraph */
            paragraph?: number | null;
            /** Sheet */
            sheet?: string | null;
            /** Snapshot Id */
            snapshot_id: string;
            /**
             * Source Kind
             * @default psi
             * @enum {string}
             */
            source_kind: "psi" | "nasa" | "ntrs";
            /** Source Row */
            source_row?: number | null;
            /** Source Sha256 */
            source_sha256: string;
            /** Start */
            start?: number | null;
        };
        /** EvidenceReference */
        EvidenceReference: {
            /** Asset Sha256 */
            asset_sha256?: string | null;
            /** Locator */
            locator: string;
            /** Source Id */
            source_id: string;
        };
        /** EvidenceRelation */
        EvidenceRelation: {
            /**
             * Anchors
             * @default []
             */
            anchors: components["schemas"]["EvidenceAnchor"][];
            /** Explanation */
            explanation: string;
            /**
             * Relation
             * @enum {string}
             */
            relation: "supports" | "contradicts" | "qualifies" | "depends_on" | "derived_from" | "same_hardware_context" | "related_investigation" | "replicates" | "duplicate_publication";
            /** Source */
            source: string;
            /** Target */
            target: string;
        };
        /** EvidenceSearch */
        EvidenceSearch: {
            /**
             * Accessions
             * @default []
             */
            accessions: string[];
            /**
             * Fields
             * @default []
             */
            fields: string[];
            /**
             * Limit
             * @default 20
             */
            limit: number;
            /** Snapshot Id */
            snapshot_id?: string | null;
            /** Text */
            text: string;
        };
        /** ExecutionCommand */
        ExecutionCommand: {
            /** Code */
            code: string;
            /**
             * Confirmed Extended Runtime
             * @default false
             */
            confirmed_extended_runtime: boolean;
            /**
             * Language
             * @enum {string}
             */
            language: "python" | "shell";
            /**
             * Profile
             * @default standard
             * @enum {string}
             */
            profile: "standard" | "extended";
            /** Seed */
            seed?: number | null;
        };
        /** ExecutionSessionInputs */
        ExecutionSessionInputs: {
            /** Asset Sha256 */
            asset_sha256?: string[];
            /** Snapshot Id */
            snapshot_id: string;
            /** Source Job Ids */
            source_job_ids?: string[];
            /** Upload Ids */
            upload_ids?: string[];
        };
        /** ExportInputs */
        ExportInputs: {
            /**
             * Confirmed Selected Private Data
             * @default false
             */
            confirmed_selected_private_data: boolean;
            selection: components["schemas"]["CaseExport"];
        };
        /** FieldPredicate */
        FieldPredicate: {
            /** Basis */
            basis?: string | null;
            /**
             * Include Missing
             * @default false
             */
            include_missing: boolean;
            /** Location */
            location?: string | null;
            /**
             * Operator
             * @enum {string}
             */
            operator: "eq" | "lt" | "lte" | "gt" | "gte" | "contains" | "missing" | "present";
            /** Quantity Kind */
            quantity_kind?: string | null;
            /** Source Column */
            source_column?: string | null;
            /** Source Value Kind */
            source_value_kind?: ("source_reported" | "measurement" | "condition" | "setting" | "derived" | "code" | "not_specified") | null;
            /** Unit */
            unit?: string | null;
            /** Value */
            value?: number | string | null;
        };
        /** FilterBinding */
        FilterBinding: {
            /**
             * Empty Selection
             * @enum {string}
             */
            empty_selection: "all" | "none";
            /** Source Column */
            source_column: number;
            /** Source Component */
            source_component: string;
            /** Target Column */
            target_column: number;
            /** Target Component */
            target_component: string;
        };
        /** FocusedView */
        FocusedView: {
            /** Artifact Id */
            artifact_id?: string | null;
            /**
             * Kind
             * @enum {string}
             */
            kind: "query" | "chart";
            /** Spec */
            spec: {
                [key: string]: unknown;
            };
        };
        /** FrozenArtifact */
        FrozenArtifact: {
            /** Artifact Id */
            artifact_id: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "analysis" | "fit" | "model" | "execution" | "evidence" | "comparison" | "scenario" | "hypothesis" | "control" | "dashboard" | "research_answer";
            /** Limitations */
            limitations: string[];
            /** Payload */
            payload: {
                [key: string]: unknown;
            };
            /** Provenance */
            provenance: {
                [key: string]: unknown;
            };
            /**
             * Scientific Origin
             * @enum {string}
             */
            scientific_origin: "measured" | "derived" | "model_interpretation" | "prediction" | "exploratory_execution" | "hypothetical" | "unknown" | "source_metadata" | "source_measurement" | "source_text" | "source_media" | "deterministic_calculation" | "source_summary" | "research_hypothesis" | "descriptive_fit";
            /** Snapshot Id */
            snapshot_id: string;
            /** Source Sha256 */
            source_sha256?: string[];
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** Hypothesis */
        Hypothesis: {
            /** Assumptions */
            assumptions: string[];
            /**
             * Contrary
             * @default []
             */
            contrary: components["schemas"]["Claim"][];
            /** Falsifier */
            falsifier: string;
            /** Mechanism */
            mechanism: string;
            /** Predicted Observation */
            predicted_observation: string;
            /** Question */
            question: string;
            /**
             * Supporting
             * @default []
             */
            supporting: components["schemas"]["Claim"][];
            /** Variables To Characterize */
            variables_to_characterize: string[];
        };
        /** ImageMeasurementRequest */
        ImageMeasurementRequest: {
            /**
             * Boundary Direction
             * @default increasing
             * @enum {string}
             */
            boundary_direction: "increasing" | "decreasing";
            calibration?: components["schemas"]["SpatialCalibration"] | null;
            /** Component Id */
            component_id?: number | null;
            context: components["schemas"]["MethodContext"];
            /** Expected Sha256 */
            expected_sha256: string;
            /**
             * Foreground
             * @enum {string}
             */
            foreground: "at_or_above" | "at_or_below";
            /**
             * Frame Index
             * @default 0
             */
            frame_index: number;
            /**
             * Intensity Channel
             * @enum {string}
             */
            intensity_channel: "luminance_bt601" | "red" | "green" | "blue" | "grayscale";
            /**
             * Measurement Axis
             * @default x
             * @enum {string}
             */
            measurement_axis: "x" | "y";
            /**
             * Observable
             * @enum {string}
             */
            observable: "luminous_edge" | "pyrolysis_front" | "char_boundary" | "projected_droplet";
            /** Observable Definition Reference */
            observable_definition_reference?: string | null;
            roi: components["schemas"]["PixelRegion"];
            /** Segmentation Validation Reference */
            segmentation_validation_reference?: string | null;
            /** Threshold */
            threshold: number;
        };
        /** InvestigationQuery */
        InvestigationQuery: {
            /**
             * Accessions
             * @default []
             */
            accessions: string[];
            /** Availability */
            availability?: ("catalog_only" | "assets_available" | "interpreted_table") | null;
            /** Catalog Facets */
            catalog_facets?: {
                [key: string]: string[];
            };
            /** Cursor */
            cursor?: string | null;
            /** Hardware */
            hardware?: string | null;
            /** License */
            license?: ("CC0-1.0" | "unknown") | null;
            /**
             * Limit
             * @default 50
             */
            limit: number;
            /** Platform */
            platform?: string | null;
            /** Snapshot Id */
            snapshot_id?: string | null;
            /**
             * Text
             * @default
             */
            text: string;
        };
        /** MediaMeasurement */
        MediaMeasurement: {
            /** Accession */
            accession?: string | null;
            /** Asset Id */
            asset_id?: string | null;
            /** Frame Index */
            frame_index?: number | null;
            measurement: components["schemas"]["ImageMeasurementRequest"];
            /** Snapshot Id */
            snapshot_id: string;
            /** Source Sha256 */
            source_sha256: string;
        };
        /** MediaSelection */
        MediaSelection: {
            /** Duration Seconds */
            duration_seconds?: number | null;
            /**
             * Kind
             * @default frame
             * @enum {string}
             */
            kind: "frame" | "clip";
            /**
             * Time Seconds
             * @default 0
             */
            time_seconds: number;
        };
        /** MethodCall */
        MethodCall: {
            /** Method */
            method: string;
            /** Parameters */
            parameters: {
                [key: string]: unknown;
            };
        };
        /** MethodChartSpec */
        MethodChartSpec: {
            /** Job Ids */
            job_ids: string[];
            /** Title */
            title: string;
            /**
             * View
             * @enum {string}
             */
            view: "fit" | "residual" | "interval" | "observed_predicted" | "track" | "boundary";
            /**
             * X Scale
             * @default linear
             * @enum {string}
             */
            x_scale: "linear" | "log";
            /**
             * Y Scale
             * @default linear
             * @enum {string}
             */
            y_scale: "linear" | "log";
        };
        /**
         * MethodContext
         * @description Provenance supplied with inputs; a synthetic reference is never a measurement.
         */
        MethodContext: {
            /**
             * Assumptions
             * @default []
             */
            assumptions: string[];
            /** Conditions */
            conditions?: {
                [key: string]: string;
            };
            /**
             * Input Origin
             * @enum {string}
             */
            input_origin: "measured" | "analyst_input" | "synthetic_reference";
            /** Source Snapshot */
            source_snapshot?: string | null;
            /** Sources */
            sources: components["schemas"]["EvidenceReference"][];
        };
        /** OxygenInputs */
        OxygenInputs: {
            /** Absolute Pressure */
            absolute_pressure: number;
            /**
             * Fraction Basis
             * @enum {string}
             */
            fraction_basis: "mole" | "volume";
            /** Oxygen Percent */
            oxygen_percent: number;
            /**
             * Pressure Unit
             * @enum {string}
             */
            pressure_unit: "Pa" | "kPa" | "bar" | "psia";
        };
        /** PixelRegion */
        PixelRegion: {
            /** Bottom */
            bottom: number;
            /** Left */
            left: number;
            /** Right */
            right: number;
            /** Top */
            top: number;
        };
        /** PixelTraceCall */
        PixelTraceCall: {
            request: components["schemas"]["PixelTraceRequest"];
        };
        /** PixelTracePoint */
        PixelTracePoint: {
            /** Exclude Reason */
            exclude_reason?: string | null;
            /** Frame Index */
            frame_index?: number | null;
            /** Pixel Value */
            pixel_value: number;
            /** Source Locator */
            source_locator: string;
            /** Source Sha256 */
            source_sha256: string;
            /** Time Seconds */
            time_seconds?: number | null;
        };
        /** PixelTraceRequest */
        PixelTraceRequest: {
            calibration: components["schemas"]["SpatialCalibration"];
            context: components["schemas"]["MethodContext"];
            /**
             * Coordinate Axis
             * @default x
             * @enum {string}
             */
            coordinate_axis: "x" | "y";
            /** Coordinate Definition */
            coordinate_definition: string;
            /**
             * Diameter Definition
             * @default projected_area_equivalent
             * @enum {string}
             */
            diameter_definition: "projected_area_equivalent" | "axis_aligned_length";
            /** Fps Denominator */
            fps_denominator?: number | null;
            /** Fps Numerator */
            fps_numerator?: number | null;
            /** Frame Timing Assumption */
            frame_timing_assumption?: string | null;
            /**
             * Observable
             * @enum {string}
             */
            observable: "luminous_edge" | "pyrolysis_front" | "char_boundary" | "projected_droplet_diameter";
            /** Points */
            points: components["schemas"]["PixelTracePoint"][];
            /** Segmentation Validation Reference */
            segmentation_validation_reference?: string | null;
            /** Time Calibration Reference */
            time_calibration_reference?: string | null;
            /** Time Origin Definition */
            time_origin_definition: string;
            /**
             * Time Origin Frame
             * @default 0
             */
            time_origin_frame: number;
            /**
             * Time Origin Seconds
             * @default 0
             */
            time_origin_seconds: number;
        };
        /** PredictionInputs */
        PredictionInputs: {
            /** Conditions */
            conditions: {
                [key: string]: string;
            };
            context: components["schemas"]["MethodContext"];
            /**
             * Interval Level
             * @default 0.95
             */
            interval_level: number;
            /** Predictor Value */
            predictor_value: number;
        };
        /** QueryFilter */
        QueryFilter: {
            /** Binding Id */
            binding_id?: string | null;
            /** Column */
            column: number;
            /**
             * Operation
             * @enum {string}
             */
            operation: "equals" | "in" | "minimum" | "maximum" | "present";
            /**
             * Representation
             * @default original
             * @enum {string}
             */
            representation: "original" | "canonical";
            /** Value */
            value?: string | number | (string | number)[] | null;
        };
        /** QuerySpec */
        QuerySpec: {
            /** Aggregations */
            aggregations?: components["schemas"]["AggregateField"][];
            /** Asset Sha256 */
            asset_sha256: string;
            /** Column Representations */
            column_representations?: {
                [key: string]: "original" | "canonical";
            };
            /** Columns */
            columns: number[];
            /** Filters */
            filters?: components["schemas"]["QueryFilter"][];
            /** Group By */
            group_by?: number[];
            /**
             * Limit
             * @default 1000
             */
            limit: number;
            /**
             * Representation
             * @default original
             * @enum {string}
             */
            representation: "original" | "canonical";
            /**
             * Schema Version
             * @default 1
             * @constant
             */
            schema_version: 1;
            /** Snapshot Id */
            snapshot_id: string;
            /**
             * Source Rows
             * @description Omit or null for all source records; [] is an explicit empty selection.
             */
            source_rows?: number[] | null;
        };
        /** RecordPage */
        RecordPage: {
            /** Accession */
            accession: string;
            /** Adapter Id */
            adapter_id: string;
            /** Asset */
            asset: {
                [key: string]: unknown;
            };
            /** Asset Id */
            asset_id: string;
            /** Empty Record Count */
            empty_record_count: number;
            /** File Name */
            file_name: string;
            /** File Version */
            file_version: number;
            /** Headers */
            headers: string[];
            /** Independent Run Count */
            independent_run_count?: null;
            /** Limit */
            limit: number;
            /** Limitations */
            limitations: string[];
            /** Offset */
            offset: number;
            /** Records */
            records: components["schemas"]["SourceRecord"][];
            /** Refusals */
            refusals?: string[];
            /** Row Kind */
            row_kind?: string | null;
            /** Row Kind Counts */
            row_kind_counts: {
                [key: string]: number;
            };
            /**
             * Schema Version
             * @default 1
             * @constant
             */
            schema_version: 1;
            /** Snapshot Id */
            snapshot_id: string;
            /** Source Record Count */
            source_record_count: number;
            /** Source Sha256 */
            source_sha256: string;
            /** Source Url */
            source_url: string;
            /**
             * Status
             * @enum {string}
             */
            status: "interpreted" | "schema_unrecognized";
            /** Total Records */
            total_records: number;
        };
        /** RecordQuery */
        RecordQuery: {
            /**
             * Accessions
             * @default []
             */
            accessions: string[];
            /** Catalog Facets */
            catalog_facets?: {
                [key: string]: string[];
            };
            /** Cursor */
            cursor?: string | null;
            /**
             * Limit
             * @default 50
             */
            limit: number;
            /**
             * Predicates
             * @default []
             */
            predicates: components["schemas"]["FieldPredicate"][];
            /**
             * Row Kinds
             * @default []
             */
            row_kinds: ("source_test_record" | "condition_record" | "range_summary" | "daily_summary" | "session_record" | "sample_record" | "flow_visualization" | "note" | "unclassified_record" | "published_summary")[];
            /** Snapshot Id */
            snapshot_id?: string | null;
            /**
             * Text
             * @default
             */
            text: string;
        };
        /** ReportedVisualizationCondition */
        ReportedVisualizationCondition: {
            anchor: components["schemas"]["EvidenceAnchor"];
            /** Composition Basis */
            composition_basis?: "mole" | null;
            /**
             * Origin
             * @default source_reported_nominal
             * @constant
             */
            origin: "source_reported_nominal";
            /** Pressure Reference */
            pressure_reference?: "unreported" | null;
            /** Source Text */
            source_text: string;
            /**
             * Unit
             * @enum {string}
             */
            unit: "atm" | "K" | "1";
            /** Value */
            value: number;
        };
        /** ReportedVisualizationParameter */
        ReportedVisualizationParameter: {
            anchor: components["schemas"]["EvidenceAnchor"];
            /**
             * Origin
             * @default source_reported_nominal
             * @constant
             */
            origin: "source_reported_nominal";
            /** Source Text */
            source_text: string;
            /**
             * Unit
             * @enum {string}
             */
            unit: "mm" | "mm^2/s";
            /** Value */
            value: number;
        };
        /** ResearchRequest */
        ResearchRequest: {
            agent_profile?: components["schemas"]["CustomAgentProfile"] | null;
            /**
             * Complexity
             * @default auto
             * @enum {string}
             */
            complexity: "auto" | "routine" | "complex";
            context: components["schemas"]["WorkspaceContext"];
            /** Expected Context Version */
            expected_context_version: string;
            /** History */
            history?: components["schemas"]["ConversationTurn"][];
            /** Images */
            images?: components["schemas"]["SelectedImage"][];
            /** Question */
            question: string;
            /**
             * Role
             * @default coordinator
             * @enum {string}
             */
            role: "coordinator" | "evidence" | "extraction" | "analysis" | "verification";
        };
        /** SelectedArtifact */
        SelectedArtifact: {
            /**
             * Artifact Id
             * Format: uuid
             */
            artifact_id: string;
            /**
             * Consent To Model
             * @default false
             */
            consent_to_model: boolean;
            /** Expected Sha256 */
            expected_sha256: string;
            /**
             * Job Id
             * Format: uuid
             */
            job_id: string;
        };
        /** SelectedImage */
        SelectedImage: {
            /** Accession */
            accession?: string | null;
            /** Asset Id */
            asset_id?: string | null;
            /** Asset Sha256 */
            asset_sha256?: string | null;
            /**
             * Consent
             * @constant
             */
            consent: true;
            /** Expected Sha256 */
            expected_sha256: string;
            /** Image Base64 */
            image_base64?: string | null;
            /**
             * Media Type
             * @enum {string}
             */
            media_type: "image/png" | "image/jpeg";
            /** Purpose */
            purpose: string;
        };
        /** SelectedPrivateInput */
        SelectedPrivateInput: {
            /**
             * Consent To Model
             * @default false
             */
            consent_to_model: boolean;
            /** Expected Sha256 */
            expected_sha256: string;
            /** Source Job Id */
            source_job_id?: string | null;
            /** Text Encoding */
            text_encoding?: ("utf-8" | "utf-8-sig" | "ascii" | "cp1252") | null;
            /** Upload Id */
            upload_id?: string | null;
        };
        /** SelectedSource */
        SelectedSource: {
            /** Accession */
            accession?: string | null;
            /** Asset Id */
            asset_id?: string | null;
            /** Asset Sha256 */
            asset_sha256: string;
            /** Columns */
            columns?: number[];
            /** Source Rows */
            source_rows?: number[];
        };
        /** SemanticQuery */
        SemanticQuery: {
            /** Accessions */
            accessions?: string[];
            /** Document Kinds */
            document_kinds?: ("investigation_metadata" | "source_passage")[];
            /**
             * Limit
             * @default 12
             */
            limit: number;
            /** Query */
            query: string;
            /** Snapshot Id */
            snapshot_id: string;
            /** Source Kinds */
            source_kinds?: ("psi" | "ntrs" | "nasa")[];
            /** Source Sha256 */
            source_sha256?: string[];
        };
        /** SmoothingSpec */
        SmoothingSpec: {
            /** Justification */
            justification: string;
            /** Maximum Gap */
            maximum_gap: number;
            /**
             * Method Id
             * @default centered-moving-average-v1
             * @constant
             */
            method_id: "centered-moving-average-v1";
            /** Window Points */
            window_points: number;
        };
        /** SourceDropletVisualizationRequest */
        SourceDropletVisualizationRequest: {
            /**
             * Sample Count
             * @default 241
             */
            sample_count: number;
            /** Snapshot Id */
            snapshot_id: string;
        };
        /** SourceDropletVisualizationResult */
        SourceDropletVisualizationResult: {
            /**
             * Artifact Type
             * @default educational_simulation
             * @constant
             */
            artifact_type: "educational_simulation";
            /** Assumptions */
            assumptions: string[];
            /**
             * Autoplay
             * @default false
             * @constant
             */
            autoplay: false;
            /** Condition Sources */
            condition_sources: {
                [key: string]: components["schemas"]["ReportedVisualizationCondition"];
            };
            context: components["schemas"]["MethodContext"];
            /** Equations */
            equations: string[];
            /** Idealized Endpoint S */
            idealized_endpoint_s: number;
            /** Initial Diameter Squared Mm2 */
            initial_diameter_squared_mm2: number;
            /** Limitations */
            limitations: string[];
            /**
             * Method Id
             * @default droplet_d_squared_v1
             * @constant
             */
            method_id: "droplet_d_squared_v1";
            /**
             * Model Id
             * @default droplet_d_squared_v1
             * @constant
             */
            model_id: "droplet_d_squared_v1";
            /**
             * Origin
             * @default deterministic_calculation
             * @constant
             */
            origin: "deterministic_calculation";
            /**
             * Parameter Origin
             * @enum {string}
             */
            parameter_origin: "analyst_assumptions" | "source_reported_nominal";
            /** Parameter Sources */
            parameter_sources: {
                [key: string]: components["schemas"]["ReportedVisualizationParameter"];
            };
            /** Point Count */
            point_count: number;
            /** Points */
            points: components["schemas"]["DropletVisualizationPoint"][];
            /** References */
            references: string[];
            /** Request */
            request: components["schemas"]["DropletVisualizationRequest"] | components["schemas"]["SourceReportedDropletInputs"];
            /**
             * Requires Open
             * @default true
             * @constant
             */
            requires_open: true;
            /**
             * Scientific Qualification
             * @default An analytical teaching calculation using assumed parameters. This is not a NASA measurement, validated experimental reconstruction or operational safety prediction.
             */
            scientific_qualification: string;
            /** Source Conditions */
            source_conditions: {
                [key: string]: string;
            };
            /**
             * Source Profile Id
             * @default flex-007-nominal-v1
             * @constant
             */
            source_profile_id: "flex-007-nominal-v1";
            /** Source Record Limitations */
            source_record_limitations: string[];
            /**
             * Status
             * @default illustrative_model
             * @constant
             */
            status: "illustrative_model";
            /** Summaries */
            summaries: {
                [key: string]: components["schemas"]["VisualizationQuantity"];
            };
            /** Units */
            units: {
                [key: string]: string;
            };
        };
        /** SourceField */
        SourceField: {
            /** Basis */
            basis?: string | null;
            /** Canonical Unit */
            canonical_unit?: string | null;
            /** Canonical Value */
            canonical_value?: number | null;
            /** Column Index */
            column_index: number;
            /** Location */
            location?: string | null;
            /** Missing Reason */
            missing_reason?: ("not_reported" | "not_applicable" | "ambiguous" | "invalid") | null;
            /** Notes */
            notes?: string[];
            /** Original Unit */
            original_unit?: string | null;
            /** Qualifier */
            qualifier?: string | null;
            /** Quantity Kind */
            quantity_kind?: string | null;
            /** Raw Text */
            raw_text: string;
            /** Source Column */
            source_column: string | null;
            /**
             * Source Value Kind
             * @default not_specified
             * @enum {string}
             */
            source_value_kind: "source_reported" | "measurement" | "condition" | "setting" | "derived" | "code" | "not_specified";
            /**
             * Status
             * @default text
             * @enum {string}
             */
            status: "text" | "normalized" | "missing" | "unresolved";
            /** Transformation Formula */
            transformation_formula?: string | null;
            /** Transformation Id */
            transformation_id?: string | null;
        };
        /** SourceRecord */
        SourceRecord: {
            /** Fields */
            fields: components["schemas"]["SourceField"][];
            /** Line End */
            line_end: number;
            /** Raw Cells */
            raw_cells: string[];
            /**
             * Row Kind
             * @enum {string}
             */
            row_kind: "source_test_record" | "condition_record" | "range_summary" | "daily_summary" | "session_record" | "sample_record" | "flow_visualization" | "note" | "unclassified_record" | "published_summary";
            /** Source Row */
            source_row: number;
        };
        /**
         * SourceReportedDropletInputs
         * @description Constructed by the source-profile reader, never accepted by the editable API.
         */
        SourceReportedDropletInputs: {
            /** Burning Constant Mm2 S */
            burning_constant_mm2_s: number;
            context: components["schemas"]["MethodContext"];
            /** Initial Diameter Mm */
            initial_diameter_mm: number;
            /** Investigation Accession */
            investigation_accession?: string | null;
            /**
             * Model Id
             * @default droplet_d_squared_v1
             * @constant
             */
            model_id: "droplet_d_squared_v1";
            /**
             * Parameter Origin
             * @default source_reported_nominal
             * @constant
             */
            parameter_origin: "source_reported_nominal";
            /**
             * Sample Count
             * @default 241
             */
            sample_count: number;
            /**
             * Source Profile Id
             * @default flex-007-nominal-v1
             * @constant
             */
            source_profile_id: "flex-007-nominal-v1";
        };
        /** SourceSelection */
        SourceSelection: {
            /** Asset Sha256 */
            asset_sha256: string;
            /** Source Rows */
            source_rows: number[];
        };
        /** SpatialCalibration */
        SpatialCalibration: {
            /** Calibrated Image Height */
            calibrated_image_height: number;
            /** Calibrated Image Width */
            calibrated_image_width: number;
            /** Calibration Reference */
            calibration_reference: string;
            /** Geometry Reference */
            geometry_reference: string;
            /** Metres Per Pixel */
            metres_per_pixel?: number | null;
            /** Metres Per Pixel X */
            metres_per_pixel_x?: number | null;
            /** Metres Per Pixel Y */
            metres_per_pixel_y?: number | null;
            /**
             * Origin Metres
             * @default 0
             */
            origin_metres: number;
            /**
             * Origin Pixel
             * @default 0
             */
            origin_pixel: number;
            /** Square Pixel Justification */
            square_pixel_justification?: string | null;
            /**
             * Viewing Geometry
             * @enum {string}
             */
            viewing_geometry: "planar_orthographic" | "unresolved";
            /** X Calibration Reference */
            x_calibration_reference?: string | null;
            /** Y Calibration Reference */
            y_calibration_reference?: string | null;
        };
        /** SubmitUpload */
        SubmitUpload: {
            /**
             * Confirmed Submit
             * @default false
             */
            confirmed_submit: boolean;
            /** Sha256 */
            sha256: string;
        };
        /** UncertaintyProvenance */
        UncertaintyProvenance: {
            /** Justification */
            justification: string;
            /** Level */
            level?: number | null;
            /**
             * Method Id
             * @constant
             */
            method_id: "source-record-summary-v1";
            /** Unit */
            unit: string;
        };
        /** UploadInputs */
        UploadInputs: {
            /** Byte Size */
            byte_size: number;
            /**
             * Confirmed Temporary Processing
             * @default false
             */
            confirmed_temporary_processing: boolean;
            /** File Name */
            file_name: string;
            /**
             * Intended Use
             * @enum {string}
             */
            intended_use: "analysis" | "evidence" | "execution_input" | "reproducibility";
            /** License */
            license: string;
            /**
             * Redistribution Allowed
             * @default false
             */
            redistribution_allowed: boolean;
            /** Rights Assertion */
            rights_assertion: string;
            /** Sha256 */
            sha256: string;
            /** Snapshot Id */
            snapshot_id: string;
            /**
             * Text Encoding
             * @default utf-8-sig
             * @enum {string}
             */
            text_encoding: "utf-8" | "utf-8-sig" | "ascii" | "cp1252";
        };
        /** ValidationError */
        ValidationError: {
            /** Context */
            ctx?: Record<string, never>;
            /** Input */
            input?: unknown;
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
        };
        /** VisualizationQuantity */
        VisualizationQuantity: {
            /**
             * Unit
             * @enum {string}
             */
            unit: "mm" | "mm^2" | "mm^2/s" | "s";
            /** Value */
            value: number;
        };
        /** VoiceContextUpdate */
        VoiceContextUpdate: {
            context: components["schemas"]["WorkspaceContext"];
            /** Expected Context Version */
            expected_context_version: string;
            /**
             * Image Consent
             * @default false
             */
            image_consent: boolean;
            /** Images */
            images?: components["schemas"]["SelectedImage"][];
            /**
             * Operation Id
             * Format: uuid
             */
            operation_id: string;
        };
        /** VoiceControl */
        VoiceControl: {
            /**
             * Action
             * @enum {string}
             */
            action: "mute" | "unmute" | "stop_speaking" | "stop_generation" | "resume_generation" | "cancel_computation" | "end" | "revoke_microphone";
            /** Expected Context Version */
            expected_context_version: string;
            /** Job Ids */
            job_ids?: string[];
            /**
             * Operation Id
             * Format: uuid
             */
            operation_id: string;
        };
        /** VoiceQuestion */
        VoiceQuestion: {
            /** Expected Context Version */
            expected_context_version: string;
            /**
             * Operation Id
             * Format: uuid
             */
            operation_id: string;
            /** Question */
            question: string;
        };
        /** VoiceRenew */
        VoiceRenew: {
            /** Expected Context Version */
            expected_context_version: string;
            /** Microphone Consent */
            microphone_consent: boolean;
            /**
             * Operation Id
             * Format: uuid
             */
            operation_id: string;
        };
        /** VoiceStart */
        VoiceStart: {
            context: components["schemas"]["WorkspaceContext"];
            /** Expected Context Version */
            expected_context_version: string;
            /**
             * Image Consent
             * @default false
             */
            image_consent: boolean;
            /** Images */
            images?: components["schemas"]["SelectedImage"][];
            /** Microphone Consent */
            microphone_consent: boolean;
            /**
             * Operation Id
             * Format: uuid
             */
            operation_id: string;
            /** Resume Session Id */
            resume_session_id?: string | null;
            /** Sdp */
            sdp: string;
        };
        /** WorkspaceContext */
        WorkspaceContext: {
            /** Active Artifact Id */
            active_artifact_id?: string | null;
            /** Case Revision */
            case_revision?: string | null;
            /** Context Version */
            context_version: string;
            focused_view?: components["schemas"]["FocusedView"] | null;
            /** Investigations */
            investigations?: string[];
            /** Scenario */
            scenario?: {
                [key: string]: unknown;
            };
            /**
             * Schema Version
             * @default 1
             * @constant
             */
            schema_version: 1;
            /** Selected Artifacts */
            selected_artifacts?: components["schemas"]["SelectedArtifact"][];
            /** Selected Evidence */
            selected_evidence?: components["schemas"]["EvidenceAnchor"][];
            /** Selected Private Inputs */
            selected_private_inputs?: components["schemas"]["SelectedPrivateInput"][];
            /** Selected Sources */
            selected_sources?: components["schemas"]["SelectedSource"][];
            /** Snapshot Id */
            snapshot_id: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    no_unsolicited_stream_mcp_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    message_mcp_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    catalog_v1_agents_catalog_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    draft_v1_agents_draft_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AgentDraftRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AgentDraftResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    bass_calibration_evidence_v1_analyses_bass_calibration_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
                investigator?: string | null;
                test_number?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    flex_trace_evidence_v1_analyses_flex_007_source_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    flex_analysis_v1_analyses_flex_endpoints_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    embedded_figure_v1_assets__digest__embedded_figure_get: {
        parameters: {
            query: {
                member: string;
                snapshot_id?: string | null;
                accession?: string | null;
                asset_id?: string | null;
            };
            header?: never;
            path: {
                digest: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    source_format_v1_assets__digest__format_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
                sheet?: string | null;
                limit?: number;
                offset?: number;
                accession?: string | null;
                asset_id?: string | null;
            };
            header?: never;
            path: {
                digest: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    frame_v1_assets__digest__frames__frame_index__get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
                accession?: string | null;
                asset_id?: string | null;
            };
            header?: never;
            path: {
                digest: string;
                frame_index: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    frame_image_v1_assets__digest__frames__frame_index__image_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
                accession?: string | null;
                asset_id?: string | null;
            };
            header?: never;
            path: {
                digest: string;
                frame_index: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "image/png": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    media_v1_assets__digest__media_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
                accession?: string | null;
                asset_id?: string | null;
            };
            header?: never;
            path: {
                digest: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    preview_v1_assets__digest__media_preview_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
                accession?: string | null;
                asset_id?: string | null;
            };
            header?: never;
            path: {
                digest: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    download_asset_v1_assets__digest__raw_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
                accession?: string | null;
                asset_id?: string | null;
            };
            header?: never;
            path: {
                digest: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    scientific_records_v1_assets__digest__records_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
                row_kind?: ("source_test_record" | "condition_record" | "range_summary" | "daily_summary" | "session_record" | "sample_record" | "flow_visualization" | "note" | "unclassified_record" | "published_summary") | null;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                digest: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecordPage"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    table_v1_assets__digest__table_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                snapshot_id?: string | null;
            };
            header?: never;
            path: {
                digest: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    text_source_v1_assets__digest__text_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                digest: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    workbook_v1_assets__digest__workbook_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
                sheet?: string | null;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                digest: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    partial_pressure_v1_calculations_oxygen_partial_pressure_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OxygenInputs"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    capabilities_v1_capabilities_models_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    method_chart_v1_charts_method_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MethodChartSpec"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    chart_v1_charts_validate_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChartSpec"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    resolve_cohort_v1_cohorts_resolve_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CohortInputs"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    compare_v1_comparisons_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ComparisonInputs"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    select_dashboard_v1_dashboards_select_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DashboardSelection"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    dashboard_v1_dashboards_validate_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DashboardValidation"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    investigations_v1_discovery_investigations_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InvestigationQuery"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    records_v1_discovery_records_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RecordQuery"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    condition_coverage_v1_evidence_condition_coverage_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CoverageRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    contradictions_v1_evidence_contradictions_compare_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClaimPair"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    coverage_v1_evidence_coverage_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
                accession?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    dependencies_v1_evidence_dependencies_invalidate_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DependencyQuery"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    documents_v1_evidence_documents_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    earth_applications_v1_evidence_earth_applications_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    lineage_v1_evidence_lineage_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_evidence_v1_evidence_read_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EvidenceAnchor"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    search_evidence_v1_evidence_search_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EvidenceSearch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    execution_status_v1_execution_capability_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    new_execution_v1_execution_sessions_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExecutionSessionInputs"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    inspect_session_v1_execution_sessions__session_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    close_session_v1_execution_sessions__session_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    execute_v1_execution_sessions__session_id__commands_post: {
        parameters: {
            query?: never;
            header?: {
                "idempotency-key"?: string | null;
            };
            path: {
                session_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExecutionCommand"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    renew_v1_execution_sessions__session_id__renew_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_case_v1_exports_post: {
        parameters: {
            query?: never;
            header?: {
                "idempotency-key"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExportInputs"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    flex_export_v1_exports_flex_endpoints_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    health_v1_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    list_investigations_v1_investigations_get: {
        parameters: {
            query?: {
                q?: string;
                limit?: number;
                offset?: number;
                snapshot_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_investigation_v1_investigations__accession__get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
            };
            header?: never;
            path: {
                accession: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    dossier_v1_investigations__accession__dossier_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
            };
            header?: never;
            path: {
                accession: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    manifest_v1_investigations__accession__manifest_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                accession: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_export_v1_jobs_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    get_job_v1_jobs__job_id__get: {
        parameters: {
            query?: never;
            header?: {
                "x-job-receipt"?: string | null;
            };
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    remove_v1_jobs__job_id__delete: {
        parameters: {
            query?: never;
            header?: {
                "x-job-receipt"?: string | null;
            };
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_v1_jobs__job_id__cancel_post: {
        parameters: {
            query?: never;
            header?: {
                "x-job-receipt"?: string | null;
            };
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    events_v1_jobs__job_id__events_get: {
        parameters: {
            query?: {
                after?: number;
            };
            header?: {
                "x-job-receipt"?: string | null;
                "last-event-id"?: number | null;
            };
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": string;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    measure_v1_media_measure_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MediaMeasurement"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    pixel_trace_v1_media_pixel_trace_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PixelTraceCall"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    methods_v1_methods_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    calculate_v1_methods_calculate_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MethodCall"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    models_v1_models_get: {
        parameters: {
            query?: {
                snapshot_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    card_v1_models__identifier__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                identifier: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    domain_v1_models__identifier__domain_check_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                identifier: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PredictionInputs"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    prediction_v1_models__identifier__predict_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                identifier: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PredictionInputs"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    query_dataset_v1_queries_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QuerySpec"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    aggregate_dataset_v1_queries_aggregate_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AggregateQuery"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    research_v1_research_post: {
        parameters: {
            query?: never;
            header?: {
                "idempotency-key"?: string | null;
            };
            path?: never;
            cookie?: {
                nova_browser_receipt?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResearchRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    control_v1_research_controls_assess_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ControlCandidate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    transfer_v1_research_earth_transfer_assess_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EarthTransfer"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    hypothesis_plan_v1_research_hypotheses_assess_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Hypothesis"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    presets_v1_scenarios_presets_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    search_v1_search_semantic_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SemanticQuery"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    current_snapshot_v1_snapshots_current_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    frozen_snapshot_v1_snapshots__snapshot_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                snapshot_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    changes_v1_snapshots__snapshot_id__changes_get: {
        parameters: {
            query?: {
                against_id?: string | null;
            };
            header?: never;
            path: {
                snapshot_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    acquire_v1_source_acquisitions_post: {
        parameters: {
            query?: never;
            header?: {
                "idempotency-key"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AcquisitionInputs"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    profile_v1_source_acquisitions_profile_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    content_v1_source_acquisitions__job_id__content_get: {
        parameters: {
            query?: never;
            header?: {
                "x-job-receipt"?: string | null;
            };
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": unknown;
                };
            };
            /** @description Selected original byte range */
            206: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    table_v1_source_acquisitions__job_id__table_preview_get: {
        parameters: {
            query?: {
                encoding?: "utf-8-sig" | "cp1252";
                limit?: number;
            };
            header?: {
                "x-job-receipt"?: string | null;
            };
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    source_refresh_status_v1_source_refresh_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    list_uploads_v1_uploads_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    prepare_upload_v1_uploads_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UploadInputs"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upload_profile_v1_uploads_profile_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    read_upload_v1_uploads__upload_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                upload_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    remove_upload_v1_uploads__upload_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                upload_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upload_chunk_v1_uploads__upload_id__chunks_put: {
        parameters: {
            query: {
                offset: number;
            };
            header?: never;
            path: {
                upload_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/octet-stream": string;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    download_upload_v1_uploads__upload_id__content_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                upload_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": unknown;
                };
            };
            /** @description Selected original byte range */
            206: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    finalize_upload_v1_uploads__upload_id__finalize_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                upload_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SubmitUpload"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    usage_v1_usage_models_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    droplet_v1_visualizations_droplet_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DropletVisualizationRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DropletVisualizationResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    flex_007_v1_visualizations_flex_007_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SourceDropletVisualizationRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SourceDropletVisualizationResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_sessions_v1_voice_sessions_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                nova_browser_receipt?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    start_v1_voice_sessions_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                nova_browser_receipt?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VoiceStart"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    status_v1_voice_sessions__session_id__get: {
        parameters: {
            query?: {
                after_sequence?: number;
            };
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: {
                nova_browser_receipt?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_context_v1_voice_sessions__session_id__context_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: {
                nova_browser_receipt?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VoiceContextUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    control_v1_voice_sessions__session_id__controls_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: {
                nova_browser_receipt?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VoiceControl"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    text_question_v1_voice_sessions__session_id__questions_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: {
                nova_browser_receipt?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VoiceQuestion"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    renew_v1_voice_sessions__session_id__renew_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: {
                nova_browser_receipt?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VoiceRenew"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    task_v1_voice_sessions__session_id__tasks__job_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
                job_id: string;
            };
            cookie?: {
                nova_browser_receipt?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_workflow_v1_workflows__job_id__get: {
        parameters: {
            query?: never;
            header?: {
                "x-job-receipt"?: string | null;
            };
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    remove_v1_workflows__job_id__delete: {
        parameters: {
            query?: never;
            header?: {
                "x-job-receipt"?: string | null;
            };
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    approve_v1_workflows__job_id__approve_post: {
        parameters: {
            query?: never;
            header?: {
                "x-job-receipt"?: string | null;
            };
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ApprovalInputs"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    download_v1_workflows__job_id__artifacts__artifact_id__get: {
        parameters: {
            query?: never;
            header?: {
                "x-job-receipt"?: string | null;
            };
            path: {
                job_id: string;
                artifact_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    artifact_metadata_v1_workflows__job_id__artifacts__artifact_id__metadata_get: {
        parameters: {
            query?: never;
            header?: {
                "x-job-receipt"?: string | null;
            };
            path: {
                job_id: string;
                artifact_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_v1_workflows__job_id__cancel_post: {
        parameters: {
            query?: never;
            header?: {
                "x-job-receipt"?: string | null;
            };
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    workflow_events_v1_workflows__job_id__events_get: {
        parameters: {
            query?: {
                after?: number;
            };
            header?: {
                "x-job-receipt"?: string | null;
                "last-event-id"?: number | null;
            };
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": string;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
}
