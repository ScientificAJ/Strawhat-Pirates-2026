"""Catalog identities are distinct from PSI repository accessions."""

from typing import Annotated

from pydantic import Field

PSI_ACCESSION_PATTERN = r"^PSI-[1-9][0-9]{0,5}$"
NASA_INVESTIGATION_PATTERN = r"^NASA-[A-Z][A-Z0-9-]{1,63}$"
INVESTIGATION_ID_PATTERN = r"^(?:PSI-[1-9][0-9]{0,5}|NASA-[A-Z][A-Z0-9-]{1,63})$"

Accession = Annotated[str, Field(pattern=PSI_ACCESSION_PATTERN)]
InvestigationId = Annotated[str, Field(pattern=INVESTIGATION_ID_PATTERN)]
