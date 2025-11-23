-- Create issues table for bug reports
CREATE TABLE issues (
    issue_id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    page_url TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    screenshot_id BIGINT REFERENCES screenshots(screenshot_id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create attachments table for issue file attachments
CREATE TABLE attachments (
    attachment_id BIGSERIAL PRIMARY KEY,
    issue_id BIGINT NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
    file_data BYTEA NOT NULL,
    file_name TEXT NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_issues_session_id ON issues(session_id, created_at DESC);
CREATE INDEX idx_issues_status ON issues(status, created_at DESC);
CREATE INDEX idx_issues_screenshot_id ON issues(screenshot_id);
CREATE INDEX idx_attachments_issue_id ON attachments(issue_id);

-- Add comments
COMMENT ON TABLE issues IS 'Bug reports and issues submitted by users';
COMMENT ON TABLE attachments IS 'File attachments associated with issues';

