import { isInvestigationId } from "../../../lib/investigation-identifiers";
import { ResearchWorkspace } from "../../../components/research-workspace";
import { notFound } from "next/navigation";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<{
    q?: string;
    intent?: string;
    snapshot?: string;
    ids?: string;
  }>;
}) {
  const { segments = [] } = await params;
  const { q = "", intent, snapshot, ids } = await searchParams;
  const section = segments[0] ?? "overview";
  if (
    segments.length > 3 ||
    ![
      "overview",
      "investigations",
      "compare",
      "lab",
      "agent",
      "agents",
      "cases",
      "help",
      "runs",
      "dashboards",
      "jobs",
      "settings",
      "coverage",
      "stewardship",
      "learning",
    ].includes(section)
  )
    notFound();
  if (segments.length > 2 && section !== "lab") notFound();
  if (
    section === "lab" &&
    segments[1] &&
    ![
      "data",
      "scenarios",
      "models",
      "evidence",
      "code",
      "media",
      "uploads",
      "inputs",
      "dashboards",
    ].includes(segments[1])
  )
    notFound();
  if (snapshot && !/^[a-f0-9]{64}$/.test(snapshot)) notFound();
  if (intent && !/^[a-f0-9-]{36}$/.test(intent)) notFound();
  return (
    <ResearchWorkspace
      section={section}
      entityId={segments[1]}
      detailId={segments[2]}
      initialQuery={q}
      intentId={intent}
      requestedSnapshot={snapshot}
      investigationIds={ids?.split(",").filter(isInvestigationId)}
    />
  );
}
