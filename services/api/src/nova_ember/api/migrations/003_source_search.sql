ALTER TABLE investigations DROP COLUMN search_document;

ALTER TABLE investigations ADD COLUMN search_document tsvector GENERATED ALWAYS AS (
    to_tsvector('simple',
        accession || ' ' || title || ' ' || description || ' ' ||
        COALESCE(record ->> 'acronym', '') || ' ' ||
        COALESCE(record ->> 'objective', '') || ' ' ||
        COALESCE(record ->> 'approach', '')
    )
) STORED;

CREATE INDEX investigations_search ON investigations USING gin(search_document);
