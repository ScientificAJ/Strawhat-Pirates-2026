"""Frozen, licensed research bundles and numerical exports; no provider calls."""

from __future__ import annotations

import csv
import io
import json
import zipfile
from hashlib import sha256
from pathlib import Path
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import Field, model_validator

from .artifacts import (
    ChartSpec,
    Contract,
    Digest,
    MethodChartSpec,
    QuerySpec,
    execute_query,
    validate_chart,
)
from .jobs import canonical_json
from .repository import Corpus


class FrozenArtifact(Contract):
    artifact_id: Annotated[str, Field(pattern=r"^[a-zA-Z0-9_.-]{1,128}$")]
    kind: Literal[
        "analysis",
        "fit",
        "model",
        "execution",
        "evidence",
        "comparison",
        "scenario",
        "hypothesis",
        "control",
        "dashboard",
        "research_answer",
    ]
    snapshot_id: Digest
    scientific_origin: Literal[
        "measured",
        "derived",
        "model_interpretation",
        "prediction",
        "exploratory_execution",
        "hypothetical",
        "unknown",
        "source_metadata",
        "source_measurement",
        "source_text",
        "source_media",
        "deterministic_calculation",
        "source_summary",
        "research_hypothesis",
        "descriptive_fit",
    ]
    payload: dict
    provenance: dict
    source_sha256: list[Digest] = Field(default_factory=list, max_length=100)
    limitations: list[Annotated[str, Field(max_length=2000)]] = Field(min_length=1, max_length=100)


class CaseExport(Contract):
    schema_version: Literal[1] = 1
    snapshot_id: Digest
    case_id: Annotated[str, Field(min_length=1, max_length=128)]
    revision: Annotated[int, Field(ge=1)]
    question: Annotated[str, Field(min_length=1, max_length=4000)]
    notes: Annotated[str, Field(max_length=32000)] = ""
    queries: list[QuerySpec] = Field(default_factory=list, max_length=10)
    charts: list[ChartSpec] = Field(default_factory=list, max_length=10)
    method_charts: list[MethodChartSpec] = Field(default_factory=list, max_length=10)
    upload_ids: list[UUID] = Field(default_factory=list, max_length=10)
    artifacts: list[FrozenArtifact] = Field(default_factory=list, max_length=100)
    source_job_ids: list[UUID] = Field(default_factory=list, max_length=10)
    assumptions: list[Annotated[str, Field(max_length=2000)]] = Field(
        default_factory=list, max_length=100
    )
    limitations: list[Annotated[str, Field(max_length=2000)]] = Field(min_length=1, max_length=100)
    applicability: dict = Field(default_factory=dict)
    include_original_bytes: bool = False
    format: Literal[
        "bundle", "json", "csv", "parquet", "svg", "png", "pdf", "report", "notebook"
    ] = "bundle"

    @model_validator(mode="after")
    def preserve_safe_frozen_selection(self):
        ids = [item.artifact_id for item in self.artifacts]
        if len(ids) != len(set(ids)):
            raise ValueError("Frozen artifact identifiers must be unique in an export.")
        if any(item.snapshot_id != self.snapshot_id for item in self.artifacts):
            raise ValueError("Frozen artifacts must identify the selected corpus snapshot.")
        sensitive = {
            "openai_api_key",
            "api_key",
            "job_receipt",
            "browser_receipt",
            "receipt_sha256",
            "receipt",
        }

        def inspect(value, depth=0):
            if depth > 30:
                raise ValueError("Frozen research objects exceed the export nesting limit.")
            if isinstance(value, dict):
                for key, child in value.items():
                    if str(key).lower() in sensitive:
                        raise ValueError("Access credentials are not research export fields.")
                    inspect(child, depth + 1)
            elif isinstance(value, list):
                for child in value:
                    inspect(child, depth + 1)

        inspect(self.model_dump())
        return self


def csv_bytes(data: dict) -> bytes:
    output = io.StringIO(newline="")
    ordinary = ["source_row", "row_kind", *[column["key"] for column in data["columns"]]]
    extras = sorted({key for row in data["values"] for key in row} - set(ordinary))
    fields = [*ordinary, *extras, "snapshot_id", "asset_sha256", "accession", "source_units"]
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    units = {column["key"]: column["units"] for column in data["columns"]}
    for original in data["values"]:
        row = {
            key: json.dumps(value, sort_keys=True) if isinstance(value, (dict, list)) else value
            for key, value in original.items()
        }
        writer.writerow(
            {
                **row,
                "snapshot_id": data["snapshot_id"],
                "asset_sha256": data["asset"]["sha256"],
                "accession": data["asset"]["accession"],
                "source_units": json.dumps(units, sort_keys=True),
            }
        )
    return output.getvalue().encode("utf-8")


