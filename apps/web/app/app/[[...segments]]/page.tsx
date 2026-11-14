import { ResearchWorkspace } from "../../../components/research-workspace";
import { notFound } from "next/navigation";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { segments = [] } = await params;
  const { q = "" } = await searchParams;
  if (
    segments.length > 2 ||
    (segments[0] &&
      !["investigations", "compare", "lab", "agent", "cases", "help"].includes(
        segments[0],
      ))
  )
    notFound();
  if (
    segments[0] === "lab" &&
    segments[1] &&
    !["data", "scenarios", "models", "evidence"].includes(segments[1])
  )
    notFound();
  return (
    <ResearchWorkspace
      section={segments[0] ?? "overview"}
      entityId={segments[1]}
      initialQuery={q}
    />
  );
}
