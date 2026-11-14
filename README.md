# Nova Ember

**Combustion research, made clear.**

Nova Ember is team **StrawHat Pirates**' project for the **2026 NASA Space Apps Challenge**, addressing [Flame in Freefall](https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/).

The planned application connects NASA combustion evidence with investigation discovery, condition-aware comparisons, reproducible analysis, and source-linked research cases to support fire-safety research for human space exploration.

Researchers will be able to run Python and shell on the app’s own Linux host without a separate execution service. The modeling workbench will use the same host to fit measured flame-front and droplet traces. Prediction for a new run requires separate validation against independent experiments.

The first local build supports NASA investigation discovery, original table inspection, a reproducible FLEX analysis, oxygen partial-pressure calculations, conservative comparisons and browser-local research cases. The full scientific application remains in progress; live AI and hosting have not been configured.

Run `pnpm run setup` and `pnpm dev`, then open `http://127.0.0.1:3100`. See [local development](docs/local-development.md) for requirements and checks, and the [first build report](docs/local-build-2026-11-14.md) for verified behavior and remaining work.

- [Master brief](MASTER_BRIEF.md): product scope, scientific contracts, architecture, interface requirements, and empirical data audit.
- [Implementation plan](IMPLEMENTATION_PLAN.md): dependency-ordered work packages and completion evidence.
- [Challenge overview](challenge.md): the official challenge title, description, and source.
- [Engineering instructions](AGENTS.md): coding, verification, and Git delivery practices.
