import type { Asset } from "./api";
import { isInvestigationId } from "./investigation-identifiers";

export type SourceMediaVisualization = {
  artifact_type: "source_media_visualization";
  status: "prepared";
  title: string;
  snapshot_id: string;
  asset: Asset;
  media_origin: "original_source_bytes";
  example_role?: string | null;
};

export function isSourceMediaVisualization(
  value: unknown,
): value is SourceMediaVisualization {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (
    !item.asset ||
    typeof item.asset !== "object" ||
    Array.isArray(item.asset)
  )
    return false;
  const asset = item.asset as Record<string, unknown>;
  return (
    item.artifact_type === "source_media_visualization" &&
    item.status === "prepared" &&
    item.media_origin === "original_source_bytes" &&
    typeof item.title === "string" &&
    typeof item.snapshot_id === "string" &&
    /^[a-f0-9]{64}$/.test(item.snapshot_id) &&
    typeof asset.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(asset.sha256) &&
    typeof asset.accession === "string" &&
    isInvestigationId(asset.accession) &&
    typeof asset.id === "string" &&
    typeof asset.file_name === "string" &&
    typeof asset.source_url === "string" &&
    typeof asset.investigation_version === "number" &&
    Number.isInteger(asset.investigation_version) &&
    asset.investigation_version > 0 &&
    ["image/jpeg", "image/png", "video/mp4"].includes(String(asset.media_type))
  );
}
