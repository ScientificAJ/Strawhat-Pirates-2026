/** Catalog identities include PSI accessions and separately named NASA research records. */
export function isPsiAccession(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    /^PSI-[1-9][0-9]{0,5}$/.test(value)
  );
}

export function isNasaInvestigationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    /^NASA-[A-Z][A-Z0-9-]{1,63}$/.test(value)
  );
}

export function isInvestigationId(value: unknown): value is string {
  return isPsiAccession(value) || isNasaInvestigationId(value);
}

export function investigationSourceKind(value: unknown): "psi" | "nasa" | null {
  if (isPsiAccession(value)) return "psi";
  if (isNasaInvestigationId(value)) return "nasa";
  return null;
}
