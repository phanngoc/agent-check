-- Rollback initial schema
-- Drop views
DROP VIEW IF EXISTS session_summary;

-- Drop functions
DROP FUNCTION IF EXISTS calculate_session_duration(UUID);
DROP FUNCTION IF EXISTS update_session_activity();

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_update_session_activity ON events;

-- Drop continuous aggregates and policies
DROP MATERIALIZED VIEW IF EXISTS session_stats CASCADE;

-- Drop retention and compression policies
SELECT remove_retention_policy('events', if_exists => TRUE);
SELECT remove_compression_policy('events', if_exists => TRUE);

-- Drop indexes
DROP INDEX IF EXISTS idx_screenshots_timestamp;
DROP INDEX IF EXISTS idx_screenshots_session_id;
DROP INDEX IF EXISTS idx_events_page_url;
DROP INDEX IF EXISTS idx_events_type;
DROP INDEX IF EXISTS idx_events_session_id;
DROP INDEX IF EXISTS idx_sessions_fingerprint;
DROP INDEX IF EXISTS idx_sessions_started_at;
DROP INDEX IF EXISTS idx_sessions_user_id;

-- Drop tables (CASCADE will handle foreign keys)
DROP TABLE IF EXISTS screenshots CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;

-- Note: We don't drop the timescaledb extension as it might be used by other databases

