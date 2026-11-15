# Third-party software inventory — 15 November 2026

This is a bounded inventory of declared package-license metadata for the checked-in dependency locks and local installed packages. It is not a legal review, a complete notice bundle, a vulnerability review, or confirmation of redistribution rights. The lockfiles contain conditional and platform-specific packages; presence here does not prove a package is deployed. Conversely, operating-system libraries, bundled native components and build artifacts require separate review. Recreate this inventory for the actual release and its target platform.

## Method and scope

- Python names and versions come from `uv.lock`; declared licenses come from the installed `.venv` distribution metadata for the same version. `License-Expression` takes precedence, then a short legacy `License` field, then license classifiers. Long legacy fields are identified as such and require reading the installed distribution’s original metadata and license files. Missing or nonmatching installations use exact-version registry metadata when available, identified in the table.
- JavaScript names and versions come from the `packages` entries in `pnpm-lock.yaml`; declared licenses are taken from matching locally installed package `package.json` files. Missing platform-specific packages use exact-version registry metadata when available. Where installed copies disagree, both values are recorded.
- Direct runtime and development labels follow `pyproject.toml` and the lockfile importers. Other labels are conservative dependency-graph reachability, including optional dependencies and peer variants without evaluating platform markers; a package reachable by both trees appears in both. Reachability is not proof of inclusion in a release artifact.
- For packages missing from the local installation, exact-version registry metadata was retrieved from PyPI or npm on 15 November 2026 where available. Those entries are explicitly marked “Registry metadata”; the distributed package contents were not inspected.
- License labels are unverified upstream declarations, not proof that a specific notice or obligation has been satisfied. Preserve the actual license texts and required notices for distributed binaries and source; inspect bundled native libraries and dependencies independently.

## Python packages

