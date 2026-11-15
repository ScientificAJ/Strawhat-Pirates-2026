"use client";
import { isPsiAccession } from "../lib/investigation-identifiers";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  FilePlus2,
  Pause,
  Trash2,
  Upload,
  Plus,
} from "lucide-react";
import { request, useResource, type Catalog } from "../lib/api";
import {
  digestFile,
  message,
  post,
  readable,
  type FrozenInput,
  type Job,
} from "../lib/laboratory-api";
import { listDocuments, saveDocument } from "../lib/workspace-documents";
import { JobMonitor } from "./job-monitor";
import styles from "./laboratory-workbench.module.css";

type UploadRecord = {
  upload_id: string;
  snapshot_id: string;
  file_name: string;
  sha256: string;
  byte_size: number;
  received_bytes: number;
  status: string;
  expiry: string;
  license: string;
  rights_assertion: string;
  redistribution_allowed: boolean;
  intended_use: string;
  processing_location: string;
  validation?: unknown;
};
type UploadProfile = {
  max_file_bytes: number;
  chunk_bytes: number;
  retention_hours: number;
  supported_suffixes: string[];
  processing_location: string;
};
type Manifest = {
  manifest_sha256: string;
  items: {
    key: string;
    file_name: string;
    version: number;
    declared_bytes: number | null;
    restricted: boolean;
    visible: boolean;
  }[];
  total: number;
};
export function InputWorkbench({
  snapshotId,
  onInput,
}: {
  snapshotId: string;
  onInput: (input: FrozenInput) => void;
}) {
  const profile = useResource<UploadProfile>("/v1/uploads/profile");
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [license, setLicense] = useState("");
  const [rights, setRights] = useState("");
  const [use, setUse] = useState("execution_input");
  const [encoding, setEncoding] = useState("utf-8-sig");
  const [permission, setPermission] = useState(false);
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState<UploadRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const abort = useRef<AbortController | null>(null);
  const [jobs, setJobs] = useState<string[]>([]);
  const [exportId, setExportId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Record<string, Job>>({});
  const [preview, setPreview] = useState<{
    headers: string[];
    rows: { source_row: number; line_end: number; raw_cells: string[] }[];
    encoding: string;
    preview_status: string;
  } | null>(null);
  const [privateText, setPrivateText] = useState<{
    name: string;
    text: string;
    truncated: boolean;
    encoding: string;
  } | null>(null);
  const catalog = useResource<Catalog>(
    `/v1/investigations?limit=100&snapshot_id=${snapshotId}`,
  );
  const [accession, setAccession] = useState("PSI-69");
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const manifest = useResource<Manifest>(
    `/v1/investigations/${accession}/manifest?snapshot_id=${snapshotId}&limit=50&offset=${offset}`,
  );
  async function refresh() {
    try {
      const value = await request<{ uploads: UploadRecord[] }>("/v1/uploads");
      setUploads(value.uploads);
    } catch {
      setUploads([]);
    }
  }
  useEffect(() => {
    void refresh();
    void listDocuments<Record<string, unknown>>("analysis").then((values) =>
      setJobs(
        values
          .filter(
            (item) =>
              item.data.surface === "acquisition" &&
              item.snapshot_id === snapshotId &&
              typeof item.data.job_id === "string",
          )
          .map((item) => String(item.data.job_id)),
      ),
    );
    return () => abort.current?.abort();
  }, [snapshotId]);
  function choose(value: File | null) {
    setError(null);
    if (value && profile.data) {
      const suffix = "." + value.name.split(".").pop()?.toLowerCase();
      if (!profile.data.supported_suffixes.includes(suffix)) {
        setError(
          `Unsupported file format ${suffix}. Select a listed scientific input format.`,
        );
        return;
      }
      if (value.size > profile.data.max_file_bytes) {
        setError(
          `This file exceeds the ${Math.round(profile.data.max_file_bytes / 1048576)} MiB upload profile. Select a smaller frozen input.`,
        );
        return;
      }
    }
    setFile(value);
  }
  async function transfer() {
    if (!file || !consent) return;
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const digest = await digestFile(file);
      let record = pending;
      if (record) {
        if (
          record.sha256 !== digest ||
          record.byte_size !== file.size ||
          record.file_name !== file.name
        )
          throw new Error(
            "Resuming requires the exact original file, name, length and SHA-256.",
          );
        record = await request<UploadRecord>(`/v1/uploads/${record.upload_id}`);
      } else {
        record = await post<UploadRecord>("/v1/uploads", {
          snapshot_id: snapshotId,
          file_name: file.name,
          byte_size: file.size,
          sha256: digest,
          intended_use: use,
          license,
          rights_assertion: rights,
          redistribution_allowed: permission,
          text_encoding: encoding,
          confirmed_temporary_processing: true,
        });
      }
      setPending(record);
      for (let offset = record.received_bytes; offset < file.size;) {
        const chunk = file.slice(
          offset,
          Math.min(offset + (profile.data?.chunk_bytes ?? 1048576), file.size),
        );
        const response = await fetch(
          `/v1/uploads/${record.upload_id}/chunks?offset=${offset}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: chunk,
            signal: controller.signal,
            credentials: "same-origin",
          },
        );
        if (!response.ok)
          throw new Error(
            "This chunk was not accepted. Reconnect and resume using the confirmed server offset.",
          );
        record = (await response.json()) as UploadRecord;
        offset = record.received_bytes;
        setPending(record);
      }
      setNotice(
        "All bytes received. Inspect the exact file and rights, then submit explicitly.",
      );
      await refresh();
    } catch (reason) {
      if (controller.signal.aborted)
        setNotice(
          "Transfer paused. Reselect this exact file to resume at the server-confirmed offset.",
        );
      else setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  async function finalize() {
    if (!pending) return;
    try {
      const record = await post<UploadRecord>(
        `/v1/uploads/${pending.upload_id}/finalize`,
        { sha256: pending.sha256, confirmed_submit: true },
      );
      setPending(record);
      setNotice(
        "Private input submitted. It remains separate from the public corpus and has not been sent to an AI provider.",
      );
      await refresh();
    } catch (reason) {
      setError(message(reason));
    }
  }
  async function remove(id: string) {
    try {
      const response = await fetch(`/v1/uploads/${id}`, { method: "DELETE" });
      if (!response.ok)
        throw new Error(
          "Removal was not confirmed. Retry while this browser receipt is available.",
        );
      if (pending?.upload_id === id) {
        setPending(null);
        setFile(null);
      }
      setNotice(
        "Temporary original removed; dependent execution sessions are closed by the backend.",
      );
      await refresh();
    } catch (reason) {
      setError(message(reason));
    }
  }
  async function acquire(item: Manifest["items"][number]) {
    try {
      const investigation = catalog.data?.items.find(
        (value) => value.accession === accession,
      );
      if (!investigation || !item.declared_bytes || !manifest.data)
        throw new Error(
          "A declared exact byte length and investigation version are required before acquisition.",
        );
      const created = await post<{ id: string }>("/v1/source-acquisitions", {
        snapshot_id: snapshotId,
        accession,
        investigation_version: investigation.version,
        file_name: item.file_name,
        file_version: item.version,
        manifest_key: item.key,
        manifest_sha256: manifest.data.manifest_sha256,
        declared_bytes: item.declared_bytes,
      });
      setJobs((previous) => [...previous, created.id]);
      await saveDocument({
        kind: "analysis",
        title: item.file_name,
        snapshot_id: snapshotId,
        data: { surface: "acquisition", job_id: created.id, source: item },
      });
    } catch (reason) {
      setError(message(reason));
    }
  }
  function acquired(job: Job) {
    setCompleted((previous) => ({ ...previous, [job.id]: job }));
    const result = job.result;
    if (job.status !== "succeeded" || !result) return;
    const source =
      result.source && typeof result.source === "object"
        ? (result.source as Record<string, unknown>)
        : {};
    onInput({
      id: job.id,
      kind: "acquired",
      name: String(source.file_name ?? "Acquired source"),
      sha256: String(result.sha256),
      byte_size: Number(result.byte_size),
      ready: true,
      expires_at: job.expires_at,
    });
  }
  async function inspectOriginal(record: UploadRecord) {
    try {
      const response = await fetch(`/v1/uploads/${record.upload_id}/content`, {
        headers: { Range: "bytes=0-1048575" },
      });
      if (!response.ok)
        throw new Error("The selected original is expired or unavailable.");
      const reader = response.body?.getReader();
      if (!reader)
        throw new Error("This browser cannot stream the source preview.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (size < 1048576) {
        const next = await reader.read();
        if (next.done) break;
        const chunk = next.value.slice(0, 1048576 - size);
        chunks.push(chunk);
        size += chunk.length;
      }
      await reader.cancel();
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const text = new TextDecoder(
        encoding === "cp1252"
          ? "windows-1252"
          : encoding === "utf-8-sig"
            ? "utf-8"
            : encoding,
        { fatal: true },
      ).decode(bytes);
      setPrivateText({
        name: record.file_name,
        text,
        truncated: size < record.byte_size,
        encoding,
      });
    } catch (reason) {
      setError(message(reason));
    }
  }
  async function inspectAcquired(id: string) {
    try {
      setPreview(
        await request(
          `/v1/source-acquisitions/${id}/table-preview?encoding=${encoding === "cp1252" ? "cp1252" : "utf-8-sig"}`,
        ),
      );
    } catch (reason) {
      setError(message(reason));
    }
  }
  async function exportUpload(record: UploadRecord) {
    try {
      const created = await post<{ id: string }>("/v1/exports", {
        selection: {
          schema_version: 1,
          snapshot_id: snapshotId,
          case_id: crypto.randomUUID(),
          revision: 1,
          question: `Selected private input: ${record.file_name}`,
          upload_ids: [record.upload_id],
          format: "bundle",
          include_original_bytes: true,
          limitations: [
            "Rights and scientific meaning are supplied by the researcher, without independent verification.",
          ],
        },
        confirmed_selected_private_data: true,
      });
      setExportId(created.id);
    } catch (reason) {
      setError(message(reason));
    }
  }
  return (
    <div className={styles.stack}>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={styles.status}>
          {notice}
        </p>
      )}
      <section className={styles.surface}>
        <h2>Private scientific inputs</h2>
        <p className={styles.caption}>
          Select only files you intend to process. Originals stay on the
          existing project host until deletion or expiry, separate from public
          NASA sources. No AI submission occurs here.
        </p>
        {profile.data && (
          <p className={styles.status}>
            {Math.round(profile.data.max_file_bytes / 1048576)} MiB per file ·
            resumable {Math.round(profile.data.chunk_bytes / 1048576)} MiB
            chunks · {profile.data.retention_hours}-hour expiry · processing:{" "}
            {profile.data.processing_location}
          </p>
        )}
        <div className={styles.fields}>
          <label className={`${styles.field} ${styles.full}`}>
            Selected file
            <input
              type="file"
              accept={profile.data?.supported_suffixes.join(",")}
              disabled={busy}
              onChange={(event) => choose(event.target.files?.[0] ?? null)}
            />
            <small>
              Supported:{" "}
              {profile.data?.supported_suffixes.join(", ") ??
                "loading format profile"}
            </small>
          </label>
          <label className={styles.field}>
            Intended use
            <select
              value={use}
              disabled={Boolean(pending)}
              onChange={(event) => setUse(event.target.value)}
            >
              {[
                "execution_input",
                "analysis",
                "evidence",
                "reproducibility",
              ].map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Explicit text encoding
            <select
              value={encoding}
              disabled={Boolean(pending)}
              onChange={(event) => setEncoding(event.target.value)}
            >
              {["utf-8-sig", "utf-8", "ascii", "cp1252"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            License / usage terms
            <textarea
              value={pending?.license ?? license}
              disabled={Boolean(pending)}
              onChange={(event) => setLicense(event.target.value)}
              required
            />
          </label>
          <label className={styles.field}>
            Your processing rights
            <textarea
              value={pending?.rights_assertion ?? rights}
              disabled={Boolean(pending)}
              onChange={(event) => setRights(event.target.value)}
              required
            />
          </label>
          <label className={`${styles.check} ${styles.full}`}>
            <input
              type="checkbox"
              checked={permission}
              disabled={Boolean(pending)}
              onChange={(event) => setPermission(event.target.checked)}
            />
            I permit inclusion of these selected original bytes in my research
            exports. This assertion is retained with the source.
          </label>
          <label className={`${styles.check} ${styles.full}`}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            I confirm this file, intended use, license and temporary processing
            on the stated project host.
          </label>
        </div>
        {pending && (
          <>
            <p>
              {pending.file_name} · {pending.received_bytes} /{" "}
              {pending.byte_size} bytes · {pending.status}
            </p>
            <progress
              className={styles.progress}
              max={pending.byte_size}
              value={pending.received_bytes}
              aria-label="Confirmed received bytes"
            />
            <p className={styles.caption}>
              Expires {new Date(pending.expiry).toLocaleString()} · SHA-256{" "}
              {pending.sha256}
            </p>
          </>
        )}
        <div className={styles.actions}>
          <button
            className="button button-primary"
            onClick={transfer}
            disabled={
              busy ||
              pending?.status === "ready" ||
              !file ||
              !consent ||
              (!pending && (!license.trim() || !rights.trim()))
            }
          >
            <Upload size={15} />
            {busy
              ? "Transferring selected bytes…"
              : pending
                ? "Resume exact file"
                : "Prepare and transfer"}
          </button>
          {busy && (
            <button className="button" onClick={() => abort.current?.abort()}>
              <Pause size={15} />
              Pause transfer
            </button>
          )}
          {pending && (
            <>
              <button
                className="button"
                onClick={finalize}
                disabled={
                  busy ||
                  pending.status !== "receiving" ||
                  pending.received_bytes !== pending.byte_size
                }
              >
                Submit and validate file
              </button>
              <button
                className="button"
                onClick={() => remove(pending.upload_id)}
                disabled={busy}
              >
                <Trash2 size={15} />
                Remove before submission
              </button>
            </>
          )}
          {pending?.status === "ready" && (
            <button
              className="button"
              onClick={() => {
                setPending(null);
                setFile(null);
                setConsent(false);
                setLicense("");
                setRights("");
              }}
            >
              Prepare another file
            </button>
          )}
          {file && !pending && (
            <button className="button" onClick={() => setFile(null)}>
              Remove selected file
            </button>
          )}
        </div>
        <h3>Temporary files owned by this browser</h3>
        {uploads.length === 0 ? (
          <p className={styles.muted}>
            No temporary files are available to this browser.
          </p>
        ) : (
          <ul className={styles.list}>
            {uploads.map((record) => (
              <li key={record.upload_id} className={styles.item}>
                <div className={styles.row}>
                  <strong>{record.file_name}</strong>
                  <span className={styles.badge}>{record.status}</span>
                </div>
                <p className={styles.caption}>
                  {record.byte_size} bytes · expires{" "}
                  {new Date(record.expiry).toLocaleString()} · user-asserted
                  rights
                </p>
                <div className={styles.actions}>
                  {record.status === "receiving" && (
                    <button
                      className="button button-small"
                      onClick={() => {
                        setPending(record);
                        setNotice(
                          "Reselect the exact original file to resume; the server-confirmed offset will be used.",
                        );
                      }}
                    >
                      Resume upload
                    </button>
                  )}
                  <button
                    className="button button-small"
                    disabled={record.status !== "ready"}
                    onClick={() =>
                      onInput({
                        id: record.upload_id,
                        kind: "upload",
                        name: record.file_name,
                        sha256: record.sha256,
                        byte_size: record.byte_size,
                        ready: true,
                        expires_at: record.expiry,
                        license: record.license,
                      })
                    }
                  >
                    <Plus size={14} />
                    Use in execution
                  </button>
                  <button
                    className="button button-small"
                    disabled={
                      record.status !== "ready" ||
                      !record.redistribution_allowed
                    }
                    onClick={() => exportUpload(record)}
                  >
                    <ArrowDownToLine size={14} />
                    Export selected original
                  </button>
                  <button
                    className="button button-small"
                    disabled={
                      record.status !== "ready" ||
                      !/[.](csv|txt|json|py|sh|md|rtf)$/i.test(record.file_name)
                    }
                    onClick={() => inspectOriginal(record)}
                  >
                    Inspect original text
                  </button>
                  <button
                    className="text-button"
                    onClick={() => remove(record.upload_id)}
                  >
                    Delete temporary original
                  </button>
                </div>
                <details>
                  <summary>License, intended use and format checks</summary>
                  <p>
                    {record.license} · {record.intended_use}
                  </p>
                  <pre>{JSON.stringify(record.validation, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={styles.surface}>
        <h2>Acquire exact PSI originals</h2>
        <p className={styles.caption}>
          A manifest lists available files; it does not imply that their bytes
          have been downloaded or scientific meaning qualified. Transfers use
          the existing worker and shared source cache.
        </p>
        <div className={styles.fields}>
          <label className={styles.field}>
            PSI investigation
            <select
              value={accession}
              onChange={(event) => {
                setAccession(event.target.value);
                setOffset(0);
              }}
            >
              {catalog.data?.items
                .filter((item) => isPsiAccession(item.accession))
                .map((item) => (
                  <option key={item.accession} value={item.accession}>
                    {item.acronym || item.accession}
                  </option>
                ))}
            </select>
          </label>
          <label className={styles.field}>
            Find in this manifest page
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="File name"
            />
          </label>
        </div>
        {manifest.loading ? (
          <div className={styles.skeleton} />
        ) : manifest.error ? (
          <p className={styles.error}>{manifest.error}</p>
        ) : (
          <div className={styles.table}>
            <table>
              <thead>
                <tr>
                  <th>Exact source file</th>
                  <th>Version / declared size</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {manifest.data?.items
                  .filter((item) =>
                    item.file_name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((item) => (
                    <tr key={item.key}>
                      <td>{item.file_name}</td>
                      <td>
                        v{item.version} · {item.declared_bytes ?? "unreported"}{" "}
                        bytes
                      </td>
                      <td>
                        <button
                          className="button button-small"
                          disabled={item.restricted || !item.declared_bytes}
                          onClick={() => acquire(item)}
                        >
                          <FilePlus2 size={14} />
                          Acquire selected file
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={styles.actions}>
          <button
            className="button button-small"
            disabled={offset === 0}
            onClick={() => setOffset((value) => Math.max(0, value - 50))}
          >
            Previous files
          </button>
          <span>
            {offset + 1}–{Math.min(offset + 50, manifest.data?.total ?? 0)} of{" "}
            {manifest.data?.total ?? "—"}
          </span>
          <button
            className="button button-small"
            disabled={offset + 50 >= (manifest.data?.total ?? 0)}
            onClick={() => setOffset((value) => value + 50)}
          >
            Next files
          </button>
        </div>
        {jobs.map((id) => (
          <div key={id} className={styles.item}>
            <JobMonitor id={id} onComplete={acquired} />
            <a
              className="button button-small"
              href={`/v1/source-acquisitions/${id}/content`}
            >
              <ArrowDownToLine size={14} />
              Download completed original
            </a>
            <button
              className="text-button"
              disabled={completed[id]?.status !== "succeeded"}
              onClick={() => inspectAcquired(id)}
            >
              Inspect completed CSV preview
            </button>
          </div>
        ))}
      </section>
      {preview && (
        <section className={styles.surface}>
          <h2>Acquired original CSV values</h2>
          <p className={styles.caption}>
            Encoding {preview.encoding} ·{" "}
            {preview.preview_status.replaceAll("_", " ")} · raw source records,
            without scientific normalization or inferred independent runs.
          </p>
          <div className={styles.table}>
            <table>
              <thead>
                <tr>
                  <th>Physical source lines</th>
                  {preview.headers.map((name, index) => (
                    <th key={index}>{name || `Column ${index + 1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, index) => (
                  <tr key={index}>
                    <th>
                      {row.source_row}
                      {row.line_end !== row.source_row
                        ? `–${row.line_end}`
                        : ""}
                    </th>
                    {row.raw_cells.map((cell, column) => (
                      <td key={column}>{cell || "Empty source cell"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {privateText && (
        <section className={styles.surface}>
          <h2>Private original: {privateText.name}</h2>
          <p className={styles.caption}>
            Explicit {privateText.encoding} decoding; no numeric normalization,
            scientific qualification or execution.
            {privateText.truncated &&
              " This one-MiB text preview is incomplete and may end inside a source record. The full original remains unchanged."}
          </p>
          <pre className={styles.output}>{privateText.text}</pre>
        </section>
      )}
      {exportId && <JobMonitor id={exportId} />}
    </div>
  );
}
