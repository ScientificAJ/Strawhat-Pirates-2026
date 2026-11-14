"use client";

import { useEffect, useRef, useState } from "react";
import {
  parseAgentDraft,
  type AgentDraft,
  type AgentDraftProvenance,
} from "../lib/agent-profiles";
import { studioRequest, message } from "../lib/studio-session";
import { post } from "../lib/laboratory-api";
import styles from "./agent-workshop.module.css";

export function AgentDraftBuilder({
  kind,
  onDraft,
  disabled = false,
  onBusyChange,
}: {
  kind: "profile" | "skill";
  onDraft: (draft: AgentDraft, provenance: AgentDraftProvenance) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [description, setDescription] = useState("");
  const [configured, setConfigured] = useState(false);
  const [requestLimit, setRequestLimit] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      studioRequest("/v1/capabilities/models", undefined, {
        signal: controller.signal,
      }),
      studioRequest("/v1/usage/models", undefined, {
        signal: controller.signal,
      }),
    ])
      .then(([capabilities, usage]) => {
        setConfigured(capabilities.configured === true);
        const limit = Number(usage.request_limit_usd);
        if (Number.isFinite(limit) && limit > 0) setRequestLimit(limit);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(message(reason));
      });
    return () => {
      controller.abort();
      pending.current?.abort();
    };
  }, []);
  async function prepare(event: React.FormEvent) {
    event.preventDefault();
    if (
      busyRef.current ||
      disabled ||
      !configured ||
      requestLimit === null ||
      !description.trim()
    )
      return;
    busyRef.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    const controller = new AbortController();
    pending.current = controller;
    try {
      const result = parseAgentDraft(
        await post<unknown>(
          "/v1/agents/draft",
          { description: description.trim(), kind },
          controller.signal,
        ),
        kind,
      );
      const provenance = {
        model: result.model,
        prompt_version: result.prompt_version,
        cost_usd: result.cost_usd,
        description,
      };
      onDraft(result, provenance);
      setReceipt(
        `Draft ready to review. Estimated model cost $${Number(result.cost_usd).toPrecision(3)} · ${result.model}.`,
      );
    } catch (reason) {
      if (!controller.signal.aborted) setError(message(reason));
    } finally {
      if (!controller.signal.aborted) {
        busyRef.current = false;
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  }
  return (
    <form className={styles.builder} onSubmit={prepare} aria-busy={busy}>
      <h2>Describe the {kind === "profile" ? "agent" : "skill"} you need</h2>
      <p className={styles.help}>
        Describe its purpose, preferred working style and useful research tasks.
        Review and edit the returned instructions before saving.
      </p>
      <label className={styles.field}>
        {kind === "profile"
          ? "Agent description for drafting"
          : "Skill description for drafting"}
        <textarea
          required
          maxLength={4000}
          rows={4}
          value={description}
          readOnly={busy}
          onChange={(event) => {
            setDescription(event.target.value);
            setReceipt("");
          }}
        />
      </label>
      <p className={styles.help}>
        {configured && requestLimit !== null
          ? `This explicit request uses the existing model connection and can reserve up to $${requestLimit.toFixed(2)} against its usage allowance.`
          : "Drafting needs a configured model connection and its request allowance. Manual editing is available below."}
      </p>
      {disabled && (
        <p className={styles.help}>
          Save or cancel your current editor changes before preparing another
          draft.
        </p>
      )}
      <button
        className="button"
        type="submit"
        disabled={
          busy ||
          disabled ||
          !configured ||
          requestLimit === null ||
          !description.trim()
        }
      >
        {busy ? "Preparing draft…" : "Prepare draft"}
      </button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {receipt && (
        <p role="status" className={styles.help}>
          {receipt}
        </p>
      )}
    </form>
  );
}
