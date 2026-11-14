ALTER TABLE semantic_documents ALTER COLUMN embedding DROP NOT NULL;
ALTER TABLE semantic_documents ADD COLUMN projection jsonb;
ALTER TABLE semantic_documents ADD COLUMN lexical_document tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(projection->>'search_text', ''))) STORED;
CREATE INDEX semantic_passage_lexical ON semantic_documents USING gin(lexical_document);
CREATE INDEX semantic_passage_accessions ON semantic_documents USING gin((projection->'accessions'));

CREATE TABLE semantic_projection_status (
    snapshot_id char(64) NOT NULL REFERENCES snapshots(id),
    model text NOT NULL,
    projection_sha256 char(64) NOT NULL,
    document_count integer NOT NULL CHECK(document_count >= 0),
    embedded_count integer NOT NULL CHECK(embedded_count >= 0),
    coverage jsonb NOT NULL,
    completed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(snapshot_id, model)
);
