use anyhow::{Context, Result};
use crate::models::LogEntry;
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::sync::Arc;
use tokio_postgres::{Client, NoTls};
use uuid::Uuid;
use serde_json::json;

#[derive(Debug, Clone)]
pub struct LogFilters {
    pub service_id: Option<String>,
    pub level: Option<String>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
    pub search: Option<String>,
    pub limit: usize,
    pub offset: usize,
}

impl Default for LogFilters {
    fn default() -> Self {
        Self {
            service_id: None,
            level: None,
            from: None,
            to: None,
            search: None,
            limit: 1000,
            offset: 0,
        }
    }
}

pub struct TimescaleDatabase {
    client: Arc<Client>,
}

impl TimescaleDatabase {
    pub async fn new(database_url: &str) -> Result<Self> {
        let (client, connection) = tokio_postgres::connect(database_url, NoTls)
            .await
            .context("Failed to connect to TimescaleDB")?;

        // Spawn connection task
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                tracing::error!("TimescaleDB connection error: {}", e);
            }
        });

        Ok(Self {
            client: Arc::new(client),
        })
    }

    pub async fn get_logs(&self, filters: LogFilters) -> Result<Vec<LogEntry>> {
        let mut conditions = Vec::new();
        let mut param_values: Vec<String> = Vec::new();
        let mut param_index = 1;

        // Base condition: event_type = 'log'
        conditions.push("event_type = $1".to_string());
        param_values.push("log".to_string());

        // Service ID filter
        if let Some(service_id) = &filters.service_id {
            param_index += 1;
            conditions.push(format!("event_data->>'service_id' = ${}", param_index));
            param_values.push(service_id.clone());
        }

        // Level filter
        if let Some(level) = &filters.level {
            if level.to_lowercase() != "all" {
                param_index += 1;
                conditions.push(format!("LOWER(event_data->>'level') = ${}", param_index));
                param_values.push(level.to_lowercase());
            }
        }

        // Timestamp range filters
        if let Some(from) = &filters.from {
            param_index += 1;
            conditions.push(format!("timestamp >= ${}", param_index));
            param_values.push(from.to_rfc3339());
        }

        if let Some(to) = &filters.to {
            param_index += 1;
            conditions.push(format!("timestamp <= ${}", param_index));
            param_values.push(to.to_rfc3339());
        }

        // Search filter
        if let Some(search) = &filters.search {
            if !search.is_empty() {
                param_index += 1;
                conditions.push(format!("event_data->>'message' ILIKE ${}", param_index));
                let search_pattern = format!("%{}%", search);
                param_values.push(search_pattern);
            }
        }

        let where_clause = if conditions.is_empty() {
            "".to_string()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        param_index += 1;
        let limit_param = param_index;
        param_index += 1;
        let offset_param = param_index;

        let query = format!(
            "SELECT timestamp, event_data->>'service_id' as service_id, event_data->>'level' as level, event_data->>'message' as message 
             FROM events 
             {} 
             ORDER BY timestamp DESC 
             LIMIT ${} OFFSET ${}",
            where_clause, limit_param, offset_param
        );

        // Build params array
        let limit = filters.limit as i64;
        let offset = filters.offset as i64;
        let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = Vec::new();
        for val in &param_values {
            params.push(val);
        }
        params.push(&limit);
        params.push(&offset);

        let rows = self
            .client
            .query(&query, params.as_slice())
            .await
            .context("Failed to execute query")?;

        let mut entries = Vec::new();
        for row in rows {
            let timestamp: DateTime<Utc> = row.get(0);
            let service_id: Option<String> = row.get(1);
            let level: Option<String> = row.get(2);
            let message: Option<String> = row.get(3);

            entries.push(LogEntry {
                timestamp,
                service_id: service_id.unwrap_or_else(|| "unknown".to_string()),
                level: level.unwrap_or_else(|| "info".to_string()),
                message: message.unwrap_or_else(|| "".to_string()),
            });
        }

        // Reverse to get chronological order (oldest first)
        entries.reverse();
        Ok(entries)
    }

    pub async fn get_combined_logs(&self, filters: LogFilters) -> Result<Vec<LogEntry>> {
        tracing::info!("[TimescaleDB] get_combined_logs called - level: {:?}, search: {:?}, limit: {}, offset: {}", 
            filters.level, filters.search, filters.limit, filters.offset);
        
        let mut conditions = Vec::new();
        let mut param_values: Vec<String> = Vec::new();
        let mut param_index = 1;

        // Base condition: event_type = 'log'
        conditions.push("event_type = $1".to_string());
        param_values.push("log".to_string());

        // Level filter (ignore service_id for combined logs)
        if let Some(level) = &filters.level {
            if level.to_lowercase() != "all" {
                param_index += 1;
                conditions.push(format!("LOWER(event_data->>'level') = ${}", param_index));
                param_values.push(level.to_lowercase());
            }
        }

        // Timestamp range filters
        if let Some(from) = &filters.from {
            param_index += 1;
            conditions.push(format!("timestamp >= ${}", param_index));
            param_values.push(from.to_rfc3339());
        }

        if let Some(to) = &filters.to {
            param_index += 1;
            conditions.push(format!("timestamp <= ${}", param_index));
            param_values.push(to.to_rfc3339());
        }

        // Search filter
        if let Some(search) = &filters.search {
            if !search.is_empty() {
                param_index += 1;
                conditions.push(format!("event_data->>'message' ILIKE ${}", param_index));
                let search_pattern = format!("%{}%", search);
                param_values.push(search_pattern);
            }
        }

        let where_clause = if conditions.is_empty() {
            "".to_string()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        param_index += 1;
        let limit_param = param_index;
        param_index += 1;
        let offset_param = param_index;

        let query = format!(
            "SELECT timestamp, event_data->>'service_id' as service_id, event_data->>'level' as level, event_data->>'message' as message 
             FROM events 
             {} 
             ORDER BY timestamp DESC 
             LIMIT ${} OFFSET ${}",
            where_clause, limit_param, offset_param
        );

        tracing::debug!("[TimescaleDB] Executing query: {}", query);
        tracing::debug!("[TimescaleDB] Query params: {:?}", param_values);

        // Build params array
        let limit = filters.limit as i64;
        let offset = filters.offset as i64;
        let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = Vec::new();
        for val in &param_values {
            params.push(val);
        }
        params.push(&limit);
        params.push(&offset);

        let rows = self
            .client
            .query(&query, params.as_slice())
            .await
            .context("Failed to execute query")?;

        let mut entries = Vec::new();
        for row in rows {
            let timestamp: DateTime<Utc> = row.get(0);
            let service_id: Option<String> = row.get(1);
            let level: Option<String> = row.get(2);
            let message: Option<String> = row.get(3);

            entries.push(LogEntry {
                timestamp,
                service_id: service_id.unwrap_or_else(|| "unknown".to_string()),
                level: level.unwrap_or_else(|| "info".to_string()),
                message: message.unwrap_or_else(|| "".to_string()),
            });
        }

        tracing::info!("[TimescaleDB] Query returned {} log entries", entries.len());

        // No reverse - keep newest first (ORDER BY timestamp DESC)
        Ok(entries)
    }

    pub async fn get_log_count(&self, service_id: Option<&str>) -> Result<usize> {
        let count: i64 = if let Some(sid) = service_id {
            self.client
                .query_one(
                    "SELECT COUNT(*) FROM events WHERE event_type = 'log' AND event_data->>'service_id' = $1",
                    &[&sid]
                )
                .await
                .context("Failed to count logs")?
                .get(0)
        } else {
            self.client
                .query_one(
                    "SELECT COUNT(*) FROM events WHERE event_type = 'log'",
                    &[]
                )
                .await
                .context("Failed to count logs")?
                .get(0)
        };

        Ok(count as usize)
    }

    pub async fn get_log_stats(&self) -> Result<HashMap<String, usize>> {
        let mut stats = HashMap::new();

        // Total logs
        let total: i64 = self
            .client
            .query_one(
                "SELECT COUNT(*) FROM events WHERE event_type = 'log'",
                &[],
            )
            .await
            .context("Failed to count total logs")?
            .get(0);
        stats.insert("total".to_string(), total as usize);

        // Logs by service
        let rows = self
            .client
            .query(
                "SELECT event_data->>'service_id' as service_id, COUNT(*) 
                 FROM events 
                 WHERE event_type = 'log' 
                 GROUP BY event_data->>'service_id'",
                &[],
            )
            .await
            .context("Failed to get logs by service")?;

        for row in rows {
            let service_id: Option<String> = row.get(0);
            let count: i64 = row.get(1);
            let key = format!(
                "service_{}",
                service_id.unwrap_or_else(|| "unknown".to_string())
            );
            stats.insert(key, count as usize);
        }

        // Logs by level
        let rows = self
            .client
            .query(
                "SELECT event_data->>'level' as level, COUNT(*) 
                 FROM events 
                 WHERE event_type = 'log' 
                 GROUP BY event_data->>'level'",
                &[],
            )
            .await
            .context("Failed to get logs by level")?;

        for row in rows {
            let level: Option<String> = row.get(0);
            let count: i64 = row.get(1);
            let key = format!("level_{}", level.unwrap_or_else(|| "unknown".to_string()));
            stats.insert(key, count as usize);
        }

        Ok(stats)
    }

    /// Create or get panel session in TimescaleDB
    /// Returns the session_id
    pub async fn create_or_get_panel_session(&self) -> Result<Uuid> {
        // Try to find existing panel session
        let row = self.client
            .query_opt(
                "SELECT session_id FROM sessions WHERE user_id = 'panel' AND page_url = 'panel://logs' ORDER BY started_at DESC LIMIT 1",
                &[]
            )
            .await
            .context("Failed to query panel session")?;

        if let Some(row) = row {
            let session_id: Uuid = row.get(0);
            tracing::debug!("[TimescaleDB] Found existing panel session: {}", session_id);
            return Ok(session_id);
        }

        // Create new panel session
        let session_id = Uuid::new_v4();
        let metadata = json!({
            "source": "panel",
            "type": "log_collector"
        });

        self.client
            .execute(
                "INSERT INTO sessions (session_id, user_id, page_url, metadata) VALUES ($1, $2, $3, $4)",
                &[&session_id, &"panel", &"panel://logs", &metadata]
            )
            .await
            .context("Failed to create panel session")?;

        tracing::info!("[TimescaleDB] Created new panel session: {}", session_id);
        Ok(session_id)
    }

    /// Insert logs directly into TimescaleDB events table
    /// Uses batch insert for performance
    pub async fn insert_logs(&self, session_id: Uuid, entries: &[LogEntry]) -> Result<()> {
        if entries.is_empty() {
            return Ok(());
        }

        tracing::debug!("[TimescaleDB] Inserting {} log entries for session {}", entries.len(), session_id);

        // Prepare batch insert query
        let query = "
            INSERT INTO events (
                session_id, timestamp, event_type, page_url, event_data
            ) VALUES ($1, $2, $3, $4, $5)
        ";

        // Prepare statement once for better performance
        let stmt = self.client
            .prepare(query)
            .await
            .context("Failed to prepare insert statement")?;

        // Insert all entries
        for entry in entries {
            let event_data = json!({
                "service_id": entry.service_id,
                "level": entry.level,
                "message": entry.message
            });

            self.client
                .execute(
                    &stmt,
                    &[
                        &session_id,
                        &entry.timestamp,
                        &"log",
                        &entry.service_id, // page_url = service_id
                        &event_data,
                    ]
                )
                .await
                .context("Failed to insert log entry")?;
        }

        tracing::debug!("[TimescaleDB] Successfully inserted {} log entries", entries.len());
        Ok(())
    }
}