| Package | Locked version | Role | Installed declared license |
| --- | --- | --- | --- |
| annotated-doc | 0.0.6 | runtime tree | MIT |
| annotated-types | 0.8.0 | runtime tree | MIT |
| anyio | 4.16.0 | runtime tree | MIT |
| attrs | 26.1.0 | runtime tree | MIT |
| certifi | 2026.10.23 | runtime tree | MPL-2.0 |
| cffi | 2.1.1 | runtime tree | MIT-0 |
| charset-normalizer | 3.5.2 | runtime tree | MIT |
| click | 8.5.1 | runtime tree | BSD-3-Clause |
| colorama | 0.4.6 | development tree | Registry metadata: Classifier: BSD License |
| contourpy | 1.4.0 | runtime tree | BSD-3-Clause |
| cryptography | 50.0.2 | runtime tree | Apache-2.0 OR BSD-3-Clause |
| cycler | 0.12.1 | runtime tree | Long legacy license text in installed metadata (classifier: BSD License) |
| duckdb | 1.5.6 | direct runtime | Classifier: MIT License |
| fastapi | 0.162.7 | direct runtime | MIT |
| flexcache | 0.3 | runtime tree | BSD |
| flexparser | 0.4 | runtime tree | BSD-3-Clause |
| fonttools | 4.68.0 | runtime tree | MIT |
| griffelib | 2.4.1 | runtime tree | ISC |
| h11 | 0.16.0 | runtime tree | MIT |
| httpcore | 1.0.9 | runtime tree | BSD-3-Clause |
| httpcore2 | 2.16.0 | runtime tree | BSD-3-Clause |
| httpx | 0.28.1 | direct runtime | BSD-3-Clause |
| httpx2 | 2.16.0 | runtime tree | BSD-3-Clause |
| httpx2-jsfetch | 1.0 | runtime tree | Registry metadata: BSD-3-Clause |
| idna | 3.20 | runtime tree | BSD-3-Clause |
| iniconfig | 2.3.1 | development tree | MIT |
| jiter | 0.19.0 | runtime tree | MIT |
| jsonschema | 4.26.0 | runtime tree | MIT |
| jsonschema-specifications | 2025.9.1 | runtime tree | MIT |
| kiwisolver | 1.5.1 | runtime tree | Long legacy license text in installed metadata (classifier: BSD License) |
| librt | 0.16.0 | development tree | MIT |
| matplotlib | 3.11.2 | direct runtime | Long legacy license text in installed metadata (classifier: Python Software Foundation License) |
| mcp | 2.3.0 | runtime tree | MIT |
| mcp-types | 2.3.0 | runtime tree | MIT |
| mypy | 1.20.2 | direct development | MIT |
| mypy-extensions | 1.2.0 | development tree | MIT |
| numpy | 2.5.4 | direct runtime | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 |
| openai | 3.51.0 | direct runtime | Apache-2.0 |
| openai-agents | 0.24.0 | direct runtime | MIT |
| opentelemetry-api | 1.45.2 | runtime tree | Apache-2.0 |
| packaging | 26.3 | runtime tree / development tree | Apache-2.0 OR BSD-2-Clause |
| pathspec | 1.1.1 | development tree | Classifier: Mozilla Public License 2.0 (MPL 2.0) |
| pillow | 13.0.0 | direct runtime | MIT-CMU |
| pint | 0.26.2 | direct runtime | BSD-3-Clause |
| platformdirs | 4.14.5 | runtime tree | MIT |
| pluggy | 1.7.0 | development tree | MIT |
| polars | 1.44.2 | direct runtime | Long legacy license text in installed metadata (classifier: MIT License) |
| polars-runtime-32 | 1.44.2 | runtime tree | MIT |
| psycopg | 3.3.9 | direct runtime | LGPL-3.0-only |
| psycopg-binary | 3.3.9 | runtime tree | LGPL-3.0-only |
| pyarrow | 23.0.1 | direct runtime | Apache-2.0 |
| pycparser | 3.12 | runtime tree | BSD-3-Clause |
| pydantic | 2.14.3 | direct runtime | MIT |
| pydantic-core | 2.50.4 | runtime tree | MIT |
| pygments | 2.21.0 | development tree | BSD-2-Clause |
| pyjwt | 2.15.1 | runtime tree | MIT |
| pyparsing | 3.3.3 | runtime tree | MIT |
| pypdf | 7.1.0 | direct runtime | BSD-3-Clause |
| pytest | 9.2.0 | direct development | MIT |
| python-dateutil | 4.0.0 | runtime tree | BSD-3-Clause |
| python-multipart | 0.0.33 | runtime tree | Apache-2.0 |
| pywin32 | 312 | runtime tree | Registry metadata: PSF |
| referencing | 0.37.0 | runtime tree | MIT |
| requests | 2.34.2 | runtime tree | Apache-2.0 |
| rpds-py | 2026.9.1 | runtime tree | MIT |
| ruff | 0.17.5 | direct development | MIT |
| scipy | 1.18.1 | direct runtime | Long legacy license text in installed metadata (classifier: BSD License) |
| sniffio | 1.3.1 | runtime tree | MIT OR Apache-2.0 |
| sse-starlette | 3.7.0 | runtime tree | BSD-3-Clause |
| starlette | 1.10.0 | runtime tree | BSD-3-Clause |
| truststore | 0.10.5 | runtime tree | MIT |
| typing-extensions | 4.16.0 | runtime tree / development tree | PSF-2.0 |
| typing-inspection | 0.4.5 | runtime tree | MIT |
| tzdata | 2026.6 | runtime tree | Apache-2.0 |
| urllib3 | 2.8.0 | runtime tree | MIT |
| uvicorn | 0.54.0 | direct runtime | BSD-3-Clause |
| websockets | 16.1.1 | runtime tree | BSD-3-Clause |
| xlrd | 2.0.2 | direct runtime | BSD |

## JavaScript packages

