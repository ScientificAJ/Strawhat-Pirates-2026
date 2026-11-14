FROM ghcr.io/astral-sh/uv:0.13.8@sha256:5cc1805e2426484abca4ad46ea783bab281fdb225fd82d8ce6d66a81254bac85 AS uv
FROM python:3.13.18-slim@sha256:e48f59cdba69a3cbd9ed2cf0f348d90d45a8d350d98134cf1070bc106ee9ed90
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /opt/environment
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project --link-mode=copy && mkdir /inputs /outputs /work
ENV PATH="/opt/environment/.venv/bin:/usr/local/bin:/usr/bin:/bin" HOME="/work" PYTHONNOUSERSITE="1" MPLBACKEND="Agg"
COPY sandboxes/python-analysis/runner.py /opt/runner.py
WORKDIR /work
USER 65534:65534
CMD ["python", "-I", "-c", "print('Scientific environment ready')"]
