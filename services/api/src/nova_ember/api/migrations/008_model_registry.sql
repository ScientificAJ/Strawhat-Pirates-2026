CREATE TABLE model_registry (
    id char(64) PRIMARY KEY,
    snapshot_id char(64) NOT NULL REFERENCES snapshots(id),
    method_id text NOT NULL,
    model_kind text NOT NULL CHECK (model_kind = 'single_predictor_regression'),
    status text NOT NULL CHECK (status IN ('active', 'retired', 'revoked')),
    card jsonb NOT NULL,
    source_anchors jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