| Package | Locked version | Role | Installed declared license |
| --- | --- | --- | --- |
| @babel/code-frame | 7.29.7 | development tree | MIT |
| @babel/helper-validator-identifier | 7.29.7 | development tree | MIT |
| @dimforge/rapier3d-compat | 0.12.0 | development tree | Apache-2.0 |
| @emnapi/runtime | 1.11.3 | runtime tree | Registry metadata: MIT |
| @fontsource-variable/inter | 5.3.0 | direct runtime | OFL-1.1 |
| @fontsource/ibm-plex-mono | 5.3.0 | direct runtime | OFL-1.1 |
| @img/colour | 1.1.0 | runtime tree | MIT |
| @img/sharp-darwin-arm64 | 0.35.5 | runtime tree | Registry metadata: Apache-2.0 |
| @img/sharp-darwin-x64 | 0.35.5 | runtime tree | Registry metadata: Apache-2.0 |
| @img/sharp-freebsd-wasm32 | 0.35.5 | runtime tree | Registry metadata: Apache-2.0 |
| @img/sharp-libvips-darwin-arm64 | 1.3.4 | runtime tree | Registry metadata: LGPL-3.0-or-later |
| @img/sharp-libvips-darwin-x64 | 1.3.4 | runtime tree | Registry metadata: LGPL-3.0-or-later |
| @img/sharp-libvips-linux-arm64 | 1.3.4 | runtime tree | Registry metadata: LGPL-3.0-or-later |
| @img/sharp-libvips-linux-arm | 1.3.4 | runtime tree | Registry metadata: LGPL-3.0-or-later |
| @img/sharp-libvips-linux-ppc64 | 1.3.4 | runtime tree | Registry metadata: LGPL-3.0-or-later |
| @img/sharp-libvips-linux-riscv64 | 1.3.4 | runtime tree | Registry metadata: LGPL-3.0-or-later |
| @img/sharp-libvips-linux-s390x | 1.3.4 | runtime tree | Registry metadata: LGPL-3.0-or-later |
| @img/sharp-libvips-linux-x64 | 1.3.4 | runtime tree | LGPL-3.0-or-later |
| @img/sharp-libvips-linuxmusl-arm64 | 1.3.4 | runtime tree | Registry metadata: LGPL-3.0-or-later |
| @img/sharp-libvips-linuxmusl-x64 | 1.3.4 | runtime tree | Registry metadata: LGPL-3.0-or-later |
| @img/sharp-linux-arm64 | 0.35.5 | runtime tree | Registry metadata: Apache-2.0 |
| @img/sharp-linux-arm | 0.35.5 | runtime tree | Registry metadata: Apache-2.0 |
| @img/sharp-linux-ppc64 | 0.35.5 | runtime tree | Registry metadata: Apache-2.0 |
| @img/sharp-linux-riscv64 | 0.35.5 | runtime tree | Registry metadata: Apache-2.0 |
| @img/sharp-linux-s390x | 0.35.5 | runtime tree | Registry metadata: Apache-2.0 |
| @img/sharp-linux-x64 | 0.35.5 | runtime tree | Apache-2.0 |
| @img/sharp-linuxmusl-arm64 | 0.35.5 | runtime tree | Registry metadata: Apache-2.0 |
| @img/sharp-linuxmusl-x64 | 0.35.5 | runtime tree | Registry metadata: Apache-2.0 |
| @img/sharp-wasm32 | 0.35.5 | runtime tree | Registry metadata: Apache-2.0 AND LGPL-3.0-or-later AND MIT |
| @img/sharp-webcontainers-wasm32 | 0.35.5 | runtime tree | Registry metadata: Apache-2.0 |
| @img/sharp-win32-arm64 | 0.35.5 | runtime tree | Registry metadata: Apache-2.0 AND LGPL-3.0-or-later |
| @img/sharp-win32-ia32 | 0.35.5 | runtime tree | Registry metadata: Apache-2.0 AND LGPL-3.0-or-later |
| @img/sharp-win32-x64 | 0.35.5 | runtime tree | Registry metadata: Apache-2.0 AND LGPL-3.0-or-later |
| @next/env | 16.4.6 | runtime tree | MIT |
| @next/swc-darwin-arm64 | 16.4.6 | runtime tree | Registry metadata: MIT |
| @next/swc-darwin-x64 | 16.4.6 | runtime tree | Registry metadata: MIT |
| @next/swc-linux-arm64-gnu | 16.4.6 | runtime tree | Registry metadata: MIT |
| @next/swc-linux-arm64-musl | 16.4.6 | runtime tree | Registry metadata: MIT |
| @next/swc-linux-x64-gnu | 16.4.6 | runtime tree | MIT |
| @next/swc-linux-x64-musl | 16.4.6 | runtime tree | Registry metadata: MIT |
| @next/swc-win32-arm64-msvc | 16.4.6 | runtime tree | Registry metadata: MIT |
| @next/swc-win32-x64-msvc | 16.4.6 | runtime tree | Registry metadata: MIT |
| @playwright/test | 1.65.1 | direct development | Apache-2.0 |
| @redocly/ajv | 8.11.2 | development tree | MIT |
| @redocly/config | 0.22.0 | development tree | MIT |
| @redocly/openapi-core | 1.34.24 | development tree | MIT |
| @swc/helpers | 0.5.23 | runtime tree | Apache-2.0 |
| @tweenjs/tween.js | 23.1.3 | development tree | MIT |
| @types/estree | 1.0.10 | runtime tree | MIT |
| @types/geojson | 7946.0.16 | runtime tree | MIT |
| @types/node | 24.19.2 | direct development | MIT |
| @types/react-dom | 19.3.0 | direct development | MIT |
| @types/react | 19.3.0 | direct development | MIT |
| @types/stats.js | 0.17.4 | development tree | MIT |
| @types/three | 0.187.0 | direct development | MIT |
| @types/webxr | 0.5.24 | development tree | MIT |
| agent-base | 7.1.4 | development tree | MIT |
| ansi-colors | 4.1.3 | development tree | MIT |
| ansi-regex | 6.6.0 | runtime tree | MIT |
| ansi-styles | 6.2.3 | runtime tree | MIT |
| argparse | 2.0.1 | development tree | Python-2.0 |
| balanced-match | 1.0.2 | development tree | MIT |
| baseline-browser-mapping | 2.11.37 | runtime tree | Apache-2.0 |
| brace-expansion | 2.1.8 | development tree | MIT |
| caniuse-lite | 1.0.30001826 | runtime tree | CC-BY-4.0 |
| change-case | 5.4.4 | development tree | MIT |
| client-only | 0.0.1 | runtime tree | MIT |
| cliui | 9.0.1 | runtime tree | ISC |
| colorette | 1.4.0 | development tree | MIT |
| commander | 2.20.3 | runtime tree | MIT |
| commander | 7.2.0 | runtime tree | MIT |
| csstype | 3.2.3 | runtime tree / development tree | MIT |
| d3-array | 3.2.4 | runtime tree | ISC |
| d3-array | 3.2.5 | runtime tree | ISC |
| d3-color | 3.1.1 | runtime tree | ISC |
| d3-delaunay | 6.0.6 | runtime tree | ISC |
| d3-dispatch | 3.0.2 | runtime tree | ISC |
| d3-dsv | 3.0.2 | runtime tree | ISC |
| d3-ease | 3.0.2 | runtime tree | BSD-3-Clause |
| d3-force | 3.0.1 | runtime tree | ISC |
| d3-format | 3.1.3 | runtime tree | ISC |
| d3-geo-projection | 4.0.0 | runtime tree | ISC |
| d3-geo | 3.1.2 | runtime tree | ISC |
| d3-hierarchy | 3.1.3 | runtime tree | ISC |
| d3-interpolate | 3.0.2 | runtime tree | ISC |
| d3-path | 3.1.1 | runtime tree | ISC |
| d3-quadtree | 3.0.2 | runtime tree | ISC |
| d3-scale-chromatic | 3.1.1 | runtime tree | ISC |
| d3-scale | 4.0.3 | runtime tree | ISC |
| d3-shape | 3.2.1 | runtime tree | ISC |
| d3-time-format | 4.1.1 | runtime tree | ISC |
| d3-time | 3.1.1 | runtime tree | ISC |
| d3-timer | 3.0.2 | runtime tree | ISC |
| debug | 4.4.3 | development tree | MIT |
| delaunator | 5.1.0 | runtime tree | ISC |
| detect-libc | 2.1.2 | runtime tree | Apache-2.0 |
| emoji-regex | 10.6.0 | runtime tree | MIT |
| escalade | 3.2.0 | runtime tree | MIT |
| fast-deep-equal | 3.1.3 | development tree | MIT |
| fast-json-patch | 3.1.1 | runtime tree | MIT |
| fflate | 0.8.3 | development tree | MIT |
| get-caller-file | 2.0.5 | runtime tree | ISC |
| get-east-asian-width | 1.7.0 | runtime tree | MIT |
| https-proxy-agent | 7.0.6 | development tree | MIT |
| iconv-lite | 0.6.3 | runtime tree | MIT |
| index-to-position | 1.2.0 | development tree | MIT |
| internmap | 2.0.3 | runtime tree | ISC |
| js-levenshtein | 1.1.6 | development tree | MIT |
| js-tokens | 4.0.0 | development tree | MIT |
| js-yaml | 4.3.2 | development tree | MIT |
| json-schema-traverse | 1.0.0 | development tree | MIT |
| json-stringify-pretty-compact | 4.0.0 | runtime tree | MIT |
| lucide-react | 1.73.0 | direct runtime | ISC |
| meshoptimizer | 1.1.1 | development tree | MIT |
| minimatch | 5.1.9 | development tree | ISC |
| ms | 2.1.3 | development tree | MIT |
| nanoid | 3.3.20 | runtime tree | MIT |
| next | 16.4.6 | direct runtime | MIT |
| openapi-typescript | 7.13.0 | direct development | MIT |
| parse-json | 8.3.0 | development tree | MIT |
| picocolors | 1.1.1 | runtime tree / development tree | ISC |
| playwright-core | 1.65.1 | runtime tree / development tree | Apache-2.0 |
| playwright | 1.65.1 | runtime tree / development tree | Apache-2.0 |
| pluralize | 8.0.0 | development tree | MIT |
| postcss | 8.5.23 | runtime tree | MIT |
| prettier | 3.10.1 | direct development | MIT |
| react-dom | 19.3.1 | direct runtime | MIT |
| react | 19.3.1 | direct runtime | MIT |
| require-from-string | 2.0.2 | development tree | MIT |
| robust-predicates | 3.0.3 | runtime tree | Unlicense |
| rw | 1.3.3 | runtime tree | BSD-3-Clause |
| safer-buffer | 2.1.2 | runtime tree | MIT |
| scheduler | 0.28.0 | runtime tree | MIT |
| semver | 7.8.6 | runtime tree | ISC |
| sharp | 0.35.5 | runtime tree | Apache-2.0 |
| source-map-js | 1.2.2 | runtime tree | BSD-3-Clause |
| string-width | 7.2.0 | runtime tree | MIT |
| string-width | 8.3.0 | runtime tree | MIT |
| strip-ansi | 7.2.0 | runtime tree | MIT |
| styled-jsx | 5.1.6 | runtime tree | MIT |
| supports-color | 10.2.2 | development tree | MIT |
| three | 0.187.0 | direct runtime | MIT |
| topojson-client | 3.1.0 | runtime tree | ISC |
| tslib | 2.8.1 | runtime tree | 0BSD |
| tslib | 2.9.1 | runtime tree | 0BSD |
| type-fest | 4.41.0 | development tree | (MIT OR CC0-1.0) |
| typescript | 5.9.3 | direct development | Apache-2.0 |
| undici-types | 7.24.6 | runtime tree / development tree | MIT |
| uri-js-replace | 1.0.2 | development tree | MIT |
| vega-canvas | 2.0.0 | runtime tree | BSD-3-Clause |
| vega-crossfilter | 5.1.3 | runtime tree | BSD-3-Clause |
| vega-dataflow | 6.1.3 | runtime tree | BSD-3-Clause |
| vega-embed | 7.3.0 | direct runtime | BSD-3-Clause |
| vega-encode | 5.2.2 | runtime tree | BSD-3-Clause |
| vega-event-selector | 4.0.0 | runtime tree | BSD-3-Clause |
| vega-expression | 6.2.2 | runtime tree | BSD-3-Clause |
| vega-force | 5.1.3 | runtime tree | BSD-3-Clause |
| vega-format | 2.1.3 | runtime tree | BSD-3-Clause |
| vega-functions | 6.2.0 | runtime tree | BSD-3-Clause |
| vega-geo | 5.1.3 | runtime tree | BSD-3-Clause |
| vega-hierarchy | 5.1.3 | runtime tree | BSD-3-Clause |
| vega-interpreter | 2.3.2 | runtime tree | BSD-3-Clause |
| vega-label | 2.1.3 | runtime tree | BSD-3-Clause |
| vega-lite | 6.5.0 | direct runtime | BSD-3-Clause |
| vega-loader | 5.1.3 | runtime tree | BSD-3-Clause |
| vega-parser | 7.1.3 | runtime tree | BSD-3-Clause |
| vega-projection | 2.1.3 | runtime tree | BSD-3-Clause |
| vega-regression | 2.1.3 | runtime tree | BSD-3-Clause |
| vega-runtime | 7.1.3 | runtime tree | BSD-3-Clause |
| vega-scale | 8.1.3 | runtime tree | BSD-3-Clause |
| vega-scenegraph | 5.3.0 | runtime tree | BSD-3-Clause |
| vega-schema-url-parser | 3.0.2 | runtime tree | BSD-3-Clause |
| vega-selections | 6.1.5 | runtime tree | BSD-3-Clause |
| vega-statistics | 2.0.0 | runtime tree | BSD-3-Clause |
| vega-themes | 3.0.0 | runtime tree | BSD-3-Clause |
| vega-time | 3.3.0 | runtime tree | BSD-3-Clause |
| vega-tooltip | 1.1.0 | runtime tree | BSD-3-Clause |
| vega-transforms | 5.2.2 | runtime tree | BSD-3-Clause |
| vega-typings | 2.3.0 | runtime tree | BSD-3-Clause |
| vega-util | 2.1.3 | runtime tree | BSD-3-Clause |
| vega-view-transforms | 5.2.2 | runtime tree | BSD-3-Clause |
| vega-view | 6.2.0 | runtime tree | BSD-3-Clause |
| vega-voronoi | 5.1.3 | runtime tree | BSD-3-Clause |
| vega-wordcloud | 5.1.3 | runtime tree | BSD-3-Clause |
| vega | 6.4.0 | direct runtime | BSD-3-Clause |
| wrap-ansi | 9.0.2 | runtime tree | MIT |
| y18n | 5.0.8 | runtime tree | ISC |
| yaml-ast-parser | 0.0.43 | development tree | Apache-2.0 |
| yargs-parser | 21.1.1 | development tree | ISC |
| yargs-parser | 22.0.0 | runtime tree | ISC |
| yargs | 18.2.0 | runtime tree | MIT |

