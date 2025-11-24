-- Create projects table for managing generated websites
CREATE TABLE projects (
    project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    directory_path TEXT NOT NULL,
    schema_name VARCHAR(255) NOT NULL,
    database_type VARCHAR(50),
    database_url TEXT,
    framework VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    last_scan_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_projects_name ON projects(name);
CREATE INDEX idx_projects_schema_name ON projects(schema_name);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_framework ON projects(framework);

-- Add comments
COMMENT ON TABLE projects IS 'Projects representing generated websites in ./sites directory';
COMMENT ON COLUMN projects.metadata IS 'Scanned metadata including tables, models, routes, APIs, and dependencies';