def parquet_bytes(data: dict) -> bytes:
    from importlib import import_module

    pa = import_module("pyarrow")
    pq = import_module("pyarrow.parquet")

    table = pa.Table.from_pylist(data["values"])
    table = table.replace_schema_metadata(
        {
            b"nova_ember_provenance": canonical_json(
                {
                    key: data[key]
                    for key in [
                        "snapshot_id",
                        "asset",
                        "query",
                        "columns",
                        "adapter_id",
                        "limitations",
                        "independent_run_count",
                    ]
                }
            )
        }
    )
    output = io.BytesIO()
    pq.write_table(table, output, compression="zstd")
    return output.getvalue()


def figure_bytes(chart: dict, format: str = "svg") -> bytes:
    """Render the validated numerical chart with the locked scientific plotting library."""
    from .charting import render_figure

    return render_figure(chart, format)


def svg_bytes(chart: dict) -> bytes:
    return figure_bytes(chart, "svg")


REPRODUCE = '''"""Reproduce the frozen tabular selections from checked original bytes."""
import hashlib,json,sys
from pathlib import Path
root=Path(__file__).resolve().parent
sys.path.insert(0,str(root/'runtime'))
from nova_ember.api.artifacts import ChartSpec,QuerySpec,execute_query,validate_chart
manifest=json.loads((root/'manifest.json').read_text())
class FrozenCorpus:
    def asset(self,digest,snapshot_id):
        if snapshot_id!=manifest['snapshot_id']:raise ValueError('Unexpected snapshot')
        return manifest['sources'][digest]
    def asset_bytes(self,asset):
        data=(root/'inputs'/asset['sha256']).read_bytes()
        if hashlib.sha256(data).hexdigest()!=asset['sha256']:
            raise ValueError('Source checksum mismatch')
        return data
for index,query in enumerate(manifest['queries']):
    actual=execute_query(FrozenCorpus(),QuerySpec.model_validate(query))
    expected=json.loads((root/'data'/f'query-{index+1}.json').read_text())
    if actual!=expected:raise AssertionError(f'Query {index+1} differs')
for index,chart in enumerate(manifest['charts']):
    actual=validate_chart(FrozenCorpus(),ChartSpec.model_validate(chart))
    expected=json.loads((root/'figures'/f'chart-{index+1}.json').read_text())
    if actual!=expected:raise AssertionError(f'Chart {index+1} differs')
print('All frozen numerical selections reproduced.')
'''


