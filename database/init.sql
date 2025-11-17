-- TimescaleDB initialization script
-- Create extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255),
    fingerprint VARCHAR(255),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    page_url TEXT NOT NULL,
    referrer TEXT,
    user_agent TEXT,
    screen_width INTEGER,
    screen_height INTEGER,
    viewport_width INTEGER,
    viewport_height INTEGER,
    device_type VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),
    country VARCHAR(2),
    city VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Events table (time-series hypertable)
CREATE TABLE IF NOT EXISTS events (
    event_id BIGSERIAL,
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    target_element VARCHAR(255),
    target_selector TEXT,
    target_tag VARCHAR(50),
    target_id VARCHAR(255),
    target_class TEXT,
    page_url TEXT NOT NULL,
    viewport_x INTEGER,
    viewport_y INTEGER,
    screen_x INTEGER,
    screen_y INTEGER,
    scroll_x INTEGER,
    scroll_y INTEGER,
    input_value TEXT,
    input_masked BOOLEAN DEFAULT FALSE,
    key_pressed VARCHAR(50),
    mouse_button INTEGER,
    click_count INTEGER,
    event_data JSONB DEFAULT '{}',
    PRIMARY KEY (timestamp, event_id)
);

-- Convert events to hypertable (partitioned by time)
SELECT create_hypertable('events', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Screenshots table
CREATE TABLE IF NOT EXISTS screenshots (
    screenshot_id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    page_url TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    image_data BYTEA NOT NULL,
    image_format VARCHAR(10) DEFAULT 'jpeg',
    image_width INTEGER,
    image_height INTEGER,
    file_size INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_fingerprint ON sessions(fingerprint);

CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_page_url ON events(page_url);

CREATE INDEX IF NOT EXISTS idx_screenshots_session_id ON screenshots(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_screenshots_timestamp ON screenshots(timestamp DESC);

-- Create continuous aggregates for analytics (optional)
CREATE MATERIALIZED VIEW IF NOT EXISTS session_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', started_at) AS bucket,
    COUNT(*) as session_count,
    AVG(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at))) as avg_duration_seconds,
    COUNT(DISTINCT user_id) as unique_users
FROM sessions
GROUP BY bucket
WITH NO DATA;

-- Refresh policy for continuous aggregate
SELECT add_continuous_aggregate_policy('session_stats',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Data retention policy (keep data for 30 days)
SELECT add_retention_policy('events', INTERVAL '30 days', if_not_exists => TRUE);

-- Compression policy (compress data older than 7 days)
ALTER TABLE events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'session_id'
);

SELECT add_compression_policy('events', INTERVAL '7 days', if_not_exists => TRUE);

-- Function to update session end time
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE sessions
    SET
        last_activity_at = NEW.timestamp,
        updated_at = NOW()
    WHERE session_id = NEW.session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update session on new event
CREATE TRIGGER trigger_update_session_activity
    AFTER INSERT ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_session_activity();

-- Function to calculate session duration
CREATE OR REPLACE FUNCTION calculate_session_duration(sid UUID)
RETURNS INTERVAL AS $$
DECLARE
    duration INTERVAL;
BEGIN
    SELECT (COALESCE(ended_at, last_activity_at) - started_at)
    INTO duration
    FROM sessions
    WHERE session_id = sid;

    RETURN duration;
END;
$$ LANGUAGE plpgsql;

-- View for session summary with event counts
CREATE OR REPLACE VIEW session_summary AS
SELECT
    s.session_id,
    s.user_id,
    s.started_at,
    s.ended_at,
    s.last_activity_at,
    s.page_url as initial_page,
    s.user_agent,
    s.device_type,
    s.browser,
    EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_activity_at) - s.started_at)) as duration_seconds,
    COUNT(DISTINCT e.page_url) as pages_visited,
    COUNT(*) FILTER (WHERE e.event_type = 'click') as click_count,
    COUNT(*) FILTER (WHERE e.event_type = 'input') as input_count,
    COUNT(*) FILTER (WHERE e.event_type = 'scroll') as scroll_count,
    COUNT(*) FILTER (WHERE e.event_type = 'mousemove') as mousemove_count,
    COUNT(*) FILTER (WHERE e.event_type = 'navigation') as navigation_count,
    COUNT(DISTINCT sc.screenshot_id) as screenshot_count,
    MAX(e.timestamp) as last_event_time
FROM sessions s
LEFT JOIN events e ON s.session_id = e.session_id
LEFT JOIN screenshots sc ON s.session_id = sc.session_id
GROUP BY s.session_id;

-- Grant permissions (if using separate user)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tracker;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tracker;

-- Insert sample data for testing (optional)
-- INSERT INTO sessions (user_id, page_url, user_agent, device_type)
-- VALUES ('test-user-1', 'https://example.com', 'Mozilla/5.0', 'desktop');

COMMENT ON TABLE sessions IS 'User session metadata and device information';
COMMENT ON TABLE events IS 'Time-series event data for user interactions';
COMMENT ON TABLE screenshots IS 'Page screenshots captured during sessions';
