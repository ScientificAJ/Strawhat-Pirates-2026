ALTER TABLE jobs DROP CONSTRAINT jobs_kind_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_kind_check CHECK
    (kind IN ('export_flex', 'export_case', 'execute_code', 'research', 'registered_analysis'));
ALTER TABLE jobs DROP CONSTRAINT jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK
    (status IN ('queued', 'waiting_approval', 'running', 'succeeded', 'failed', 'canceled'));
ALTER TABLE jobs ADD COLUMN inputs jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE jobs ADD COLUMN inputs_sha256 char(64);
ALTER TABLE jobs ADD COLUMN idempotency_key text;
ALTER TABLE jobs ADD COLUMN approval jsonb;
ALTER TABLE jobs ADD COLUMN approval_revision integer NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN max_attempts integer NOT NULL DEFAULT 3;
CREATE UNIQUE INDEX jobs_idempotency ON jobs (receipt_sha256, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
ALTER TABLE job_events ADD COLUMN payload jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE job_steps (
    job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    step_key text NOT NULL,
    attempt integer NOT NULL,
    status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'uncertain')),
    result jsonb,
    provider_request_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (job_id, step_key)
);

CREATE TABLE private_artifacts (
    id uuid PRIMARY KEY,
    job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    operation_key text NOT NULL,
    sha256 char(64) NOT NULL,
    byte_size integer NOT NULL CHECK (byte_size >= 0 AND byte_size <= 16777216),
    media_type text NOT NULL,
    file_name text NOT NULL,
    provenance jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (job_id, operation_key)
);

CREATE TABLE execution_sessions (
    id uuid PRIMARY KEY,
    receipt_sha256 char(64) NOT NULL,
    snapshot_id char(64) NOT NULL REFERENCES snapshots(id),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'interrupted')),
    cell_count integer NOT NULL DEFAULT 0,
    cumulative_seconds double precision NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
    deadline timestamptz NOT NULL DEFAULT now() + interval '15 minutes'
);
