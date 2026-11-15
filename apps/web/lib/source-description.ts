import type { Asset, Investigation } from "./api";
import { isNasaInvestigationId } from "./investigation-identifiers";

export function isPublishedTranscription(asset: Pick<Asset, "origin">) {
  return (
    asset.origin === "published_table_transcription" ||
    asset.origin === "planned_conditions"
  );
}

export function assetSourceLabel(asset: Pick<Asset, "origin">) {
  if (asset.origin === "planned_conditions")
    return "Planned conditions transcribed from NASA";
  return isPublishedTranscription(asset)
    ? "Table transcribed from a NASA publication"
    : "Retained source file";
}

export function datasetLabel(asset: Pick<Asset, "file_name" | "origin">) {
  if (asset.origin === "planned_conditions") return "Planned test conditions";
  if (/thin-fuel-results\.csv$/.test(asset.file_name))
    return "Thin-fuel flame geometry";
  if (/saffire-.*-results\.csv$/.test(asset.file_name))
    return "Calorimetry, temperature and gas results";
  if (/saffire-.*-conditions\.csv$/.test(asset.file_name))
    return (
      "Experimental conditions · " +
      (asset.file_name.includes("iv-v-vi") ? "2024 report" : "2021 report")
    );
  if (/luci-pmma/.test(asset.file_name)) return "PMMA flame-tip fit";
  if (/luci-sibal/.test(asset.file_name))
    return "SIBAL flame-base and tip fits";
  if (/gel-.*table-1/.test(asset.file_name))
    return "GEL extinction conditions and heat loss";
  return asset.file_name;
}

export function investigationAvailability(
  item: Pick<Investigation, "accession" | "record_type" | "data_status"> & {
    asset_count?: number;
  },
) {
  if (item.record_type === "program")
    return "Research program · explore its studies and sources";
  if (item.data_status === "reported_measurements")
    return "Published measurement tables and NASA sources";
  if (item.data_status === "reported_conditions")
    return "Published experimental conditions and NASA sources";
  if (isNasaInvestigationId(item.accession))
    return "NASA research description and cited sources";
  return item.asset_count
    ? `${item.asset_count} source files to explore`
    : "NASA catalog record · original data not yet available here";
}
