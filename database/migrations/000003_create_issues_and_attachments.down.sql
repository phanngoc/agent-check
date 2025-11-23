-- Drop indexes
DROP INDEX IF EXISTS idx_attachments_issue_id;
DROP INDEX IF EXISTS idx_issues_screenshot_id;
DROP INDEX IF EXISTS idx_issues_status;
DROP INDEX IF EXISTS idx_issues_session_id;

-- Drop tables (order matters due to foreign keys)
DROP TABLE IF EXISTS attachments;
DROP TABLE IF EXISTS issues;

