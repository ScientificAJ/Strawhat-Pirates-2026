# Private voice backend

The voice backend uses the application's existing OpenAI connection and PostgreSQL,
with an in-process sideband listener. It adds no hosting, transcription or queue
service. The project key stays in backend configuration. Browsers receive an SDP
answer and an application session ID, never the project key.

`POST /v1/voice/sessions` accepts a browser WebRTC audio offer, explicit microphone
consent, a pinned workspace/context version and a unique operation ID. Image
consent is independent: the ordinary voice path needs none. A selected PNG/JPEG
image additionally requires its explicit image selection/consent, purpose and hash;
the existing research-image validator checks its bytes. Consented uploaded image bytes
are retained once in the existing private object directory, outside the web root,
rather than copied into every transcript update. Images go to the grounded
research backend, because GPT-Live accepts audio/text rather than images/video.

The broker uses `gpt-live-1`, client delegation, `store: false`, and a restricted
browser data channel. The browser can receive captions/status but cannot send
trusted instructions or tool results. The authenticated backend sideband owns
transcripts, delegation, scientific-result delivery and provider controls. The
[WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live)
and [server-controls guide](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live)
explain these transport boundaries.

A temporary HttpOnly, SameSite=Strict browser cookie protects session status,
transcripts, controls and linked research tasks. HTTPS sets Secure. Mutations
reject a conflicting Origin; all voice responses disable caching. Another browser
cannot read, renew or cancel the session by knowing its UUID. The canonical
scientific corpus remains read-only to visitors.

## Context, research and conversation

The sideband deduplicates provider event IDs and retains transcript fragments with
speaker, sequence, original timing and context version. Fragments are not complete
turns or guaranteed correct transcriptions. The bounded recent window holds at most
512 events/128 KiB; omitted history is explicitly marked. The frontend must preserve
its complete personal transcript in the browser as events arrive. Temporary server
text remains accessible for 24 hours after closure, then the existing worker
removes it together with the temporary uploaded image copy. Raw reflected audio
events are ignored before state processing; no audio recording is saved.

Client delegation has no task text of its own. The backend composes the research
request from retained user fragments and the pinned workspace, then uses the same
receipt-scoped durable research jobs as text Studio. Duplicate delegations cannot
create duplicate jobs. Selected images use that same consented research path.
Checked findings and their limits return as bounded context before GPT-Live is
asked to explain them. Exact values, units, evidence and limitations remain in the
written research result. Provider acceptance of a commentary command does not
prove speech, exact spoken wording or audible playback. The
[delegation guide](https://developers.openai.com/api/docs/guides/live-delegation)
describes the application-owned context/result flow.

A context update requires the expected prior version and a new version when its
selection changes. Late tasks retain their original version and are withheld from
the current voice context. The written result remains inspectable. Typed questions
can resume the conversation after voice closes. An explicit replacement session
can restore recent text/task state; it does not replay already executed actions.

## Controls and budgets

The controls distinguish microphone mute, stopping playback, suppressing new
voice generation, canceling selected computations and ending/revoking voice.
Stopping speech leaves computation running. Ending voice leaves written results
and explicitly initiated research tasks available. Canceling an already completed
job reports it unchanged. End/revoke remains available across context changes;
an expired or revoked session cannot unmute or renew. The frontend must apply the
returned local actions to stop microphone tracks and pause playback immediately.
Provider signal/acceptance is tracked separately from those browser actions.

Voice reservations share the deployment's existing request/daily model budget.
The current published rate is $0.05/minute, with separately billed research calls.
At the default $0.10 request allowance, the application lease is 105 seconds with
15 seconds reserved for initialization/closure allowance. Explicit consented
renewal reserves additional budget while preserving the same conversation.
No unverified provider maximum-duration setting is invented. The API listener and
existing worker watchdog close expired sessions. A transport failure can make
remote cutoff/final billing uncertain; the reservation stays counted until final
usage is confirmed. This is not a guaranteed billing cap during a network outage.
See [current Live pricing](https://developers.openai.com/api/docs/models/gpt-live-1).

`session.closed` from the authenticated sideband confirms finalization and final
cumulative duration. Running usage is never summed across repeated updates.
Published-rate estimates retain the WebRTC initialization minimum; invoices remain
separate evidence. A bare HTTP hangup acknowledgment or lost connection does not
confirm final usage, so the backend preserves an uncertain reservation. The
[session guide](https://developers.openai.com/api/docs/guides/live-conversations)
defines these closure and recovery semantics.

## Verification on 14 November 2026

The real OpenAI SDK path was exercised through a temporary local voice API and
headless Chrome. A silent oscillator supplied a synthetic audio track; no human
microphone was accessed. The broker returned HTTP 200, the browser received
`session.started`, End returned HTTP 200, and the authenticated sideband received
`session.closed` with confirmed final usage of 15 seconds. No browser provider
error code occurred. The corresponding published-rate estimate is $0.0125. The
temporary server and synthetic audio/peer connection were stopped afterward.

PostgreSQL tests with an explicit fake provider cover denied ownership, separate
consent, source/context binding, deduplication, task lifecycle, cancellation,
renewal, retained uncertainty, watchdog/restart recovery and final settlement.
They do not establish microphone-device behavior, spoken-number/name fidelity,
interruption quality, playback delivery or hosted networking. Those require the
actual frontend and final integrated/host qualification checks.
