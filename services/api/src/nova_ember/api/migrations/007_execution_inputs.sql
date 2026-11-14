ALTER TABLE execution_sessions ADD COLUMN input_assets jsonb NOT NULL DEFAULT '[]'::jsonb;
