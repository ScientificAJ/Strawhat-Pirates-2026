ALTER TABLE execution_sessions ADD COLUMN terminated_at timestamptz;
ALTER TABLE execution_sessions ADD COLUMN termination_reason text;
