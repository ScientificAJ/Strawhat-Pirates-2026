"use client";
import { useEffect, useRef, useState } from "react";
import { useResearchContext } from "../lib/research-context";
import { request } from "../lib/api";
import { useRouter } from "next/navigation";
import { sourceImage } from "../lib/studio-session";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Save,
  Scan,
} from "lucide-react";
import {
  useResource,
  type Asset,
  type Catalog,
  type Dossier,
} from "../lib/api";
import {
  message,
  methodContext,
  post,
  type Job,
  type ValidatedChart,
} from "../lib/laboratory-api";
import { readDocument, saveDocument } from "../lib/workspace-documents";
import {
  ScientificMethodFields,
  emptyMethodValue,
  resolveSchema,
  type MethodSchema,
} from "./scientific-method-form";
import { JobMonitor } from "./job-monitor";
import { ScientificResult } from "./scientific-result";
import { ScientificChart } from "./scientific-chart";
import styles from "./laboratory-workbench.module.css";

type Region = { left: number; top: number; right: number; bottom: number };
type Frame = {
  png_sha256: string;
  reported_pts_time: string | null;
  source_width?: number;
  source_height?: number;
  source_stream?: { width?: number; height?: number };
  frame_index: number;
  frame_count: number;
};
export function MediaWorkbench({
  snapshotId,
  entityId,
  sourceChart,
}: {
  snapshotId: string;
  entityId?: string;
  sourceChart?: ValidatedChart | null;
}) {
  const router = useRouter();
  const catalog = useResource<Catalog>(
    `/v1/investigations?limit=100&snapshot_id=${snapshotId}`,
  );
  const { context } = useResearchContext();
  const [accession, setAccession] = useState(
    context?.investigations?.[0] ?? "",
  );
  const dossier = useResource<Dossier>(
    accession
      ? `/v1/investigations/${accession}?snapshot_id=${snapshotId}`
      : null,
  );
  const [assetId, setAssetId] = useState("");
  const assets =
    dossier.data?.assets?.filter(
      (item) =>
        item.media_type.startsWith("image/") ||
        item.media_type.startsWith("video/"),
    ) ?? [];
  const asset = assets.find((item) => item.sha256 === assetId) ?? assets[0];
  const [frameIndex, setFrameIndex] = useState(0);
  const [showFrame, setShowFrame] = useState(false);
  const [clock, setClock] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [interval, setInterval] = useState({ start: "", end: "" });
  const [offset, setOffset] = useState("");
  const [syncReference, setSyncReference] = useState("");
  const [syncState, setSyncState] = useState("unaligned");
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 });
  const [region, setRegion] = useState<Region | null>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [annotations, setAnnotations] = useState(true);
  const [author, setAuthor] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [measurement, setMeasurement] = useState<Record<string, unknown>>({});
  const [trace, setTrace] = useState<Record<string, unknown>>({});
  const [pixel, setPixel] = useState("");
  const [pointTime, setPointTime] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [traceJob, setTraceJob] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [traceChart, setTraceChart] = useState<ValidatedChart | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const requestedPlay = useRef(false);
  const [id, setId] = useState(entityId);
  const [revision, setRevision] = useState<number | undefined>();
  const selector = asset
    ? `snapshot_id=${snapshotId}&accession=${accession}&asset_id=${encodeURIComponent(asset.id)}`
    : "";
  const isVideo = asset?.media_type.startsWith("video/") ?? false;
  const frame = useResource<Frame>(
    isVideo && asset && showFrame
      ? `/v1/assets/${asset.sha256}/frames/${frameIndex}?${selector}`
      : null,
  );
  const metadata = useResource<Record<string, unknown>>(
    asset ? `/v1/assets/${asset.sha256}/media?${selector}` : null,
  );
  const methods = useResource<{
    methods: { id: string; schema: MethodSchema }[];
  }>("/v1/methods");
  const imageRoot = methods.data?.methods.find(
    (item) => item.id === "image-roi",
  )?.schema;
  const imageSchema = imageRoot?.properties?.measurement;
  const traceRoot = methods.data?.methods.find(
    (item) => item.id === "pixel-trace",
  )?.schema;
  useEffect(() => {
    setAssetId("");
    setFrameIndex(0);
    setShowFrame(false);
    setRegion(null);
    setResult(null);
  }, [accession]);
  useEffect(() => {
    if (!asset) return;
    const context = {
      ...methodContext(
        snapshotId,
        asset.accession,
        `Original asset ${asset.id}`,
        "measured",
      ),
      sources: [
        {
          source_id: asset.accession,
          locator: `Original asset ${asset.id}`,
          asset_sha256: asset.sha256,
        },
      ],
    };
    if (imageSchema && imageRoot)
      setMeasurement({
        ...(emptyMethodValue(imageSchema, imageRoot) as Record<
          string,
          unknown
        >),
        expected_sha256: asset.sha256,
        context,
      });
    if (traceRoot)
      setTrace({
        ...(emptyMethodValue(traceRoot, traceRoot) as Record<string, unknown>),
        points: [],
        context,
      });
  }, [asset?.sha256, imageRoot, imageSchema, traceRoot, snapshotId]);
  useEffect(() => {
    if (entityId && /^[a-f0-9]{64}$/.test(entityId)) {
      void request<{ asset: Asset }>(
        `/v1/assets/${entityId}/media?snapshot_id=${snapshotId}`,
      )
        .then((value) => {
          setAccession(value.asset.accession);
          setAssetId(entityId);
        })
        .catch((reason) => setError(message(reason)));
      return;
    }
    if (entityId)
      void readDocument<Record<string, unknown>>(entityId)
        .then((doc) => {
          if (doc) {
            setId(doc.id);
            setRevision(doc.revision);
            if (typeof doc.data.accession === "string")
              setAccession(doc.data.accession);
            if (typeof doc.data.source_sha256 === "string")
              setAssetId(doc.data.source_sha256);
            if (typeof doc.data.note === "string") setNote(doc.data.note);
            if (typeof doc.data.author === "string") setAuthor(doc.data.author);
            if (doc.data.region && typeof doc.data.region === "object")
              setRegion(doc.data.region as Region);
          }
        })
        .catch((reason) => setError(message(reason)));
  }, [entityId]);
  function coordinate(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const scale = Math.min(
      box.width / dimensions.width,
      box.height / dimensions.height,
    );
    const width = dimensions.width * scale,
      height = dimensions.height * scale;
    return {
      x: Math.max(
        0,
        Math.min(
          dimensions.width,
          (event.clientX - box.left - (box.width - width) / 2) / scale,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          dimensions.height,
          (event.clientY - box.top - (box.height - height) / 2) / scale,
        ),
      ),
    };
  }
  function finishRegion(event: React.PointerEvent<HTMLDivElement>) {
    if (!start) return;
    const end = coordinate(event);
    const roi = {
      left: Math.floor(Math.min(start.x, end.x)),
      top: Math.floor(Math.min(start.y, end.y)),
      right: Math.ceil(Math.max(start.x, end.x)),
      bottom: Math.ceil(Math.max(start.y, end.y)),
    };
    setRegion(roi);
    setMeasurement((previous) => ({ ...previous, roi }));
    setStart(null);
  }
  async function sendRegion() {
    try {
      if (
        !asset ||
        !region ||
        !image.current?.complete ||
        image.current.naturalWidth === 0
      )
        throw new Error(
          "Freeze and select an original source image/frame before attaching a region.",
        );
      const width = region.right - region.left,
        height = region.bottom - region.top;
      if (width <= 0 || height <= 0 || width * height > 8000000)
        throw new Error(
          "Select a positive bounded region without rescaling the source pixels.",
        );
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const drawing = canvas.getContext("2d");
      if (!drawing)
        throw new Error("Image cropping is unavailable in this browser.");
      drawing.drawImage(
        image.current,
        region.left,
        region.top,
        width,
        height,
        0,
        0,
        width,
        height,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(
                  new Error("The exact selected pixels could not be retained."),
                ),
          "image/png",
        ),
      );
      const source = {
        snapshot_id: snapshotId,
        accession,
        asset_id: asset.id,
        asset_sha256: asset.sha256,
        frame_index: isVideo ? frameIndex : 0,
        roi: region,
        transform: "exact_integer_pixel_crop_no_rescale",
      };
      const prompt = `Inspect this explicitly selected region from ${asset.accession}, original ${asset.sha256}, frame ${isVideo ? frameIndex : 0}, pixel bounds ${JSON.stringify(region)}. No physical calibration, temperature or scientific interpretation is established by the pixels alone.`;
      const selected = await sourceImage(
        new File([blob], "selected-source-region.png", { type: "image/png" }),
        prompt,
      );
      const intent = await saveDocument({
        kind: "studio_intent",
        title: "Selected source region",
        snapshot_id: snapshotId,
        data: {
          question: prompt,
          snapshot_id: snapshotId,
          investigations: [accession],
          anchors: [
            {
              snapshot_id: snapshotId,
              source_kind: "psi",
              accession,
              investigation_version: asset.investigation_version,
              source_sha256: asset.sha256,
              asset_id: asset.id,
              kind: "media_frame",
              frame: isVideo ? frameIndex : 0,
            },
          ],
          image: selected,
          image_name: "selected-source-region.png",
          image_source: source,
          image_consented: false,
        },
      });
      router.push(`/app/agent?intent=${encodeURIComponent(intent.id)}`);
    } catch (reason) {
      setError(message(reason));
    }
  }
  async function measure() {
    if (!asset) return;
    try {
      const expected = isVideo ? frame.data?.png_sha256 : asset.sha256;
      if (!expected)
        throw new Error(
          "Freeze the exact original frame before measuring its pixels.",
        );
      const job = await post<{ id: string }>("/v1/media/measure", {
        snapshot_id: snapshotId,
        source_sha256: asset.sha256,
        accession,
        asset_id: asset.id,
        frame_index: isVideo ? frameIndex : null,
        measurement: {
          ...measurement,
          expected_sha256: expected,
          roi: region ?? measurement.roi,
        },
      });
      setJobId(job.id);
    } catch (reason) {
      setError(message(reason));
    }
  }
  async function save() {
    try {
      const doc = await saveDocument(
        {
          id,
          kind: "analysis",
          title: `${asset?.file_name ?? "Media"} annotations`,
          snapshot_id: snapshotId,
          data: {
            surface: "media",
            accession,
            asset_id: asset?.id,
            source_sha256: asset?.sha256,
            frame_index: frameIndex,
            clock,
            region,
            author,
            note,
            sync_state: syncState,
            sync_reference: syncReference,
            offset,
            interval,
            measurement,
            trace,
            result,
          },
        },
        revision,
      );
      setId(doc.id);
      setRevision(doc.revision);
      setNotice(
        "Annotation, original source and calibration revision saved locally.",
      );
    } catch (reason) {
      setError(message(reason));
    }
  }
  function completed(job: Job) {
    if (job.result) {
      let value: Record<string, unknown> = job.result;
      if (value.result && typeof value.result === "object")
        value = value.result as Record<string, unknown>;
      if (value.measurement && typeof value.measurement === "object")
        value = value.measurement as Record<string, unknown>;
      setResult(value);
    }
  }
  function addPoint() {
    if (!asset || pixel === "" || pointTime === "") return;
    setTrace((previous) => ({
      ...previous,
      points: [
        ...(Array.isArray(previous.points) ? previous.points : []),
        {
          source_locator: `${asset.sha256}:frame:${frameIndex}`,
          source_sha256: asset.sha256,
          pixel_value: Number(pixel),
          time_seconds: Number(pointTime),
          exclude_reason: null,
        },
      ],
    }));
    setNotice(
      "Original pixel/time point added. Calibration and source-clock justification remain required.",
    );
  }
  async function calibrate() {
    try {
      const job = await post<{ id: string }>("/v1/media/pixel-trace", {
        request: trace,
      });
      setTraceJob(job.id);
    } catch (reason) {
      setError(message(reason));
    }
  }
  const boundary = Array.isArray(result?.boundary_pixels)
    ? (result.boundary_pixels as { x: number; y: number }[])
    : [];
  const mediaUrl = asset ? `/v1/assets/${asset.sha256}/raw?${selector}` : "";
  const imageUrl =
    asset && isVideo
      ? `/v1/assets/${asset.sha256}/frames/${frameIndex}/image?${selector}`
      : mediaUrl;
  const rawPoints =
    sourceChart && "query" in sourceChart.spec ? sourceChart.data.values : [];
  const sensorTime =
    syncState !== "unaligned" && offset !== "" ? clock + Number(offset) : null;
  return (
    <div className={styles.stack}>
      <section className={styles.surface}>
        <div className={styles.row}>
          <div>
            <h2>Source media and calibrated measurements</h2>
            <p className={styles.caption}>
              Original pixels remain available. Playback starts only on your
              request; physical scales and clock synchronization require their
              own evidence.
            </p>
          </div>
          {asset && (
            <button className="button" onClick={save}>
              <Save size={15} />
              Save annotations
            </button>
          )}
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className={styles.status} role="status">
            {notice}
          </p>
        )}
        <div className={styles.fields}>
          <label className={styles.field}>
            Investigation
            <select
              value={accession}
              onChange={(event) => setAccession(event.target.value)}
            >
              <option value="">Choose an investigation…</option>
              {catalog.data?.items.map((item) => (
                <option value={item.accession} key={item.accession}>
                  {item.acronym || item.accession} — {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Original media
            <select
              value={asset?.sha256 ?? ""}
              disabled={!assets.length}
              onChange={(event) => {
                setAssetId(event.target.value);
                setRegion(null);
                setShowFrame(false);
              }}
            >
              {!assets.length && (
                <option value="">
                  {accession
                    ? "No retained media"
                    : "Choose an investigation first"}
                </option>
              )}
              {assets.map((item) => (
                <option key={item.id} value={item.sha256}>
                  {item.file_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!asset ? (
          <div className={styles.empty}>
            <h3>
              Choose an investigation to inspect its images and recordings
            </h3>
            <p>
              Start with an investigation relevant to your question. You can
              view its retained NASA media and, where calibration supports it,
              measure a flame or droplet.
            </p>
          </div>
        ) : (
          <>
            <div
              className={styles.mediaStage}
              onPointerDown={(event) => {
                if (
                  (!isVideo || showFrame) &&
                  image.current?.complete &&
                  image.current.naturalWidth > 0
                ) {
                  setStart(coordinate(event));
                  event.currentTarget.setPointerCapture(event.pointerId);
                }
              }}
              onPointerUp={finishRegion}
              onPointerCancel={() => setStart(null)}
            >
              {isVideo && !showFrame ? (
                <video
                  ref={video}
                  className={styles.media}
                  controls
                  preload="metadata"
                  src={mediaUrl}
                  onLoadedMetadata={(event) => {
                    const player = event.currentTarget;
                    setDimensions({
                      width: player.videoWidth,
                      height: player.videoHeight,
                    });
                    player.currentTime = clock;
                    player.playbackRate = speed;
                    if (requestedPlay.current) {
                      requestedPlay.current = false;
                      void player
                        .play()
                        .catch(() =>
                          setError(
                            "Playback could not start; use the native controls.",
                          ),
                        );
                    }
                  }}
                  onTimeUpdate={(event) =>
                    setClock(event.currentTarget.currentTime)
                  }
                />
              ) : (
                <img
                  ref={image}
                  draggable={false}
                  onError={() =>
                    setError(
                      "This original media could not be decoded in this browser. Inspect its format evidence or download the retained original; no conversion was inferred.",
                    )
                  }
                  className={styles.media}
                  src={imageUrl}
                  alt={`${asset.file_name}${isVideo ? `, exact source frame ${frameIndex}` : ""}`}
                  onLoad={(event) =>
                    setDimensions({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    })
                  }
                />
              )}{" "}
              {annotations && (region || boundary.length > 0) && (
                <svg
                  className={styles.overlay}
                  viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
                  aria-label="Separate source-pixel annotation layer"
                >
                  {region && (
                    <rect
                      className={styles.annotation}
                      x={region.left}
                      y={region.top}
                      width={region.right - region.left}
                      height={region.bottom - region.top}
                    />
                  )}{" "}
                  {boundary.map((point, index) => (
                    <circle
                      key={index}
                      cx={point.x}
                      cy={point.y}
                      r={1}
                      fill="#F06449"
                    />
                  ))}
                </svg>
              )}
            </div>
            {isVideo && (
              <>
                <div className={styles.actions}>
                  <button
                    className="button"
                    onClick={() => {
                      requestedPlay.current = true;
                      setShowFrame(false);
                      void video.current
                        ?.play()
                        .catch(() =>
                          setError(
                            "Playback could not start. Use the native media controls.",
                          ),
                        );
                    }}
                  >
                    <Play size={15} />
                    Play
                  </button>
                  <button
                    className="button"
                    onClick={() => video.current?.pause()}
                  >
                    <Pause size={15} />
                    Pause
                  </button>
                  <label className={styles.field}>
                    Playback speed
                    <select
                      value={speed}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setSpeed(value);
                        if (video.current) video.current.playbackRate = value;
                      }}
                    >
                      {[0.25, 0.5, 1, 1.5, 2].map((value) => (
                        <option key={value} value={value}>
                          {value}×
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    Media time (seconds)
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={clock}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setClock(value);
                        if (video.current) video.current.currentTime = value;
                      }}
                    />
                  </label>
                </div>
                <div className={styles.inline}>
                  <button
                    className="button"
                    disabled={frameIndex === 0}
                    onClick={() => {
                      setShowFrame(true);
                      setFrameIndex((value) => Math.max(0, value - 1));
                    }}
                    aria-label="Previous original frame"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <label className={styles.field}>
                    Exact original frame index
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={frameIndex}
                      onChange={(event) =>
                        setFrameIndex(Number(event.target.value))
                      }
                    />
                  </label>
                  <button
                    className="button"
                    onClick={() => {
                      setShowFrame(true);
                      setFrameIndex((value) => value + 1);
                    }}
                    aria-label="Next original frame"
                  >
                    <ChevronRight size={15} />
                  </button>
                  <button
                    className="button"
                    onClick={() => {
                      video.current?.pause();
                      setShowFrame(true);
                    }}
                  >
                    Freeze indexed frame
                  </button>
                  <button
                    className="button"
                    onClick={() => setShowFrame(false)}
                  >
                    Return to original video
                  </button>
                </div>
                {frame.error && <p className={styles.error}>{frame.error}</p>}
                {frame.data && showFrame && (
                  <p className={styles.caption}>
                    Frame {frameIndex} of {frame.data.frame_count} · original
                    reported PTS time{" "}
                    {frame.data.reported_pts_time ?? "unavailable"}. PTS is not
                    an automatically synchronized sensor clock.
                  </p>
                )}
              </>
            )}
            <button
              className="button button-small"
              disabled={!region || (isVideo && !showFrame)}
              onClick={sendRegion}
            >
              Ask about this region
            </button>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={annotations}
                onChange={(event) => setAnnotations(event.target.checked)}
              />
              Show separate annotations and derived boundaries
            </label>
            <p className={styles.caption}>
              Drag across a paused image/frame to select an original-pixel
              region, or enter its bounds in the measurement form. Original
              dimensions {dimensions.width} × {dimensions.height} pixels.
            </p>
            <div className={styles.fields}>
              <label className={styles.field}>
                Annotation author (optional)
                <input
                  value={author}
                  onChange={(event) => setAuthor(event.target.value)}
                  placeholder="Name or initials"
                />
              </label>
              <label className={styles.field}>
                Source-check / mask correction notes
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                Selected interval start (s)
                <input
                  type="number"
                  step="any"
                  value={interval.start}
                  onChange={(event) =>
                    setInterval({ ...interval, start: event.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                Selected interval end (s)
                <input
                  type="number"
                  step="any"
                  value={interval.end}
                  onChange={(event) =>
                    setInterval({ ...interval, end: event.target.value })
                  }
                />
              </label>
            </div>
            <details className={styles.details}>
              <summary>Original media metadata and timing evidence</summary>
              <pre className={styles.output}>
                {JSON.stringify(metadata.data, null, 2)}
              </pre>
            </details>
          </>
        )}
      </section>
      {asset && (
        <details className={styles.surface}>
          <summary>
            <strong>Align media with sensor measurements</strong>
          </summary>
          <div className={styles.fields}>
            <label className={styles.field}>
              Alignment state
              <select
                value={syncState}
                onChange={(event) => setSyncState(event.target.value)}
              >
                <option value="unaligned">Unaligned</option>
                <option value="estimated">Estimated alignment</option>
                <option value="aligned">Source-documented alignment</option>
              </select>
            </label>
            <label className={styles.field}>
              Sensor time minus media time (s)
              <input
                type="number"
                step="any"
                value={offset}
                onChange={(event) => setOffset(event.target.value)}
              />
            </label>
            <label className={`${styles.field} ${styles.full}`}>
              Clock / synchronization source
              <input
                value={syncReference}
                onChange={(event) => setSyncReference(event.target.value)}
              />
            </label>
          </div>
          {syncState !== "unaligned" && (!syncReference || offset === "") && (
            <p className={styles.warning}>
              A declared offset and synchronization source are required before
              interpreting a shared cursor.
            </p>
          )}
          {sensorTime !== null && syncReference && (
            <p className={styles.status}>
              Media cursor {clock} s → sensor cursor {sensorTime} s ·{" "}
              {syncState}. Original timestamp samples: {rawPoints.length}; no
              interpolation was applied.
            </p>
          )}
          {sourceChart && (
            <ScientificChart
              chart={sourceChart}
              cursor={
                sensorTime !== null &&
                Boolean(syncReference) &&
                "query" in sourceChart.spec &&
                sourceChart.spec.x_unit === "s" &&
                sourceChart.spec.x_scale === "linear"
                  ? { value: sensorTime, label: "Documented sensor cursor (s)" }
                  : undefined
              }
            />
          )}
        </details>
      )}
      {asset && imageRoot && imageSchema && (
        <section className={styles.surface}>
          <h2>Registered image-region measurement</h2>
          <p className={styles.caption}>
            Inspect threshold masks and original frames. Missing calibration or
            independent segmentation references retain a proposal rather than a
            validated physical measurement. Ordinary RGB color is not a
            thermometer.
          </p>
          <ScientificMethodFields
            schema={imageSchema}
            root={imageRoot}
            value={measurement}
            onChange={(value) => {
              const next = value as Record<string, unknown>;
              setMeasurement(next);
              if (next.roi && typeof next.roi === "object")
                setRegion(next.roi as Region);
            }}
            label="Measurement definition, calibration and mask"
          />
          <button className="button button-primary" onClick={measure}>
            <Scan size={15} />
            Measure selected original pixels
          </button>
          {jobId && <JobMonitor id={jobId} onComplete={completed} />}
          {result && <ScientificResult value={result} />}
        </section>
      )}
      {asset && traceRoot && (
        <section className={styles.surface}>
          <h2>Pixel-to-physical track</h2>
          <div className={styles.inline}>
            <label className={styles.field}>
              Original selected pixel coordinate / size
              <input
                type="number"
                step="any"
                value={pixel}
                onChange={(event) => setPixel(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              Documented point time (s)
              <input
                type="number"
                step="any"
                value={pointTime}
                onChange={(event) => setPointTime(event.target.value)}
              />
            </label>
            <button
              className="button"
              disabled={pixel === "" || pointTime === ""}
              onClick={addPoint}
            >
              Add selected source point
            </button>
          </div>
          <ScientificMethodFields
            schema={traceRoot}
            root={traceRoot}
            value={trace}
            onChange={(value) => setTrace(value as Record<string, unknown>)}
            label="Track points, spatial calibration and source clock"
          />
          <button className="button button-primary" onClick={calibrate}>
            Calibrate selected track
          </button>
          {traceJob && (
            <>
              <JobMonitor id={traceJob} />
              <button
                className="button"
                onClick={() =>
                  void post<ValidatedChart>("/v1/charts/method", {
                    title: "Source-bound calibrated track",
                    job_ids: [traceJob],
                    view: "track",
                    x_scale: "linear",
                    y_scale: "linear",
                  })
                    .then(setTraceChart)
                    .catch((reason) => setError(message(reason)))
                }
              >
                Inspect calibrated / candidate track
              </button>
            </>
          )}
          {traceChart && <ScientificChart chart={traceChart} />}
        </section>
      )}
    </div>
  );
}
