# Nova Ember

**Understand fire. Beyond Earth.**

Nova Ember helps people explore NASA combustion research and follow the evidence behind questions about fire in space. Built by **StrawHat Pirates** for the 2026 NASA Space Apps Challenge, it responds to [Flame in Freefall](https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/): making decades of microgravity combustion findings easier to find, compare and interpret for human space exploration.

## The mission

On Earth, hot combustion gases rise and draw fresh air toward a flame. In microgravity, that buoyancy-driven flow is greatly reduced, so ventilation and diffusion play different roles in how a flame grows, spreads and goes out. Understanding those differences matters when considering fire safety in spacecraft and future habitats.

NASA's investigations span different fuels, atmospheres, apparatus and scales. Their findings are valuable, but navigating individual studies and publications takes time, and results cannot always be compared directly. Nova Ember brings selected research into a connected workflow: start with a question, find relevant evidence, examine the conditions and work with the underlying data.

## Explore the research

- **Ask a question.** The research assistant connects explanations to inspectable sources and scientific tools. For example: “Which NASA investigations could help me understand how ventilation affects flame spread in solid materials?”
- **Discover investigations.** Browse studies, learn what each examines and follow links to original NASA records and publications.
- **Compare and rank evidence.** Examine study objectives and experimental conditions side by side, and use explicit criteria to assess relevant investigations. Differences in fuel, gravity, atmosphere and apparatus remain important to interpretation.
- **Work with data.** Inspect source tables and units, select data to chart or export, and use registered calculations or supported calibrated descriptive fits for further analysis.
- **Continue your research.** Return to questions and analyses saved in your browser, with portable backup for your research; optional research profiles and voice provide additional ways to work with the assistant.

## How it works

Nova Ember combines a curated NASA research collection with a web application, scientific tools and a source-linked assistant. The application imports a checked-in source snapshot into PostgreSQL. A Python API and worker handle research, calculations and exports, while the web interface brings investigations, comparisons and analysis together. Model-backed assistance uses the available evidence to help navigate and explain it; readers can follow citations to check the supporting material.

The catalog currently covers **35 investigations and one SoFIE program entry**. It brings together all 24 investigations in the NASA Physical Sciences Informatics (PSI) Combustion Science category with Saffire IV–VI, five SoFIE studies, FLARE, FM2 and LUCI. The collection includes selected source captures and 14 curated publication tables. Catalog entries do not imply that every original file or raw dataset has been acquired, and this collection is not a mirror of NASA's full archive.

Scientific context stays close to the evidence: source locations and units accompany data, and experimental conditions remain visible in comparisons. Source-reported values, calculations and model interpretations are identified separately. Learn more about the methods in the [data dictionary](docs/data-dictionary.md) and [scientific methods](docs/methods.md).

## Run locally

You will need Node.js 24, pnpm 11.20.0, Python 3 with pip, and Docker with Compose. From the repository root:

```sh
pnpm run setup
pnpm dev
```

Open [http://127.0.0.1:3100](http://127.0.0.1:3100). Setup installs the project's locked dependencies and attempts to prepare the local scientific execution environment. Source browsing, registered calculations, saving and exports do not require paid model credentials; live assistant and voice features require a configured backend model service. See [local development](docs/local-development.md) for setup details, configuration and verification commands, and [execution](docs/execution.md) for the isolated Python and shell runtime.

## Built with

The interface uses **Next.js, React and TypeScript**. A **Python/FastAPI** backend, **PostgreSQL**, and a scientific worker support the research collection and calculations; personal research is saved in the browser. The [product brief](MASTER_BRIEF.md) and [implementation and acceptance plan](IMPLEMENTATION_PLAN.md) describe the design and remaining verification.

## Sources and licenses

Nova Ember builds on NASA's public research and the challenge resources:

- [Flame in Freefall challenge](https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/) — the problem and challenge objectives.
- [NASA PSI combustion research](https://psi.nasa.gov/physci/repo/search?q=combustion) — investigation records and available data.
- [NASA: Studying Combustion and Fire Safety](https://www.nasa.gov/missions/station/iss-research/studying-combustion-and-fire-safety/) — background on combustion research in space.
- [NASA research collection](data/nasa-research/README.md) and [source inventory](docs/data-sources.md) — retained sources, identifiers, table provenance, coverage and rights notes. The application links individual evidence to its original record or publication.

The repository's original code is licensed under [Apache-2.0](LICENSE). NASA data, publications, media and third-party dependencies retain their own applicable rights and notices. The [source inventory](docs/data-sources.md) records source-specific rights and citations. The [NASA Space Apps participant terms](https://www.spaceappschallenge.org/legal/) require citations for sources used and applicable third-party license documentation.
