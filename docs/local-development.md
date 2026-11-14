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

Setup installs the locked Python and web dependencies. If uv is unavailable,
it installs version 0.13.8 into the ignored project `.data/tools` directory.
Python caches and managed interpreters stay under `.data` unless the
environment already specifies their locations. The pnpm content cache uses
the system temporary directory; installed dependencies stay in `node_modules`.

Development starts PostgreSQL, applies checksum-checked SQL migrations,
verifies and imports the checked-in source snapshot, and supervises the API,
trusted export worker and web app. Open `http://127.0.0.1:3100`. The web app
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

OpenAI setup and hosting remain separate later milestones requiring the
owner's decision. No provider key is needed for local source browsing,
registered calculations, personal saving or exports. Interactive user code
requires the planned gVisor environment and is unavailable until that boundary
is implemented and verified. The trusted worker accepts only defined export
jobs; it does not execute arbitrary Python or shell.
