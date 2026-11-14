# Implementation decisions

## 14 November 2026 — First local research case

Question: which test-end labels occur in the published FLEX experimental table,
and which scientific interpretations does that table support?

The input is PSI-69 investigation version 5, experimental-table file version 1,
DOI `10.60555/mbq8-0451`. The planning audit records 274 data rows: 186
Extinction, 61 Disruption and 27 Completion. These are independently specified
regression expectations to check against the newly retrieved source, not values
to populate an application response. The application must calculate the counts
from the preserved CSV and return the actual source rows and checksum.

The first result is a description of source labels. It does not establish a
probability, independence of all rows, a physical definition of extinction, or
a cabin suppression requirement. Ambiguous species and the burning-rate header
remain unresolved until the relevant protocol supports normalization.

The comparison workflow must expose differences and unavailable conditions.
Matching terms in investigation metadata does not establish compatible runs.

## 14 November 2026 — Local runtime boundary

Use the documented Python 3.13 and Node.js 24 runtimes, a local PostgreSQL 17
database with pgvector, Next.js and FastAPI. The database and application bind
to loopback. PostgreSQL also owns the local trusted-worker job queue.
Scientific source bytes and database files remain separate.

This environment supports development. OpenAI setup waits for the owner's
decision at W11, and selecting or enabling hosting waits for W19. Interactive
Python and shell remain unavailable until the distinct gVisor execution
boundary has been implemented and tested; ordinary worker jobs cannot execute
user-supplied commands.

The development database uses a documented loopback-only fixture password.
It is not a public-deployment credential. Local setup does not configure
provider keys, cloud resources, user accounts, or paid services.
