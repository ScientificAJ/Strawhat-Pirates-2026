export type BassFireIllustration = {
  artifact_type: "bass_fire_illustration";
  title: string;
  snapshot_id: string;
  accession: "PSI-25";
  asset_id: string;
  asset_sha256: string;
  source_row: number;
  conditions: { label: string; value: string }[];
};

/** Validate persisted and model-supplied artifacts before rendering. */
export function isBassFireIllustration(
  value: unknown,
): value is BassFireIllustration {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const digest = (input: unknown) =>
    typeof input === "string" && /^[a-f0-9]{64}$/.test(input);
  return (
    item.artifact_type === "bass_fire_illustration" &&
    item.accession === "PSI-25" &&
    typeof item.title === "string" &&
    item.title.length > 0 &&
    item.title.length <= 200 &&
    digest(item.snapshot_id) &&
    digest(item.asset_sha256) &&
    typeof item.asset_id === "string" &&
    item.asset_id.startsWith("PSI-25:") &&
    item.asset_id.length <= 512 &&
    Number.isSafeInteger(item.source_row) &&
    Number(item.source_row) > 0 &&
    Array.isArray(item.conditions) &&
    item.conditions.length <= 20 &&
    item.conditions.every((condition: unknown) => {
      if (
        !condition ||
        typeof condition !== "object" ||
        Array.isArray(condition)
      )
        return false;
      const pair = condition as Record<string, unknown>;
      return (
        typeof pair.label === "string" &&
        pair.label.length > 0 &&
        pair.label.length <= 200 &&
        typeof pair.value === "string" &&
        pair.value.length <= 2000
      );
    })
  );
}
