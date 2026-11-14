# Optional agents and research skills

The Agents workspace is separate from the standard Research Studio. A researcher
can use a preset, edit a browser-owned profile, attach reusable text skills, or
request a reviewable profile/skill draft. Selecting or drafting a profile does
not change the core agent or activate a background task.

Profiles contain a name, description, role instructions, skills and allowed
action groups. The server accepts at most eight skills, distinct skill names
and capability groups, and a combined 16,000-character instruction envelope.
Names are single-line; role instructions and skills can use multiple lines.
The inline profile is validated and frozen with each research request, rather
than resolved later from an editable local profile ID.

## Scientific and action boundaries

The core scientific system instructions remain the actual system policy.
Custom role and skill text is lower-priority user-selected guidance in the
research prompt. It cannot create scientific evidence, override numeric/source
checks, grant tools, bypass private-input consent or approve an operation.
Skills are text playbooks, not executable plugins or installed operating-system
skills.

The seven action groups are sources, analysis, visualization, modeling, code,
workspace proposals and export. The server filters the direct tool registry and
rechecks capability at invocation. The nested scientific catalog, schema and
dispatcher use the same policy. The generic calculation entry point separately
requires modeling permission for trace fits and regression evaluation, so it
cannot be used to bypass that group. Newly unclassified actions are denied to
custom profiles until explicitly mapped.

The evidence-investigator and scientific-tutor presets have no code or export
capability. The quantitative-analyst preset adds registered modeling. Profiles
that allow code, export or workspace proposals still use the existing explicit
approval and revision checks. Selected context remains the researcher's
explicitly selected data; action groups do not replace ownership or input-consent
checks.

When no profile is supplied, the original core system prompt, routing and tool
catalog remain unchanged. The six-turn research boundary and reserved final
answer turn remain in effect for custom requests. The exact selected profile,
policy version, model settings and tool contracts are retained in reproducibility
metadata. Custom-profile voice is not presented until voice supports that same
frozen configuration.

## Drafting API

- `GET /v1/agents/catalog` returns the current presets and capability labels.
- `POST /v1/agents/draft` accepts a description and `kind: profile | skill`.
  It makes one structured, tool-free provider call using the existing connection
  and budget ledger. The result has `status: draft`, the profile or skill, model
  and prompt identity, recorded provider usage and estimated cost. It does not
  save or activate the draft.
- Manual creation works without model access. A provider or budget failure does
  not prevent editing a local profile or skill. There is no automatic paid retry.

Draft text must be reviewed before the researcher saves or uses it. The server
does not create external services, credentials, filesystem plugins or new
permissions. Browser-owned sessions preserve their own frozen configuration;
editing a profile later does not silently rewrite an existing chat.

## Focused verification

Ten focused offline unit cases cover invalid/frozen guidance, the system
boundary, default-profile restrictions, direct and nested action denial,
modeling-alias rejection, unchanged core catalogs, both structured draft kinds
and budget rejection before provider-client creation. The two added resource
cases check settlement of unstarted work, client cleanup after a ledger failure
and preservation of an uncertain reservation when an in-flight draft is
cancelled. Draft-provider responses in these unit tests are explicit offline
fixtures. No broad test suite was repeated for this extension.

A separate bounded local interface check created a reusable skill, attached it
to a profile, saved and used the agent, revised the library profile and confirmed
that its saved conversation retained the original frozen instructions. Standard
Research Studio opened independently. Desktop and mobile inspection found no
JavaScript errors or horizontal overflow. Backup restoration and storage-failure
scenarios were not repeated; their generic implementation was inspected.

One explicit, actual profile-draft request returned HTTP 200 through the existing
connection, using `gpt-6.1-terra` at a recorded estimated cost of $0.001187. The
returned Combustion Source Reader configuration remained unsaved until edited
and explicitly saved. No custom-agent research or voice request was made during
this interface check. The local receipt and compact result are retained at
`/tmp/nova-agent-workshop-paid-draft.json` and
`/tmp/nova-agent-workshop-smoke-result.json`.

The final production build, including TypeScript compilation, passed after the
label and pending-state corrections. Generated API contracts matched, and the
standalone contract client type check passed. These checks establish local
implementation behavior, not deployment or hosted acceptance.
