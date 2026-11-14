CREATE TABLE model_usage_reservations (
    id uuid PRIMARY KEY,
    job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
    amount_usd numeric(12,6) NOT NULL CHECK (amount_usd >= 0),
    settled_usd numeric(12,6),
    status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'uncertain')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX model_usage_daily ON model_usage_reservations(created_at);

CREATE TABLE semantic_documents (
    snapshot_id char(64) NOT NULL REFERENCES snapshots(id),
    source_id text NOT NULL,
    content_sha256 char(64) NOT NULL,
    model text NOT NULL,
    dimensions integer NOT NULL CHECK (dimensions = 1536),
    embedding vector(1536) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(snapshot_id, source_id, model)
);
CREATE INDEX semantic_documents_hnsw ON semantic_documents USING hnsw(embedding vector_cosine_ops);

CREATE TABLE voice_sessions (
    id uuid PRIMARY KEY,
    receipt_sha256 char(64) NOT NULL,
    provider_session_id text,
    reservation_id uuid REFERENCES model_usage_reservations(id),
    context jsonb NOT NULL,
    context_version text NOT NULL,
    status text NOT NULL CHECK (status IN ('creating', 'active', 'closed', 'uncertain')),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
    created_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz
);
