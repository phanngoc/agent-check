use anyhow::{Context, Result};
use std::sync::Arc;
use tokio_postgres::{Client, NoTls};

pub struct SchemaManager {
    client: Arc<Client>,
}

impl SchemaManager {
    pub async fn new(database_url: &str) -> Result<Self> {
        let (client, connection) = tokio_postgres::connect(database_url, NoTls)
            .await
            .context("Failed to connect to TimescaleDB for schema management")?;

        // Spawn connection task
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                tracing::error!("SchemaManager connection error: {}", e);
            }
        });

        Ok(Self {
            client: Arc::new(client),
        })
    }

    pub async fn create_schema(&self, schema_name: &str) -> Result<()> {
        // Sanitize schema name to prevent SQL injection
        let sanitized = self.sanitize_schema_name(schema_name);
        
        let query = format!("CREATE SCHEMA IF NOT EXISTS {}", sanitized);
        
        self.client
            .execute(&query, &[])
            .await
            .context(format!("Failed to create schema: {}", sanitized))?;

        tracing::info!("Created schema: {}", sanitized);
        Ok(())
    }

    pub async fn schema_exists(&self, schema_name: &str) -> Result<bool> {
        let sanitized = self.sanitize_schema_name(schema_name);
        
        let row = self
            .client
            .query_one(
                "SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = $1)",
                &[&sanitized],
            )
            .await
            .context("Failed to check if schema exists")?;

        let exists: bool = row.get(0);
        Ok(exists)
    }

    pub async fn drop_schema(&self, schema_name: &str, cascade: bool) -> Result<()> {
        let sanitized = self.sanitize_schema_name(schema_name);
        
        let cascade_clause = if cascade { " CASCADE" } else { "" };
        let query = format!("DROP SCHEMA IF EXISTS {}{}", sanitized, cascade_clause);
        
        self.client
            .execute(&query, &[])
            .await
            .context(format!("Failed to drop schema: {}", sanitized))?;

        tracing::info!("Dropped schema: {}", sanitized);
        Ok(())
    }

    /// Generate a safe schema name from project name
    pub fn generate_schema_name(project_name: &str) -> String {
        // Convert to lowercase, replace invalid characters with underscore
        let sanitized = project_name
            .to_lowercase()
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect::<String>();

        // Remove consecutive underscores
        let cleaned = sanitized
            .split('_')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("_");

        format!("project_{}", cleaned)
    }

    /// Sanitize schema name to prevent SQL injection
    /// Only allows alphanumeric characters and underscores
    fn sanitize_schema_name(&self, name: &str) -> String {
        name.chars()
            .filter(|c| c.is_alphanumeric() || *c == '_')
            .collect()
    }
}

