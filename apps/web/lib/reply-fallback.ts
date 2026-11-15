import { isSourceMediaVisualization } from "./source-media";
import { object, records } from "./studio-session";

/** Recover useful views from older saved replies that predate retained-evidence answers. */
export function retainedReplyView(
  result: unknown,
  question: string,
  snapshotId: string,
) {
  const facts = records(object(result).facts);
  const normalizedQuestion = question.toLowerCase().replace(/[^a-z0-9]/g, "");
  const dossiers = facts.filter(
    (fact) => fact.label === "Investigation dossier",
  );
  const source =
    dossiers.find((fact) => {
      const acronym = String(object(fact.content).acronym ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      return acronym && normalizedQuestion.includes(acronym);
    }) ?? dossiers[0];
  const content = object(source?.content);
  const title = String(content.acronym || content.title || "");
  const passage = String(content.description || content.objective || "").split(
    /\n\s*\n/,
  )[0];
  const excerpt =
    passage.length > 1000 ? passage.slice(0, 1000) + "…" : passage;
  const asset = records(content.assets).find(
    (item) =>
      ["image/jpeg", "image/png", "video/mp4"].includes(
        String(item.media_type),
      ) && item.license === "CC0-1.0",
  );
  const originalMediaRequested =
    /\b(photo(?:graph)?|video|footage)\b/i.test(question) ||
    (/\bimage\b/i.test(question) &&
      !/\b(generate|create|draw|illustrate|simulate)\b/i.test(question));
  const visual =
    asset && originalMediaRequested
      ? {
          artifact_type: "source_media_visualization",
          status: "prepared",
          title: `${title || asset.accession} · NASA ${String(asset.media_type).startsWith("video/") ? "video" : "image"}`,
          snapshot_id: snapshotId,
          asset,
          media_origin: "original_source_bytes",
          example_role: asset.example_role,
        }
      : null;
  return {
    source,
    title,
    excerpt,
    visual: isSourceMediaVisualization(visual) ? visual : null,
  };
}
