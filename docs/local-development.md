# Local development

## Requirements and setup

Use Node.js 24, pnpm 11.20.0, Python 3 with pip, and a running Docker engine
with Compose. The Python application uses Python 3.13; setup obtains that
interpreter through uv when needed, without changing the system Python.

From the repository root:

```sh
pnpm run setup
pnpm dev
```

Setup installs the locked Python and web dependencies and prepares the local
gVisor scientific environment with the existing Docker engine. If host qualification
fails, setup reports that failure and keeps browsing and trusted calculations
available; interactive execution stays unavailable until preparation succeeds.
If uv is unavailable,
it installs version 0.13.8 into the ignored project `.data/tools` directory.
Python caches and managed interpreters stay under `.data` unless the
environment already specifies their locations. The pnpm content cache uses
the system temporary directory; installed dependencies stay in `node_modules`.

Development starts PostgreSQL, applies checksum-checked SQL migrations,
verifies and imports the checked-in source snapshot, and supervises the API,
scientific worker and web app. The worker handles research, registered calculations,
media, acquisition and exports; source refresh and transfer use bounded threads in
that same process. Open `http://127.0.0.1:3100`. The web app
proxies `/v1/` to the loopback API at port 8100. PostgreSQL binds only to
`127.0.0.1:55432`. The Compose file contains a local fixture password, not a
credential suitable for public deployment.

Stop the foreground application with Ctrl+C. PostgreSQL retains scientific
records and remains available for the next launch. To stop it as well:

```sh
docker compose -f infra/compose.yaml stop
```

The database lives in `.data/postgres`; retained scientific object copies live
in `.data/objects`. Original licensed fixtures live separately in
`tests/fixtures/nasa-psi`. Do not delete `.data` to restart the application.
Docker may assign ownership of the PostgreSQL directory to its database user;
do not recursively change that directory's ownership.

## Verification

```sh
pnpm test
pnpm lint
pnpm format:check
pnpm typecheck
pnpm python:typecheck
pnpm contracts:check
pnpm web:format:check
pnpm build
```

Database integration tests use a separate database. Create it once while the
local database service is running, then explicitly enable those tests:

```sh
docker compose -f infra/compose.yaml exec -T database createdb -U nova nova_ember_test
NOVA_TEST_DATABASE_URL=postgresql://nova:nova-local@127.0.0.1:55432/nova_ember_test pnpm test
```

The tests must not be pointed at the application database. A second `createdb`
reports that the test database already exists; retain it and run the tests.

With the local stack running, the browser suite uses a separate browser
context for each test and verifies save/export/import without real user data.
Install Playwright's Chromium once, or select an installed Chrome browser:

```sh
pnpm exec playwright install chromium
pnpm test:browser
# Alternatively, use an existing Chrome installation:
NOVA_BROWSER_CHANNEL=chrome pnpm test:browser
```

## Current integration boundary

NASA source retrieval uses the public repository interfaces recorded in the
master brief. They are observed website services, not a guaranteed versioned
public API. The committed source snapshot supports reproducible local work
without requesting NASA on every application launch.

The current implementation strategy completes the backend, including secure
OpenAI key setup and inference integration, before completing the frontend.
Final integrated testing and conditional hosting follow both deliveries;
host eligibility, terms, capacity and the owner's decision remain unresolved.
The scoped OpenAI key is securely configured in the ignored `.env.local`, with
backend loading, both reasoning models, embeddings and a synthetic voice session
verified locally. The startup command does not create credentials or provision
hosting. No provider key is needed for local source browsing, registered
calculations, personal saving, exports or local Python/shell execution.

Interactive user code runs through the qualified gVisor guest on the existing
CPU host. It has no network, project tree or provider credentials. The trusted
worker dispatches only typed operations; submitted Python/shell never runs in the
host shell or API process. See [execution](execution.md) for the actual qualified
profile, preparation command, interruption behavior and host limitations.
Changing the lockfile or runner requires preparing and qualifying that environment
again. A future host must pass its own qualification; local success does not
establish hosting eligibility or capacity.

Model capability responses report configuration without making paid health-check
requests. Reasoning uses GPT-6.1 Sol or Terra according to complexity. Semantic
indexing and queries use the same OpenAI connection; they cost money when a new
embedding is needed. Voice and reasoning usage also cost money. Cost reservations
are conservative estimates, separate from the provider's invoice. Local
scientific tests do not call OpenAI unless explicitly run as a live check.

`pnpm contracts` rebuilds the checked-in OpenAPI schema and TypeScript contracts
from the backend without starting services or making model requests. The JSON
client in `packages/contracts/client.ts` carries the same-origin receipt cookie;
binary downloads and event streams use their dedicated browser interfaces.
