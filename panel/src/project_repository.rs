use anyhow::{Context, Result};
use crate::models::{Project, ProjectMetadata, ProjectStatus};
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::sync::Arc;
use tokio_postgres::{Client, NoTls};
use uuid::Uuid;

pub struct ProjectRepository {
    client: Arc<Client>,
}

impl ProjectRepository {
    pub async fn new(database_url: &str) -> Result<Self> {
        let (client, connection) = tokio_postgres::connect(database_url, NoTls)
            .await
            .context("Failed to connect to TimescaleDB for projects")?;

        // Spawn connection task
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                tracing::error!("ProjectRepository connection error: {}", e);
            }
        });

        Ok(Self {
            client: Arc::new(client),
        })
    }

    pub async fn create(&self, project: &Project) -> Result<Uuid> {
        let metadata_json: Value = serde_json::to_value(&project.metadata)
            .context("Failed to serialize metadata")?;

        let status_str = match project.status {
            ProjectStatus::Active => "active",
            ProjectStatus::Inactive => "inactive",
            ProjectStatus::Error => "error",
        };

        let row = self
            .client
            .query_one(
                "INSERT INTO projects (
                    name, directory_path, schema_name, database_type, database_url,
                    framework, metadata, status, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING project_id",
                &[
                    &project.name,
                    &project.directory_path,
                    &project.schema_name,
                    &project.database_type,
                    &project.database_url,
                    &project.framework,
                    &metadata_json,
                    &status_str,
                    &project.created_at,
                    &project.updated_at,
                ],
            )
            .await
            .context("Failed to create project")?;

        let project_id: Uuid = row.get(0);
        Ok(project_id)
    }

    pub async fn get_by_id(&self, project_id: Uuid) -> Result<Option<Project>> {
        let row = self
            .client
            .query_opt(
                "SELECT project_id, name, directory_path, schema_name, database_type, database_url,
                        framework, metadata, last_scan_at, status, created_at, updated_at
                 FROM projects WHERE project_id = $1",
                &[&project_id],
            )
            .await
            .context("Failed to get project by id")?;

        if let Some(row) = row {
            Ok(Some(self.row_to_project(row)?))
        } else {
            Ok(None)
        }
    }

    pub async fn get_by_name(&self, name: &str) -> Result<Option<Project>> {
        let row = self
            .client
            .query_opt(
                "SELECT project_id, name, directory_path, schema_name, database_type, database_url,
                        framework, metadata, last_scan_at, status, created_at, updated_at
                 FROM projects WHERE name = $1",
                &[&name],
            )
            .await
            .context("Failed to get project by name")?;

        if let Some(row) = row {
            Ok(Some(self.row_to_project(row)?))
        } else {
            Ok(None)
        }
    }

    pub async fn list(&self) -> Result<Vec<Project>> {
        let rows = self
            .client
            .query(
                "SELECT project_id, name, directory_path, schema_name, database_type, database_url,
                        framework, metadata, last_scan_at, status, created_at, updated_at
                 FROM projects ORDER BY created_at DESC",
                &[],
            )
            .await
            .context("Failed to list projects")?;

        let mut projects = Vec::new();
        for row in rows {
            projects.push(self.row_to_project(row)?);
        }
        Ok(projects)
    }

    pub async fn update(&self, project_id: Uuid, updates: &crate::models::UpdateProjectRequest) -> Result<()> {
        let mut fields = Vec::new();
        let mut values: Vec<Box<dyn tokio_postgres::types::ToSql + Sync>> = Vec::new();
        let mut param_index = 1;

        if let Some(name) = &updates.name {
            fields.push(format!("name = ${}", param_index));
            values.push(Box::new(name.as_str()));
            param_index += 1;
        }

        if let Some(directory_path) = &updates.directory_path {
            fields.push(format!("directory_path = ${}", param_index));
            values.push(Box::new(directory_path.as_str()));
            param_index += 1;
        }

        if let Some(database_type) = &updates.database_type {
            fields.push(format!("database_type = ${}", param_index));
            values.push(Box::new(database_type.as_str()));
            param_index += 1;
        }

        if let Some(database_url) = &updates.database_url {
            fields.push(format!("database_url = ${}", param_index));
            values.push(Box::new(database_url.as_str()));
            param_index += 1;
        }

        if let Some(framework) = &updates.framework {
            fields.push(format!("framework = ${}", param_index));
            values.push(Box::new(framework.as_str()));
            param_index += 1;
        }

        if let Some(status) = &updates.status {
            let status_str = match status {
                ProjectStatus::Active => "active",
                ProjectStatus::Inactive => "inactive",
                ProjectStatus::Error => "error",
            };
            fields.push(format!("status = ${}", param_index));
            values.push(Box::new(status_str));
            param_index += 1;
        }

        if fields.is_empty() {
            return Ok(());
        }

        fields.push(format!("updated_at = ${}", param_index));
        values.push(Box::new(Utc::now()));
        param_index += 1;

        values.push(Box::new(project_id));

        let query = format!(
            "UPDATE projects SET {} WHERE project_id = ${}",
            fields.join(", "),
            param_index
        );

        let params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> =
            values.iter().map(|v| v.as_ref()).collect();

        self.client
            .execute(&query, &params)
            .await
            .context("Failed to update project")?;

        Ok(())
    }

    pub async fn delete(&self, project_id: Uuid) -> Result<()> {
        self.client
            .execute("DELETE FROM projects WHERE project_id = $1", &[&project_id])
            .await
            .context("Failed to delete project")?;
        Ok(())
    }

    pub async fn update_metadata(&self, project_id: Uuid, metadata: &ProjectMetadata) -> Result<()> {
        let metadata_json: Value = serde_json::to_value(metadata)
            .context("Failed to serialize metadata")?;

        self.client
            .execute(
                "UPDATE projects SET metadata = $1, last_scan_at = $2, updated_at = $3 WHERE project_id = $4",
                &[&metadata_json, &Utc::now(), &Utc::now(), &project_id],
            )
            .await
            .context("Failed to update project metadata")?;

        Ok(())
    }

    pub async fn update_last_scan(&self, project_id: Uuid, timestamp: DateTime<Utc>) -> Result<()> {
        self.client
            .execute(
                "UPDATE projects SET last_scan_at = $1, updated_at = $2 WHERE project_id = $3",
                &[&timestamp, &Utc::now(), &project_id],
            )
            .await
            .context("Failed to update last_scan_at")?;

        Ok(())
    }

    fn row_to_project(&self, row: tokio_postgres::Row) -> Result<Project> {
        let project_id: Uuid = row.get(0);
        let name: String = row.get(1);
        let directory_path: String = row.get(2);
        let schema_name: String = row.get(3);
        let database_type: Option<String> = row.get(4);
        let database_url: Option<String> = row.get(5);
        let framework: Option<String> = row.get(6);
        let metadata_json: Value = row.get(7);
        let last_scan_at: Option<DateTime<Utc>> = row.get(8);
        let status_str: String = row.get(9);
        let created_at: DateTime<Utc> = row.get(10);
        let updated_at: DateTime<Utc> = row.get(11);

        let metadata: ProjectMetadata = serde_json::from_value(metadata_json)
            .unwrap_or_default();

        let status = match status_str.as_str() {
            "active" => ProjectStatus::Active,
            "inactive" => ProjectStatus::Inactive,
            "error" => ProjectStatus::Error,
            _ => ProjectStatus::Active,
        };

        Ok(Project {
            project_id,
            name,
            directory_path,
            schema_name,
            database_type,
            database_url,
            framework,
            metadata,
            last_scan_at,
            status,
            created_at,
            updated_at,
        })
    }
}