def build_export(
    corpus: Corpus, spec: CaseExport, *, receipt_sha256: str | None = None
) -> tuple[bytes, str, str, dict]:
    corpus.snapshot(spec.snapshot_id)
    if any(query.snapshot_id != spec.snapshot_id for query in spec.queries) or any(
        chart.query.snapshot_id != spec.snapshot_id for chart in spec.charts
    ):
        raise ValueError("Every exported object must use the selected frozen corpus snapshot.")
    data = [execute_query(corpus, query) for query in spec.queries]
    charts = [validate_chart(corpus, chart) for chart in spec.charts]
    sources = {
        item["asset"]["sha256"]: item["asset"]
        for item in [*data, *[chart["data"] for chart in charts]]
    }
    if spec.method_charts:
        from .charting import resolve_method_chart

        if receipt_sha256 is None:
            raise ValueError("Method-chart exports require their originating browser scope.")
        for definition in spec.method_charts:
            chart = resolve_method_chart(corpus.settings.database_url, definition, receipt_sha256)
            if chart["snapshot_id"] != spec.snapshot_id:
                raise ValueError("Method charts differ from the selected frozen source snapshot.")
            if chart["status"] != "complete":
                raise ValueError(
                    "A selected method chart is incomplete; its dependency state is retained."
                )
            charts.append(chart)
    omitted = []
    originals: dict[str, bytes] = {}
    acquired_sources = []
    private_uploads = []
    acquired_paths = {}
    private_permissions = set()
    private_digests = set()
    if spec.upload_ids:
        from .uploads import private_upload_for_receipt_hash

        if receipt_sha256 is None:
            raise ValueError(
                "Selected private-upload exports require their originating browser scope."
            )
        for identifier in spec.upload_ids:
            result, path = private_upload_for_receipt_hash(
                corpus.settings, str(identifier), receipt_sha256
            )
            if result["snapshot_id"] != spec.snapshot_id:
                raise ValueError("Private upload differs from the selected source snapshot.")
            record = {
                **result,
                "upload_id": str(identifier),
                "id": f"private-upload:{identifier}",
                "source_url": None,
                "accession": "private-upload",
                "rights_basis": "user_asserted_not_independently_verified",
            }
            private_uploads.append(record)
            private_digests.add(result["sha256"])
            sources.setdefault(result["sha256"], record)
            acquired_paths[result["sha256"]] = path
            if result.get("redistribution_allowed") is True:
                private_permissions.add(result["sha256"])

    if spec.source_job_ids:
        if receipt_sha256 is None:
            raise ValueError("Acquired-source exports require their originating browser scope.")
        from nova_ember.adapters.psi import resolver_url

        from .source_acquisition import acquired_source_for_receipt_hash

        for identifier in spec.source_job_ids:
            result, path = acquired_source_for_receipt_hash(
                corpus.settings, str(identifier), receipt_sha256
            )
            if result["snapshot_id"] != spec.snapshot_id:
                raise ValueError("Acquired export inputs differ from the selected source snapshot.")
            source = result["source"]
            record = {
                **source,
                "sha256": result["sha256"],
                "byte_size": result["byte_size"],
                "source_job_id": str(identifier),
                "id": f"{source['accession']}:v{source['file_version']}:{source['file_name']}",
                "source_url": resolver_url(
                    source["accession"], source["file_name"], source["file_version"]
                ),
            }
            acquired_sources.append(record)
            sources.setdefault(result["sha256"], record)
            acquired_paths[result["sha256"]] = path
    for digest, asset in sources.items():
        bytes_permitted = (
            digest in private_permissions
            if digest in private_digests
            else asset.get("license") == "CC0-1.0"
        )
        if (
            spec.include_original_bytes
            and bytes_permitted
            and sum(len(value) for value in originals.values()) + asset["byte_size"]
            <= 12 * 1024 * 1024
        ):
            content = (
                acquired_paths[digest].read_bytes()
                if digest in acquired_paths
                else corpus.asset_bytes(asset)
            )
            if len(content) != asset["byte_size"] or sha256(content).hexdigest() != digest:
                raise ValueError("An acquired export source fails its frozen checksum or size.")
            originals[digest] = content
        else:
            omitted.append(
                {
                    "sha256": digest,
                    "reason": "not_selected"
                    if not spec.include_original_bytes
                    else "private_upload_export_permission_not_granted"
                    if digest in private_digests and not bytes_permitted
                    else "redistribution_rights_unresolved"
                    if not bytes_permitted
                    else "original_bytes_over_export_profile",
                    "source_url": asset["source_url"],
                }
            )
    manifest = {
        "schema_version": 1,
        "snapshot_id": spec.snapshot_id,
        "case_id": spec.case_id,
        "revision": spec.revision,
        "question": spec.question,
        "assumptions": spec.assumptions,
        "limitations": spec.limitations,
        "applicability": spec.applicability,
        "sources": sources,
        "acquired_sources": acquired_sources,
        "selected_private_uploads": private_uploads,
        "method_charts": [chart.model_dump(mode="json") for chart in spec.method_charts],
        "method_chart_provenance": [
            chart["provenance"] for chart in charts if "provenance" in chart
        ],
        "queries": [query.model_dump() for query in spec.queries],
        "charts": [chart.model_dump() for chart in spec.charts],
        "artifacts": [item.model_dump(mode="json") for item in spec.artifacts],
        "originals_omitted": omitted,
        "personal_notes_origin": "researcher_supplied",
        "scientific_status": "frozen_export_not_independent_validation",
        "independent_run_count": None,
    }
    report = [
        f"# {spec.question}",
        "",
        f"Case {spec.case_id}, revision {spec.revision}",
        f"Corpus snapshot: {spec.snapshot_id}",
        "",
        "## Personal notes",
        "",
        spec.notes,
        "",
        "## Assumptions",
        "",
        *[f"- {item}" for item in spec.assumptions],
        "",
        "## Applicability",
        "",
        json.dumps(spec.applicability, ensure_ascii=False),
        "",
        "## Limitations",
        "",
        *[f"- {item}" for item in spec.limitations],
        "",
        "## Frozen research artifacts",
        "",
        *[
            f"- {item.artifact_id}: {item.kind}; origin {item.scientific_origin}; "
            "the original payload, provenance and limitations are retained in manifest.json."
            for item in spec.artifacts
        ],
        "",
        "## Sources",
        "",
        *[
            f"- {item['id']}: {item.get('doi') or item['source_url']}; "
            f"SHA-256 {digest}; license {item.get('license') or 'unresolved'}"
            for digest, item in sources.items()
        ],
    ]
    provenance = {
        "snapshot_id": spec.snapshot_id,
        "case_id": spec.case_id,
        "revision": spec.revision,
        "source_sha256": sorted(sources),
        "limitations": spec.limitations,
        "applicability": spec.applicability,
    }
    if spec.format in {"csv", "parquet"}:
        if len(data) != 1:
            raise ValueError("A standalone table export requires exactly one selected query.")
        if spec.format == "csv":
            return csv_bytes(data[0]), "text/csv; charset=utf-8", "selection.csv", provenance
        return (
            parquet_bytes(data[0]),
            "application/vnd.apache.parquet",
            "selection.parquet",
            provenance,
        )
    if spec.format in {"svg", "png", "pdf"}:
        if len(charts) != 1:
            raise ValueError("A standalone vector figure requires exactly one chart.")
        return (
            figure_bytes(charts[0], spec.format),
            {"svg": "image/svg+xml", "png": "image/png", "pdf": "application/pdf"}[spec.format],
            f"figure.{spec.format}",
            provenance,
        )
    if spec.format == "report":
        return (
            "\n".join(report).encode(),
            "text/markdown; charset=utf-8",
            "research-report.md",
            provenance,
        )
    if spec.format == "json":
        return (
            canonical_json(
                {"manifest": manifest, "data": data, "charts": charts, "notes": spec.notes}
            ),
            "application/json",
            "research-case.json",
            provenance,
        )
    notebook: dict[str, Any] = {
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}
        },
        "cells": [
            {"cell_type": "markdown", "metadata": {}, "source": "\n".join(report)},
            {
                "cell_type": "code",
                "metadata": {},
                "execution_count": None,
                "outputs": [],
                "source": REPRODUCE,
            },
        ],
    }
    if spec.format == "notebook":
        notebook["cells"][1]["source"] = (
            "import json\n"
            + "frozen = json.loads("
            + repr(canonical_json({"manifest": manifest, "data": data}).decode())
            + ")\n"
            + "# Frozen exported values; use the complete bundle for source reruns.\n"
            + "for table in frozen['data']:\n"
            + "    print(table['asset']['id'], table['returned_source_records'])\n"
            + "    print(table['values'][:5])\n"
        )
        return (
            canonical_json(notebook),
            "application/x-ipynb+json",
            "research-case.ipynb",
            provenance,
        )
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        files = {
            "manifest.json": canonical_json(manifest),
            "report.md": "\n".join(report).encode(),
            "reproduce.py": REPRODUCE.encode(),
            "research-case.ipynb": canonical_json(notebook),
            "README.md": (
                b"# Reproduce the frozen selection\n\n"
                b"Run `uv run --project environment --frozen --no-dev python reproduce.py` "
                b"from this directory. The lockfile requires Python 3.13. "
                b"CHECKSUMS.json records every included file.\n\n"
                b"Original source bytes appear in inputs/ only when selected and licensed. "
                b"If originals are omitted, obtain the exact versions using manifest.json "
                b"acquisition references and verify their SHA-256 hashes before rerunning. "
                b"The data/ files retain exported results independently of source availability.\n"
            ),
        }
        for index, table in enumerate(data, 1):
            files[f"data/query-{index}.json"] = canonical_json(table)
            files[f"data/query-{index}.csv"] = csv_bytes(table)
            files[f"data/query-{index}.parquet"] = parquet_bytes(table)
        for index, chart in enumerate(charts, 1):
            files[f"figures/chart-{index}.json"] = canonical_json(chart)
            if chart["status"] == "complete":
                files[f"figures/chart-{index}.svg"] = svg_bytes(chart)
                files[f"figures/chart-{index}.pdf"] = figure_bytes(chart, "pdf")
                files[f"figures/chart-{index}.png"] = figure_bytes(chart, "png")
            else:
                files[f"figures/chart-{index}-unavailable.json"] = canonical_json(
                    {
                        "status": chart["status"],
                        "reason": (
                            "No eligible coordinates; exact selection and missingness "
                            "remain in chart JSON and values."
                        ),
                    }
                )
            files[f"figures/chart-{index}-values.csv"] = csv_bytes(chart["data"])
        for digest, content in originals.items():
            files[f"inputs/{digest}"] = content
        for artifact in spec.artifacts:
            files[f"artifacts/{artifact.artifact_id}.json"] = canonical_json(
                artifact.model_dump(mode="json")
            )
        project = Path(__file__).resolve().parents[5]
        for name in ["pyproject.toml", "uv.lock"]:
            files[f"environment/{name}"] = (project / name).read_bytes()
        # Include the exact implementation so scientific rules have one source.
        for base in [
            project / "packages/domain/src",
            project / "packages/data-adapters/src",
            project / "services/api/src",
        ]:
            for path in base.rglob("*.py"):
                files["runtime/" + path.relative_to(base).as_posix()] = path.read_bytes()
        files["CHECKSUMS.json"] = canonical_json(
            {name: sha256(content).hexdigest() for name, content in sorted(files.items())}
        )
        for name, content in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o600 << 16
            archive.writestr(info, content)
    bundle = output.getvalue()
    if len(bundle) > 16 * 1024 * 1024:
        raise ValueError("Selected export exceeds the sixteen MiB bundle limit.")
    return bundle, "application/zip", "research-case.zip", provenance
