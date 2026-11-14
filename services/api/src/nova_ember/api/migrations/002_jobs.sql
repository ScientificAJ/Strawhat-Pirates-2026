CREATE TABLE jobs (
    id uuid PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('export_flex')),
    snapshot_id char(64) NOT NULL REFERENCES snapshots(id),
    receipt_sha256 char(64) NOT NULL,
    status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
    attempt integer NOT NULL DEFAULT 0,
    lease_until timestamptz,
    result jsonb,
    error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);

CREATE TABLE job_events (
    job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    sequence integer NOT NULL,
    attempt integer NOT NULL,
    event_type text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (job_id, sequence)
);

CREATE INDEX jobs_queue ON jobs (created_at) WHERE status IN ('queued', 'running');
