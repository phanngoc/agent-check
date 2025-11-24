use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio_postgres::{Client, NoTls};
use tracing::{info, error, warn};

/// Parse SQL file into individual statements
/// Handles multi-line statements, comments, and proper statement separation
fn parse_sql_statements(sql: &str) -> Vec<String> {
    let mut statements = Vec::new();
    let mut current_statement = String::new();
    let mut in_comment = false;
    let mut in_string = false;
    let mut string_char = '\0';

    let chars: Vec<char> = sql.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let ch = chars[i];
        let next_ch = if i + 1 < chars.len() { Some(chars[i + 1]) } else { None };

        // Handle string literals
        if !in_comment && (ch == '\'' || ch == '"') {
            if !in_string {
                in_string = true;
                string_char = ch;
            } else if ch == string_char {
                in_string = false;
                string_char = '\0';
            }
            current_statement.push(ch);
            i += 1;
            continue;
        }

        // Handle comments
        if !in_string {
            if ch == '-' && next_ch == Some('-') {
                // Single-line comment: skip until end of line
                while i < chars.len() && chars[i] != '\n' {
                    i += 1;
                }
                continue;
            }
            if ch == '/' && next_ch == Some('*') {
                // Multi-line comment: skip until */
                i += 2;
                while i + 1 < chars.len() {
                    if chars[i] == '*' && chars[i + 1] == '/' {
                        i += 2;
                        break;
                    }
                    i += 1;
                }
                continue;
            }
        }

        // Handle statement termination
        if !in_string && ch == ';' {
            let trimmed = current_statement.trim().to_string();
            if !trimmed.is_empty() {
                statements.push(trimmed);
            }
            current_statement.clear();
            i += 1;
            continue;
        }

        // Add character to current statement
        if !in_comment {
            current_statement.push(ch);
        }
        i += 1;
    }

    // Add final statement if any
    let trimmed = current_statement.trim().to_string();
    if !trimmed.is_empty() {
        statements.push(trimmed);
    }

    statements
}

pub struct MigrationManager {
    client: Arc<Client>,
}

