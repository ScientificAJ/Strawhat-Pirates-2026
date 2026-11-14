# Nova Ember

**Combustion research, made clear.**

Nova Ember is team **StrawHat Pirates**' project for the **2026 NASA Space Apps Challenge**, addressing [Flame in Freefall](https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/).

The planned application connects NASA combustion evidence with investigation discovery, condition-aware comparisons, reproducible analysis, and source-linked research cases to support fire-safety research for human space exploration.

Researchers can run Python and shell in the qualified local gVisor environment without a separate execution service. Registered flame-front and droplet fits use the same host through a distinct bounded scientific worker. Prediction for a new run requires separate validation against independent experiments.

The [backend report](docs/backend-2026-11-14.md) records scientific methods, source/evidence retrieval, private workflows, exports, local execution and live OpenAI checks. The full application remains in progress: complete frontend integration follows the backend, then final integrated testing and conditional hosting. No hosting resource has been provisioned.

Run `pnpm run setup` and `pnpm dev`, then open `http://127.0.0.1:3100`. See [local development](docs/local-development.md) for requirements and checks, and the [first build report](docs/local-build-2026-11-14.md) for verified behavior and remaining work.

- [Master brief](MASTER_BRIEF.md): product scope, scientific contracts, architecture, interface requirements, and empirical data audit.
- [Implementation plan](IMPLEMENTATION_PLAN.md): complete backend, complete frontend, then final testing and conditional hosting; stable requirement references and completion evidence.
- [Challenge overview](challenge.md): the official challenge title, description, and source.
- [Engineering instructions](AGENTS.md): coding, verification, and Git delivery practices.
