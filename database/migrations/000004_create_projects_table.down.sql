-- Drop indexes
DROP INDEX IF EXISTS idx_projects_framework;
DROP INDEX IF EXISTS idx_projects_status;
DROP INDEX IF EXISTS idx_projects_schema_name;
DROP INDEX IF EXISTS idx_projects_name;

-- Drop table
DROP TABLE IF EXISTS projects;

