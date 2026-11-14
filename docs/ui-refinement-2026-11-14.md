# Dashboard interaction refinement — 14 November 2026

This follows the [frontend delivery](frontend-2026-11-14.md). The research
workflows, scientific calculations, source media and established light/dark
palettes remain the basis of the interface.

## Restrained identity and feedback

The supplied flame visualizer is adapted into a decorative ember within the
intact A of the NOVA EMBER wordmark. Its organic volume and orange/blue material
remain procedural. The working dashboard does not expose the demo sliders,
orbit controls, scenery or bloom passes.

The transparent WebGL2 buffer is 48 × 72 pixels with 24 volume samples in one
pass. It draws a static frame at rest. Hover or keyboard focus activates at most
1.4 seconds of motion, capped at 20 draws per second. Offscreen/hidden state and
operating-system or workspace reduced motion stop animation. Context loss and
unavailable WebGL retain a static CSS ember and the readable letter. Resources
and subscriptions are released on cleanup. This is decoration, with no
relationship to the source data, a combustion model or a temperature scale.

Shared controls use 120 ms color/border feedback and a small icon compression on
press. Directional child arrows move 2 pixels while the pointer target remains
stationary. The command palette has a 160 ms reveal and the existing mobile
drawer uses the shared 180 ms easing. Reduced motion removes spatial feedback.
There are no page-load choreographies, background loops or animated chart values.

Small overview example links, secondary text actions, the command trigger and
wordmark now have at least 44-pixel interaction targets. Existing navigation
groups, familiar controls and scientific hierarchy are retained. Whitespace is
trimmed from command searches, without relaxing scientific input validation.

Drafting a Studio question shows real pending feedback, prevents duplicate local
intents and preserves the question after a storage failure. Its status region is
outside the busy form. Drafting does not submit a model request.

## System appearance

New workspaces default to System and follow device light/dark changes live.
Settings explains System, Light and Dark. Explicit modern or legacy saved theme
choices remain fixed until changed; reload and backup continue to preserve them.
This supersedes the earlier light-default specification and does not invert
scientific media.

## Verification

- One combined local Chrome run passed all 16 selected browser regressions:
  three appearance, three ember lifecycle/fallback, five interface/recovery,
  three research and two workspace portability checks.
- The checks cover 1440/390-pixel targets and overflow, keyboard focus, command
  normalization, duplicate-save protection and storage recovery; original FLEX
  counts, oxygen arithmetic, unsupported pooling, revisions and backup/import
  also passed unchanged.
- Final mobile inspection confined the wordmark target to its visible width so
  it clears the drawer’s close control. All eight ember/interface regressions
  passed again after this correction, including the target separation check.
- The ember checks establish idle behavior, bounded activation, offscreen
  interruption, both reduced-motion settings, context-loss fallback and absent
  WebGL. A standalone shader draw reported WebGL error zero.
- TypeScript/application and client checks, Prettier and the optimized Next.js
  production build passed. Desktop and phone light/dark renders were inspected.

These are local implementation checks. They do not establish full accessibility
conformance, physical mobile GPU performance, CI results, deployment or hosted
application behavior. No new runtime dependency or service was introduced, and
no paid inference request was made for this refinement.