impl MigrationManager {
    pub async fn new(database_url: &str) -> Result<Self> {
        let (client, connection) = tokio_postgres::connect(database_url, NoTls)
            .await
            .context("Failed to connect to database for migrations")?;

        // Spawn connection task
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                tracing::error!("MigrationManager connection error: {}", e);
            }
        });

        let manager = Self {
            client: Arc::new(client),
        };

        // Ensure schema_migrations table exists
        manager.ensure_migration_table().await?;

        Ok(manager)
    }

    /// Ensure schema_migrations table exists
    async fn ensure_migration_table(&self) -> Result<()> {
        self.client
            .execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations (
                    version VARCHAR(255) PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )",
                &[],
            )
            .await
            .context("Failed to create schema_migrations table")?;

        Ok(())
    }

    /// Get list of applied migrations
    pub async fn get_applied_migrations(&self) -> Result<Vec<String>> {
        let rows = self
            .client
            .query(
                "SELECT version FROM schema_migrations ORDER BY applied_at",
                &[],
            )
            .await
            .context("Failed to query applied migrations")?;

        let mut versions = Vec::new();
        for row in rows {
            let version: String = row.get(0);
            versions.push(version);
        }

        Ok(versions)
    }

    /// Check if a migration has been applied
    pub async fn is_migration_applied(&self, version: &str) -> Result<bool> {
        let row = self
            .client
            .query_opt(
                "SELECT version FROM schema_migrations WHERE version = $1",
                &[&version],
            )
            .await
            .context("Failed to check migration status")?;

        Ok(row.is_some())
    }

    /// Mark a migration as applied
    async fn mark_migration_applied(&self, version: &str) -> Result<()> {
        self.client
            .execute(
                "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
                &[&version],
            )
            .await
            .context("Failed to mark migration as applied")?;

        Ok(())
    }

    /// Mark a migration as rolled back (remove from applied list)
    async fn mark_migration_rolled_back(&self, version: &str) -> Result<()> {
        self.client
            .execute(
                "DELETE FROM schema_migrations WHERE version = $1",
                &[&version],
            )
            .await
            .context("Failed to mark migration as rolled back")?;

        Ok(())
    }

    /// Run a single migration file
    pub async fn run_migration(&self, file_path: &Path, version: &str) -> Result<()> {
        // Check if already applied
        if self.is_migration_applied(version).await? {
            info!("Migration {} already applied, skipping", version);
            return Ok(());
        }

        info!("Running migration: {} ({})", version, file_path.display());

        // Read SQL file
        let sql = std::fs::read_to_string(file_path)
            .with_context(|| format!("Failed to read migration file: {}", file_path.display()))?;

        // Parse SQL statements properly
        let statements = parse_sql_statements(&sql);

        // Execute each statement (without transaction for simplicity)
        // Note: If a statement fails, we'll stop and the migration won't be marked as applied
        for statement in statements {
            if statement.trim().is_empty() {
                continue;
            }

            let stmt_preview: String = statement.chars().take(100).collect();
            info!("Executing: {}", stmt_preview);
            if let Err(e) = self.client.execute(statement.as_str(), &[]).await {
                error!("Failed to execute statement: {}", statement);
                return Err(e).context("Migration failed");
            }
        }

        // Mark as applied
        self.client
            .execute(
                "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
                &[&version],
            )
            .await
            .context("Failed to mark migration as applied")?;

        info!("Migration {} applied successfully", version);
        Ok(())
    }

    /// Rollback a migration
    pub async fn rollback_migration(&self, file_path: &Path, version: &str) -> Result<()> {
        // Check if applied
        if !self.is_migration_applied(version).await? {
            warn!("Migration {} not applied, nothing to rollback", version);
            return Ok(());
        }

        info!("Rolling back migration: {} ({})", version, file_path.display());

        // Read SQL file
        let sql = std::fs::read_to_string(file_path)
            .with_context(|| format!("Failed to read rollback file: {}", file_path.display()))?;

        // Parse SQL statements properly
        let statements = parse_sql_statements(&sql);

        // Execute each statement (without transaction for simplicity)
        for statement in statements {
            if statement.trim().is_empty() {
                continue;
            }

            if let Err(e) = self.client.execute(statement.as_str(), &[]).await {
                error!("Failed to execute rollback statement: {}", statement);
                return Err(e).context("Rollback failed");
            }
        }

        // Remove from applied list
        self.client
            .execute(
                "DELETE FROM schema_migrations WHERE version = $1",
                &[&version],
            )
            .await
            .context("Failed to remove migration from applied list")?;

        info!("Migration {} rolled back successfully", version);
        Ok(())
    }

    /// Run all pending migrations in a directory
    pub async fn run_all_migrations(&self, migrations_dir: &Path) -> Result<()> {
        if !migrations_dir.exists() {
            anyhow::bail!("Migrations directory does not exist: {}", migrations_dir.display());
        }

        info!("Scanning migrations directory: {}", migrations_dir.display());

        // Get all .up.sql files
        let mut migration_files: Vec<(String, PathBuf)> = Vec::new();

        for entry in std::fs::read_dir(migrations_dir)
            .with_context(|| format!("Failed to read migrations directory: {}", migrations_dir.display()))?
        {
            let entry = entry?;
            let path = entry.path();
            
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if file_name.ends_with(".up.sql") {
                    // Extract version from filename (e.g., "000004_create_projects_table.up.sql" -> "000004")
                    if let Some(version) = file_name.split('_').next() {
                        migration_files.push((version.to_string(), path));
                    }
                }
            }
        }

        // Sort by version
        migration_files.sort_by_key(|(version, _)| version.clone());

        let applied = self.get_applied_migrations().await?;

        for (version, path) in migration_files {
            if applied.contains(&version) {
                info!("Migration {} already applied, skipping", version);
                continue;
            }

            self.run_migration(&path, &version).await?;
        }

        Ok(())
    }

    /// Get migration status
    pub async fn get_status(&self, migrations_dir: &Path) -> Result<Vec<(String, bool)>> {
        if !migrations_dir.exists() {
            anyhow::bail!("Migrations directory does not exist: {}", migrations_dir.display());
        }

        let applied = self.get_applied_migrations().await?;
        let mut status = Vec::new();

        for entry in std::fs::read_dir(migrations_dir)
            .with_context(|| format!("Failed to read migrations directory: {}", migrations_dir.display()))?
        {
            let entry = entry?;
            let path = entry.path();
            
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if file_name.ends_with(".up.sql") {
                    if let Some(version) = file_name.split('_').next() {
                        let is_applied = applied.contains(&version.to_string());
                        status.push((version.to_string(), is_applied));
                    }
                }
            }
        }

        status.sort_by_key(|(version, _)| version.clone());
        Ok(status)
    }
}