## Inspection of selected installed wheels

The following observations refer to the **local Linux Python 3.13 installation**, not necessarily the wheels in a future image or another platform. Paths below are relative to `.venv/lib/python3.13/site-packages/`, which is an ignored local environment. The original locked wheel URLs and checksums are in [uv.lock](../uv.lock); retrieve and inspect the actual selected wheel for the release. A package's top-level metadata is not a complete account of bundled libraries.

- **NumPy 2.5.4 and SciPy 1.18.1:** `numpy-2.5.4.dist-info/licenses/LICENSE.txt` and `scipy-1.18.1.dist-info/LICENSE.txt` identify bundled OpenBLAS (BSD-3-Clause), LAPACK (BSD-3-Clause-Open-MPI), the GCC runtime library (`GPL-3.0-or-later WITH GCC-exception-3.1`) and libquadmath (`LGPL-2.1-or-later`). Matching `libscipy_openblas`, `libgfortran` and `libquadmath` shared objects were observed in both `numpy.libs/` and `scipy.libs/`. NumPy also lists additional per-component files under `numpy-2.5.4.dist-info/licenses/`; SciPy contains separate Qhull, FFT and integration license files within `scipy/`. In particular, NumPy's top-level `License-Expression` alone does not enumerate the wheel's bundled GCC and libquadmath terms. For any binary distribution, retain the relevant copyright, license and disclaimer notices; review the GPL runtime exception and LGPL requirements for the actual linked libraries, including applicable source and relinking or replacement provisions, against how the artifact is distributed. This observation is not a determination that the surrounding application must use those licenses.
- **Psycopg 3.3.9 and psycopg-binary 3.3.9:** their installed metadata declares `LGPL-3.0-only`, with texts at `psycopg-3.3.9.dist-info/licenses/LICENSE.txt` and `psycopg_binary-3.3.9.dist-info/licenses/LICENSE.txt`. The local binary wheel also contains `psycopg_binary.libs/` with libpq, OpenSSL (`libssl` and `libcrypto`), Kerberos, LDAP, SASL and other shared libraries. The Psycopg license text alone does not establish those libraries' individual licenses or versions. Identify their exact upstream source, version, notices and license terms for the shipped wheel; assess LGPL notice, source and replacement/relinking requirements for the actual form of distribution. Do not infer these details from library filenames alone.
- **Matplotlib 3.11.2:** `matplotlib-3.11.2.dist-info/LICENSE` contains Matplotlib's terms and component notices. It identifies FreeType as `FTL OR GPL-2.0-or-later`, with the FreeType option requiring an explicit project acknowledgment; it also lists font, HarfBuzz, Qhull and other component terms. Additional font notices are present in `matplotlib/mpl-data/fonts/ttf/LICENSE_DEJAVU` and `LICENSE_STIX`. Preserve the notices applicable to the actual distributed components and review the appropriate FreeType license option and acknowledgment. Do not assume the font notices in the web application cover fonts inside this wheel.
- **Other long-form fields:** the local copies retain their own texts at `cycler-0.12.1.dist-info/LICENSE`, `kiwisolver-1.5.1.dist-info/licenses/LICENSE` and `polars-1.44.2.dist-info/licenses/LICENSE`. Polars' runtime is a separate installed distribution with its own `polars_runtime_32-1.44.2.dist-info/licenses/LICENSE`; native components and their notices still require review.

