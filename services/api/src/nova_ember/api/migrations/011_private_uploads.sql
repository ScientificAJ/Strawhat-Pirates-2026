CREATE TABLE private_uploads (
    id uuid PRIMARY KEY,
    receipt_sha256 char(64) NOT NULL,
    snapshot_id char(64) NOT NULL REFERENCES snapshots(id),
    expected_sha256 char(64) NOT NULL,
    byte_size bigint NOT NULL CHECK (byte_size > 0),
    received_bytes bigint NOT NULL DEFAULT 0 CHECK (received_bytes >= 0),
    status text NOT NULL DEFAULT 'receiving'
        CHECK (status IN ('receiving', 'ready', 'rejected')),
    metadata jsonb NOT NULL,
    validation jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
    CHECK (received_bytes <= byte_size)
);

CREATE INDEX private_uploads_owner ON private_uploads(receipt_sha256, expires_at);
CREATE INDEX private_uploads_expiry ON private_uploads(expires_at);
