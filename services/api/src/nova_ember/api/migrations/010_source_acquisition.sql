ALTER TABLE jobs DROP CONSTRAINT jobs_kind_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_kind_check CHECK (
    kind IN ('export_flex', 'export_case', 'execute_code', 'research',
             'registered_analysis', 'source_acquisition')
);