For the exact release artifact, retain the appropriate unmodified license texts and copyright notices with the distribution, identify each bundled component's corresponding source and applicable conditions, and document the chosen compliance route where a license provides alternatives. Confirm whether the image or binary is actually conveyed and which conditions apply to that form of use; a running service, a source repository and a distributed image are not interchangeable release facts. This list identifies review work and does not establish compliance.

## Other software and notices

- The local and production Compose files select `pgvector/pgvector:pg17` by digest. PostgreSQL, pgvector, the base image and included operating-system packages have separate licenses and notices; the complete image contents have not been inventoried here. See [local Compose](../infra/compose.yaml) and [production Compose](../infra/production/compose.yaml).
- The scientific execution image uses `python:3.13.18-slim` and `ghcr.io/astral-sh/uv:0.13.8` by digest and installs the frozen Python runtime dependencies. See [its Dockerfile](../sandboxes/python-analysis/Dockerfile). Python, uv, base OS packages and native libraries have distinct license terms; image contents have not been independently inventoried.
- The production Dockerfiles use `python:3.13-slim` and `node:24-slim`; the production proxy uses `caddy:2`. These are tags, so exact resolved versions and image components depend on the build/deployment. Review the actual image digests and included package notices at release. See [backend Dockerfile](../infra/production/Dockerfile.backend), [web Dockerfile](../infra/production/Dockerfile.web), and [production Compose](../infra/production/compose.yaml).
- Local isolated execution prepares gVisor `runsc` release `20261109.0`; upstream identifies gVisor as [Apache-2.0](https://github.com/google/gvisor/blob/master/LICENSE). Check the actual release and its included components and notices before redistribution. See [prepare.py](../sandboxes/python-analysis/prepare.py).
- The repository provides notices for [Inter](../apps/web/public/licenses/inter-OFL.txt), [IBM Plex Mono](../apps/web/public/licenses/ibm-plex-mono-OFL.txt), [Lucide](../apps/web/public/licenses/lucide-ISC.txt), and [Three.js](../apps/web/public/licenses/three-MIT.txt). These are not a complete notice inventory for the application.
- NASA research sources and data have separate rights and provenance; see [source inventory](data-sources.md) and [NASA research collection](../data/nasa-research/README.md). Video assets have a separate [credit record](../media/nova-ember-space-apps/credits.md).

## Outstanding review

- Verify registry-only declarations against the packages selected on the actual deployment platform. Inspect long-form license metadata and accompanying license files, including native libraries packaged in wheels and JavaScript distributions.
- Inventory the actual container images and build output, identify required third-party notices and source-offer obligations, and retain them with the appropriate distribution. This file is a starting point, not a substitute for that review.
- Recheck the lockfiles and notices after dependency changes and before submitting or distributing the project.
