"use client";

import dynamic from "next/dynamic";
import { useId, useRef, useState } from "react";
import { Box } from "lucide-react";

const DropletSimulation = dynamic(
  () =>
    import("./droplet-simulation").then((module) => module.DropletSimulation),
  {
    loading: () => <p role="status">Opening the optional visualization…</p>,
  },
);

/** Relevant investigation pages offer an explicit, initially closed entry. */
export function SimulationLauncher({
  accession,
  snapshotId,
}: {
  accession: string;
  snapshotId: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  if (!["PSI-69", "PSI-68"].includes(accession)) return null;
  return (
    <section className="analysis-surface">
      <h2>Model this droplet experiment</h2>
      <p className="reading-text">
        {accession === "PSI-69"
          ? "Build a source-parameterized model from the retained FLEX-007 test sheet, or explore your own diameter and burning-constant assumptions."
          : "Explore droplet evolution with the classical D² law, using an explicit initial diameter and burning constant alongside this investigation."}
      </p>
      <button
        ref={trigger}
        className="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <Box size={17} />
        {open ? "Close simulation" : "Open simulation"}
      </button>
      {open && (
        <div id={panelId}>
          <DropletSimulation
            accession={accession}
            snapshotId={snapshotId}
            onClose={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
          />
        </div>
      )}
    </section>
  );
}
