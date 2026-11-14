# Nova Ember

**Combustion research, made clear.**

Nova Ember helps people explore NASA combustion research for fire-safety questions. Find an investigation, understand what it examines, compare its experimental conditions, inspect the original evidence and work with source-bound data. A research assistant connects explanations and scientific tools to sources; saved conversations, analyses and optional notes support returning to research.

It is team **StrawHat Pirates**' project for the **2026 NASA Space Apps Challenge**, addressing [Flame in Freefall](https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/).

## Run the application

Use Node.js 24, pnpm 11.20.0, the project's Python environment and Docker with Compose:

```sh
pnpm run setup
pnpm dev
```

Open `http://127.0.0.1:3100`. See [local development](docs/local-development.md) for requirements, setup behavior and verification commands. NASA evidence browsing, registered calculations, saving and exports can be used without paid model credentials. Live assistance and voice need the configured backend model service. Python/shell execution requires the qualified isolated runtime described in [execution](docs/execution.md).

## Product and scientific scope

The [current brief](MASTER_BRIEF.md) organizes the product around research tasks, with automatic continuity and no user-facing workspace setup. The [implementation and acceptance plan](IMPLEMENTATION_PLAN.md) records essential workflows, proportionate verification, the reassessed historical backlog and the remaining release evidence. The former documents are preserved in the [planning archive](docs/archive/README.md).

Original source values, units and locations stay attached to interpreted data and derived results. Comparison preserves condition differences. Descriptive fits are separate from validated prediction; safety-control and Earth-transfer research do not establish operational suitability. See [scientific methods](docs/methods.md), [data dictionary](docs/data-dictionary.md), [source inventory](docs/data-sources.md) and the [bounded science review](docs/science-validation-2026-11-15.md).

The [redesign report](docs/product-redesign-2026-11-15.md) records the connected research journeys, rendered checks, a bounded live assistant result and remaining limits. The [earlier full local verification report](docs/full-product-verification-2026-11-15.md) remains evidence for the **pre-redesign** version. Hosted acceptance, actual device/voice behavior, broader scientific evaluation and source-specific gaps need their own evidence; the plan keeps those states distinct.

## Project references

- [Product brief](MASTER_BRIEF.md) and [implementation/acceptance plan](IMPLEMENTATION_PLAN.md)
- [Demonstration and submission preparation](docs/submission-guide-2026-11-15.md) and [complexity reassessment](docs/complexity-reassessment-2026-11-15.md)
- [Challenge overview](challenge.md) and [engineering instructions](AGENTS.md)
- [Backend report](docs/backend-2026-11-14.md), [frontend report](docs/frontend-2026-11-14.md) and [first-build report](docs/local-build-2026-11-14.md), preserved as dated implementation history
- [Optional descriptive droplet models](docs/source-parameterized-models-2026-11-14.md), [research-role configuration](docs/custom-agents.md) and [voice integration](docs/voice.md)

The repository's original code uses Apache-2.0. Data, publications, media and dependencies retain their own rights and required notices.
