CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE snapshots (
    id char(64) PRIMARY KEY,
    fetched_at timestamptz NOT NULL,
    manifest jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE corpus_state (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    snapshot_id char(64) NOT NULL REFERENCES snapshots(id)
);

CREATE TABLE investigations (
    snapshot_id char(64) NOT NULL REFERENCES snapshots(id),
    accession text NOT NULL,
    version integer CHECK (version > 0),
    title text NOT NULL,
    description text NOT NULL,
    record jsonb NOT NULL,
    search_document tsvector GENERATED ALWAYS AS (
        to_tsvector('simple', title || ' ' || description)
    ) STORED,
    PRIMARY KEY (snapshot_id, accession)
);

CREATE INDEX investigations_search ON investigations USING gin(search_document);

CREATE TABLE source_assets (
    snapshot_id char(64) NOT NULL REFERENCES snapshots(id),
    accession text NOT NULL,
    sha256 char(64) NOT NULL,
    file_name text NOT NULL,
    file_version integer NOT NULL,
    byte_size bigint NOT NULL CHECK (byte_size >= 0),
    record jsonb NOT NULL,
    PRIMARY KEY (snapshot_id, accession, file_name, file_version),
    FOREIGN KEY (snapshot_id, accession)
        REFERENCES investigations(snapshot_id, accession)
);

CREATE INDEX source_assets_hash ON source_assets(sha256);
