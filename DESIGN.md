# Nova Ember interface

Implemented 15 November 2026. Product purpose is defined in [the brief](MASTER_BRIEF.md); observed checks and limits are recorded in [the redesign report](docs/product-redesign-2026-11-15.md).

## Direction

The interface puts a research question and its evidence before application management. People usually read and compare research at a desk in ordinary ambient light; light surfaces are the initial visual reference, with an equally functional dark theme following the device preference. The first viewport explains the purpose, offers a real question submission and shows an attributed NASA experiment image. It does not manufacture a dashboard from unrelated metrics.

A top navigation connects Investigations, Compare, Data & models, Research assistant and Your research. Phone navigation uses a native modal dialog with focus return. Administrative and specialist controls are secondary. Advanced options are disclosures near the task they support.

## Shared visual rules

- Inter carries headings, prose and interface controls. IBM Plex Mono is reserved for code, identifiers and numerical/source representations.
- Light canvas `#f5f7f8`, surface `#ffffff`, ink `#142c38`, secondary text `#4c626e`, action `#176273`, dividers `#d5dfe3`.
- Dark canvas `#101d25`, surface `#172a35`, ink `#edf4f5`, secondary text `#b9cbd2`, action `#87d5df`.
- Ember colors identify the existing brand and specific scientific series; they do not decorate unrelated controls. Scientific images retain their original appearance in both themes.
- Main headings use a fixed 2rem scale; the home introduction uses a larger fixed display size. Body prose has a readable measure and line height. Data tables use bounded internal scrolling and retain all source columns.
- Primary actions have at least 44px targets, clear disabled states and visible keyboard focus. Status uses text as well as color.
- Surfaces separate task groups; headings and whitespace carry hierarchy. Avoid nested cards and repeated warning blocks. Loading, empty and failure states explain the available next action.
- Motion communicates feedback. The existing wordmark animation remains short, interruptible and compatible with reduced motion; research screens do not orchestrate decorative entrances.

## Research interaction rules

A question submission means an assistant request. A draft, a submitted request, a completed answer and an incomplete request have distinct states. Refresh resumes accepted work rather than silently sending it again.

A citation leads to the recorded source location and relevant investigation. Source summaries, measurements, calculations, hypotheses and interpretations remain distinguishable. Source versions and hashes stay in the data, exports and optional details.

Comparison leads with the actual purpose and setup of the selected studies. Numerical pooling and ranking expose the conditions and evidence they require. Data exploration carries the exact source and applied query into preview, saved analysis and download.

Conversation history and useful recent research appear automatically. Bookmarks and optional notes support deliberate saving. Backup/restore explains browser storage and temporary-file limits when that information matters.

## Rendered references

The [assistant](docs/redesign-2026-11-15/assistant-desktop.png), [home](docs/redesign-2026-11-15/home-desktop.png), [investigations](docs/redesign-2026-11-15/investigations-desktop.png), [comparison](docs/redesign-2026-11-15/comparison-desktop.png), [data entry](docs/redesign-2026-11-15/data-models-desktop.png) and [phone home](docs/redesign-2026-11-15/home-mobile.png) are captures of the implementation, not concept art or user-study evidence.
