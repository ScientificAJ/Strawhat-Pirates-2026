"use client";

import {
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  Play,
  RefreshCw,
  Square,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { downloadJson } from "../lib/api";
import {
  message,
  object,
  records,
  studioRequest,
  type JsonRecord,
  type SharedImage,
  type WorkspaceContext,
} from "../lib/studio-session";
import styles from "./voice-console.module.css";

export type VoiceConsoleProps = {
  context: WorkspaceContext;
  images?: SharedImage[];
  transcript?: JsonRecord[];
  sessionId?: string;
  onSessionChange?: (id: string) => void;
  onTranscript?: (transcript: JsonRecord[]) => void;
  onAskText?: (text: string) => void;
  onResearchJob?: (
    id: string,
    question: string,
    context: WorkspaceContext,
  ) => void;
  onClose?: () => void;
};

export function VoiceConsole({
  context,
  images = [],
  transcript = [],
  sessionId,
  onSessionChange,
  onTranscript,
  onAskText,
  onResearchJob,
  onClose,
}: VoiceConsoleProps) {
  const [id, setId] = useState(sessionId ?? "");
  const [state, setState] = useState<JsonRecord>({});
  const [phase, setPhase] = useState("Disconnected");
  const [consent, setConsent] = useState(false);
  const [muted, setMuted] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [error, setError] = useState("");
  const [corrected, setCorrected] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [recent, setRecent] = useState<JsonRecord[]>([]);
  const [levels, setLevels] = useState<number[]>(Array(8).fill(2));
  const peer = useRef<RTCPeerConnection | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const activeId = useRef(id);
  const version = useRef(context.context_version);
  const generation = useRef(0);
  const audioContext = useRef<AudioContext | null>(null);
  const frame = useRef(0);
  const ended = useRef(false);
  const allTranscript = useRef(transcript);
  const seenJobs = useRef(new Set<string>());
  const callbacks = useRef({ onSessionChange, onTranscript, onResearchJob });
  callbacks.current = { onSessionChange, onTranscript, onResearchJob };
  activeId.current = id;
  const stopLocal = useCallback(() => {
    microphone.current?.getTracks().forEach((track) => track.stop());
    microphone.current = null;
    if (audio.current) {
      audio.current.pause();
      audio.current.srcObject = null;
    }
    peer.current?.close();
    peer.current = null;
    cancelAnimationFrame(frame.current);
    void audioContext.current?.close().catch(() => undefined);
    audioContext.current = null;
    setLevels(Array(8).fill(2));
  }, []);
  useEffect(
    () => () => {
      generation.current += 1;
      stopLocal();
      if (activeId.current && !ended.current)
        void studioRequest(
          `/v1/voice/sessions/${activeId.current}/controls`,
          {
            operation_id: crypto.randomUUID(),
            expected_context_version: version.current,
            action: "end",
            job_ids: [],
          },
          { keepalive: true },
        ).catch(() => undefined);
    },
    [stopLocal],
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const sequence = allTranscript.current
          .filter((item) => item.voice_session_id === id)
          .reduce(
            (maximum, item) => Math.max(maximum, Number(item.sequence ?? 0)),
            0,
          );
        const value = await studioRequest(
          `/v1/voice/sessions/${id}?after_sequence=${sequence}`,
          undefined,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setState(value);
        version.current = String(value.context_version ?? version.current);
        const fresh: JsonRecord[] = records(value.transcript).map((item) => ({
          ...item,
          voice_session_id: id,
        }));
        const known = new Set(
          allTranscript.current.map(
            (item) => `${item.voice_session_id}:${item.sequence}`,
          ),
        );
        const merged = [
          ...allTranscript.current,
          ...fresh.filter((item) => !known.has(`${id}:${item.sequence}`)),
        ];
        if (merged.length !== allTranscript.current.length) {
          allTranscript.current = merged;
          callbacks.current.onTranscript?.(merged);
        }
        const workspace = object(
          value.workspace,
        ) as unknown as WorkspaceContext;
        for (const task of Object.values(object(value.tasks)).map(object)) {
          const jobId = String(task.job_id ?? "");
          if (jobId && !seenJobs.current.has(jobId)) {
            seenJobs.current.add(jobId);
            const last = merged
              .filter((item) => item.speaker === "user")
              .at(-1);
            callbacks.current.onResearchJob?.(
              jobId,
              String(last?.text ?? "Research delegated from live conversation"),
              workspace.snapshot_id ? workspace : context,
            );
          }
        }
        if (
          value.status === "closed" ||
          value.status === "uncertain" ||
          value.close_requested
        ) {
          stopLocal();
          setPhase(
            value.status === "uncertain"
              ? "Disconnected · closure unconfirmed"
              : "Disconnected",
          );
        } else if (
          value.status === "active" &&
          peer.current?.connectionState === "connected"
        )
          setPhase((previous) =>
            ["Speaking", "Processing"].includes(previous)
              ? previous
              : value.muted
                ? "Muted"
                : "Listening",
          );
      } catch (failure) {
        if (!controller.signal.aborted) setError(message(failure));
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1200);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, stopLocal, context]);

  async function control(action: string, target = activeId.current) {
    if (!target) return;
    if (["end", "revoke_microphone"].includes(action)) {
      ended.current = true;
      generation.current += 1;
      stopLocal();
      setPhase("Disconnected");
      setConsent(false);
    }
    if (action === "mute") {
      microphone.current?.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      setMuted(true);
      setPhase("Muted");
    }
    if (action === "stop_speaking" || action === "stop_generation") {
      audio.current?.pause();
      setPhase(
        action === "stop_generation" ? "Generation paused" : "Listening",
      );
    }
    try {
      await studioRequest(`/v1/voice/sessions/${target}/controls`, {
        operation_id: crypto.randomUUID(),
        expected_context_version: version.current,
        action,
        job_ids: [],
      });
      if (action === "unmute") {
        microphone.current?.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        setMuted(false);
        setPhase("Listening");
      }
      if (action === "resume_generation") {
        await audio.current?.play().catch(() => setPlaybackBlocked(true));
        setPhase(muted ? "Muted" : "Listening");
      }
    } catch (failure) {
      setError(
        `${message(failure)} Local microphone/playback shutdown is independent of remote confirmation.`,
      );
    }
  }
  async function start() {
    if (!consent || busy) return;
    setError("");
    setBusy(true);
    setPhase("Connecting");
    const token = ++generation.current;
    ended.current = false;
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof RTCPeerConnection === "undefined"
      )
        throw new Error(
          "This browser cannot provide WebRTC microphone access. Continue with text.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (token !== generation.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      microphone.current = stream;
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          void control("revoke_microphone");
        };
      });
      if (typeof AudioContext !== "undefined") {
        const meter = new AudioContext();
        audioContext.current = meter;
        const analyser = meter.createAnalyser();
        analyser.fftSize = 64;
        meter.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        let previous = 0;
        const draw = (time: number) => {
          if (token !== generation.current) return;
          if (time - previous > 100) {
            analyser.getByteTimeDomainData(samples);
            setLevels(
              Array.from({ length: 8 }, (_, index) =>
                Math.max(
                  2,
                  Math.min(26, Math.abs(samples[index * 8] - 128) / 4),
                ),
              ),
            );
            previous = time;
          }
          frame.current = requestAnimationFrame(draw);
        };
        frame.current = requestAnimationFrame(draw);
      }
      const connection = new RTCPeerConnection();
      peer.current = connection;
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      connection.ontrack = (event) => {
        if (token !== generation.current || peer.current !== connection) return;
        if (!audio.current) return;
        audio.current.srcObject =
          event.streams[0] ?? new MediaStream([event.track]);
        void audio.current.play().catch(() => setPlaybackBlocked(true));
      };
      connection.onconnectionstatechange = () => {
        if (peer.current !== connection) return;
        if (connection.connectionState === "connected") setPhase("Processing");
        if (["failed", "disconnected"].includes(connection.connectionState)) {
          stopLocal();
          setPhase("Disconnected");
          setError(
            "The audio connection was interrupted. Your written transcript is retained; end the remote session before reconnecting.",
          );
        }
      };
      const channel = connection.createDataChannel("oai-events");
      channel.onmessage = (event) => {
        if (token !== generation.current || !microphone.current) return;
        try {
          const value = object(JSON.parse(String(event.data)));
          if (
            [
              "output_audio_buffer.started",
              "response.audio.delta",
              "response.output_audio.delta",
            ].includes(String(value.type))
          )
            setPhase("Speaking");
          if (
            [
              "response.done",
              "output_audio_buffer.stopped",
              "session.started",
            ].includes(String(value.type))
          )
            setPhase(
              microphone.current.getAudioTracks().some((track) => track.enabled)
                ? "Listening"
                : "Muted",
            );
          if (value.type === "input_audio_buffer.speech_started")
            setPhase("Listening");
        } catch {
          /* Transport events are optional; authenticated captions arrive through the backend. */
        }
      };
      await connection.setLocalDescription(await connection.createOffer());
      if (connection.iceGatheringState !== "complete")
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 3500);
          const changed = () => {
            if (connection.iceGatheringState === "complete") {
              clearTimeout(timeout);
              connection.removeEventListener(
                "icegatheringstatechange",
                changed,
              );
              resolve();
            }
          };
          connection.addEventListener("icegatheringstatechange", changed);
        });
      if (token !== generation.current) return;
      const result = await studioRequest("/v1/voice/sessions", {
        operation_id: crypto.randomUUID(),
        sdp: connection.localDescription?.sdp,
        context,
        expected_context_version: context.context_version,
        microphone_consent: true,
        image_consent: images.length > 0,
        images,
        resume_session_id: id || null,
      });
      const identifier = String(result.id);
      if (token !== generation.current) {
        void control("end", identifier);
        return;
      }
      activeId.current = identifier;
      setId(identifier);
      callbacks.current.onSessionChange?.(identifier);
      version.current = context.context_version;
      await connection.setRemoteDescription({
        type: "answer",
        sdp: String(result.sdp),
      });
      setPhase("Processing");
    } catch (failure) {
      stopLocal();
      setPhase("Disconnected");
      setError(
        failure instanceof DOMException && failure.name === "NotAllowedError"
          ? "Microphone permission was denied. You can continue with the complete text workflow or change browser permission and start explicitly."
          : message(failure),
      );
    } finally {
      setBusy(false);
    }
  }
  async function renew() {
    try {
      const value = await studioRequest(`/v1/voice/sessions/${id}/renew`, {
        operation_id: crypto.randomUUID(),
        expected_context_version: version.current,
        microphone_consent: consent,
      });
      setState((previous) => ({ ...previous, expires_at: value.expires_at }));
    } catch (failure) {
      setError(message(failure));
    }
  }
  async function updateContext() {
    try {
      await studioRequest(`/v1/voice/sessions/${id}/context`, {
        operation_id: crypto.randomUUID(),
        context,
        expected_context_version: version.current,
        image_consent: images.length > 0,
        images,
      });
      version.current = context.context_version;
      setState((previous) => ({
        ...previous,
        context_version: context.context_version,
      }));
    } catch (failure) {
      setError(message(failure));
    }
  }
  async function correctedQuestion() {
    if (!corrected.trim()) return;
    if (!id) {
      onAskText?.(corrected);
      return;
    }
    try {
      const result = await studioRequest(`/v1/voice/sessions/${id}/questions`, {
        operation_id: crypto.randomUUID(),
        expected_context_version: version.current,
        question: corrected.trim(),
      });
      const job = String(result.job_id);
      seenJobs.current.add(job);
      callbacks.current.onResearchJob?.(job, corrected.trim(), context);
      setCorrected("");
    } catch (failure) {
      setError(message(failure));
    }
  }
  const active =
    Boolean(peer.current) &&
    !["Disconnected", "Disconnected · closure unconfirmed"].includes(phase);
  const remaining = state.expires_at
    ? Math.max(
        0,
        Math.ceil((Date.parse(String(state.expires_at)) - now) / 1000),
      )
    : null;
  const stale = Boolean(
    id &&
    state.context_version &&
    state.context_version !== context.context_version,
  );
  useEffect(() => {
    if (remaining === 0 && microphone.current) {
      stopLocal();
      setPhase("Disconnected");
    }
  }, [remaining, stopLocal]);
  const groups: {
    speaker: string;
    text: string;
    context: string;
    session: string;
  }[] = [];
  for (const item of allTranscript.current) {
    const speaker = String(item.speaker ?? "voice");
    const contextVersion = String(item.context_version ?? "");
    const sessionVersion = String(item.voice_session_id ?? "");
    if (
      groups.at(-1)?.speaker === speaker &&
      groups.at(-1)?.context === contextVersion &&
      groups.at(-1)?.session === sessionVersion
    )
      groups[groups.length - 1].text += String(item.text ?? "");
    else
      groups.push({
        speaker,
        text: String(item.text ?? ""),
        context: contextVersion,
        session: sessionVersion,
      });
  }
  return (
    <section className={styles.voice} aria-label="Live research conversation">
      <header>
        <div>
          <h2>Live conversation</h2>
          <p>Audio and text share the pinned research context.</p>
        </div>
        {onClose && (
          <button
            className="icon-button"
            aria-label="Close live conversation"
            onClick={() => {
              void control("end");
              onClose();
            }}
          >
            <X size={18} />
          </button>
        )}
      </header>
      <div className={styles.state} role="status">
        <span className={styles.indicator} data-active={active}>
          {muted ? <MicOff size={19} /> : <Headphones size={19} />}
        </span>
        <strong>{phase}</strong>
        <svg
          className={styles.waveform}
          role="img"
          aria-label="Current microphone input level"
          viewBox="0 0 60 30"
        >
          {levels.map((height, index) => (
            <rect
              key={index}
              x={index * 7}
              y={(30 - height) / 2}
              width={3}
              height={height}
              rx={1.5}
            />
          ))}
        </svg>
        {remaining !== null && <span>{remaining}s in current lease</span>}
      </div>
      <p className={styles.scope}>
        Snapshot{" "}
        <code>
          {String(
            object(state.workspace).snapshot_id ?? context.snapshot_id,
          ).slice(0, 12)}
        </code>{" "}
        · microphone {active && !muted ? "shared" : "off"} · screen sharing off
        {images.length ? " · selected image consented" : ""}
      </p>
      <p className={styles.notice}>
        Your microphone audio is sent to OpenAI only after starting. This
        application does not save raw audio. Captions can be partial or
        incorrect; review numbers and units before consequential use. Written
        research is billed separately.
      </p>
      <label className={styles.consent}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => {
            setConsent(event.target.checked);
            if (!event.target.checked && active)
              void control("revoke_microphone");
          }}
        />
        Share microphone audio for this live session. Starting or renewing
        reserves the server&apos;s published voice allowance.
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {stale && (
        <div className={styles.notice}>
          <p>
            The page context changed. Voice stays pinned to its previous
            selection.
          </p>
          <button className="button button-small" onClick={updateContext}>
            Use current selected context
          </button>
        </div>
      )}
      <div className={styles.controls}>
        {!active ? (
          <button
            className="button button-primary"
            disabled={!consent || busy}
            onClick={start}
          >
            <Mic size={16} />
            {busy
              ? "Connecting…"
              : id
                ? "Start replacement live session"
                : "Start live conversation"}
          </button>
        ) : (
          <>
            <button
              className="button"
              onClick={() => control(muted ? "unmute" : "mute")}
            >
              {muted ? <Mic size={16} /> : <MicOff size={16} />}
              {muted ? "Unmute" : "Mute microphone"}
            </button>
            <button className="button" onClick={() => control("stop_speaking")}>
              <VolumeX size={16} />
              Stop playback
            </button>
            <button
              className="button"
              onClick={() => control("stop_generation")}
            >
              <Square size={15} />
              Pause generation
            </button>
            <button
              className="button"
              onClick={() => control("resume_generation")}
            >
              <Play size={16} />
              Resume speech
            </button>
            <button
              className="button"
              disabled={!consent || stale}
              onClick={renew}
            >
              <RefreshCw size={16} />
              Renew allowance
            </button>
          </>
        )}
        {id && (
          <button className="button" onClick={() => control("end")}>
            <PhoneOff size={16} />
            End voice
          </button>
        )}
      </div>
      {playbackBlocked && (
        <button
          className="button"
          onClick={() => {
            void audio.current
              ?.play()
              .then(() => setPlaybackBlocked(false))
              .catch((failure) => setError(message(failure)));
          }}
        >
          Enable audio playback
        </button>
      )}
      <audio ref={audio} autoPlay />
      <div
        className={styles.transcript}
        role="log"
        aria-label="Written voice transcript"
        aria-live="polite"
      >
        {groups.length ? (
          groups.map((group, i) => (
            <article key={i}>
              <strong>
                {group.speaker === "user"
                  ? "Your transcript"
                  : "Spoken response"}
              </strong>
              <p>{group.text}</p>
            </article>
          ))
        ) : (
          <p>
            Captions will appear here after the authenticated voice connection
            starts.
          </p>
        )}
      </div>
      {state.transcript_truncated === true && (
        <p className={styles.notice}>
          The server retains a bounded recent window. Captions already received
          here remain in this browser session.
        </p>
      )}
      <div className={styles.correction}>
        <label>
          Review or correct a question
          <textarea
            value={corrected}
            maxLength={6000}
            onChange={(event) => setCorrected(event.target.value)}
            placeholder="Write the exact value, unit and question to use…"
          />
        </label>
        <div className={styles.controls}>
          <button
            className="button button-small"
            onClick={() =>
              setCorrected(
                allTranscript.current
                  .filter((item) => item.speaker === "user")
                  .map((item) => String(item.text ?? ""))
                  .slice(-4)
                  .join(""),
              )
            }
          >
            Use recent user transcript
          </button>
          <button
            className="button button-primary"
            disabled={!corrected.trim() || stale}
            onClick={correctedQuestion}
          >
            {id ? "Ask with corrected text" : "Continue in text"}
          </button>
        </div>
      </div>
      <details>
        <summary>Recovery, transcript and independent controls</summary>
        <div className={styles.controls}>
          <button
            className="button"
            onClick={() =>
              downloadJson("nova-ember-voice-transcript.json", {
                context,
                transcript: allTranscript.current,
              })
            }
          >
            Export received transcript
          </button>
          {id && (
            <>
              <button
                className="button"
                onClick={() => control("revoke_microphone")}
              >
                Revoke microphone
              </button>
              <button
                className="button"
                onClick={() => control("cancel_computation")}
              >
                Cancel voice computations
              </button>
            </>
          )}
          <button
            className="button"
            onClick={async () => {
              try {
                const value = await studioRequest("/v1/voice/sessions");
                setRecent(records(value.sessions));
              } catch (failure) {
                setError(message(failure));
              }
            }}
          >
            Find recent server sessions
          </button>
        </div>
        {recent.map((item) => (
          <div key={String(item.id)}>
            <button
              className={styles.textButton}
              onClick={() => {
                stopLocal();
                setId(String(item.id));
                callbacks.current.onSessionChange?.(String(item.id));
              }}
            >
              {String(item.status)} · {String(item.id).slice(0, 8)}
            </button>
          </div>
        ))}
        <p>
          Ending voice stops local microphone/playback immediately. Server
          closure and final billing confirmation are reported separately.
          Research jobs and downloaded exports retain their own controls.
        </p>
        {id && (
          <p>
            Remote finalization:{" "}
            {state.finalization_confirmed ? "confirmed" : "not confirmed"}.
            Final usage:{" "}
            {state.final_usage_confirmed ? "confirmed" : "not confirmed"}.
          </p>
        )}
      </details>
    </section>
  );
}
