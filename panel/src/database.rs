use anyhow::{Context, Result};
use crate::models::LogEntry;
use chrono::{DateTime, Utc};
use rusqlite::{Connection, params, Row};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub struct LogDatabase {
    #[allow(dead_code)]
    db_path: PathBuf,
    connection: Arc<Mutex<Connection>>,
}

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

impl LogDatabase {
    pub fn new(data_dir: PathBuf) -> Result<Self> {
        // Create data directory if it doesn't exist
        std::fs::create_dir_all(&data_dir)
            .context("Failed to create data directory")?;

        let db_path = data_dir.join("logs.db");
        let connection = Connection::open(&db_path)
            .context("Failed to open SQLite database")?;

        let db = Self {
            db_path,
            connection: Arc::new(Mutex::new(connection)),
        };

        // Initialize schema
        db.init_schema()?;

        Ok(db)
    }

    fn init_schema(&self) -> Result<()> {
        // Use blocking lock for init (synchronous operation)
        let conn = self.connection.lock().unwrap();
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                service_id TEXT NOT NULL,
                level TEXT NOT NULL,
                message TEXT NOT NULL
            )",
            [],
        )
        .context("Failed to create logs table")?;

        // Create indexes
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_timestamp ON logs(timestamp)",
            [],
        )
        .context("Failed to create timestamp index")?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_service_id ON logs(service_id)",
            [],
        )
        .context("Failed to create service_id index")?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_level ON logs(level)",
            [],
        )
        .context("Failed to create level index")?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_service_timestamp ON logs(service_id, timestamp)",
            [],
        )
        .context("Failed to create service_timestamp index")?;

        Ok(())
    }

    pub async fn insert_log(&self, entry: &LogEntry) -> Result<()> {
        let conn = self.connection.clone();
        let entry_clone = entry.clone();

        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            conn.execute(
                "INSERT INTO logs (timestamp, service_id, level, message) VALUES (?1, ?2, ?3, ?4)",
                params![
                    entry_clone.timestamp.to_rfc3339(),
                    entry_clone.service_id,
                    entry_clone.level,
                    entry_clone.message
                ],
            )
            .context("Failed to insert log entry")?;
            Ok(())
        })
        .await
        .context("Failed to execute insert_log task")?
    }

    pub async fn insert_logs_batch(&self, entries: &[LogEntry]) -> Result<()> {
        if entries.is_empty() {
            return Ok(());
        }

        let conn = self.connection.clone();
        let entries_clone = entries.to_vec();

        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let mut stmt = conn.prepare(
                "INSERT INTO logs (timestamp, service_id, level, message) VALUES (?1, ?2, ?3, ?4)"
            )
            .context("Failed to prepare batch insert statement")?;

            for entry in entries_clone {
                stmt.execute(params![
                    entry.timestamp.to_rfc3339(),
                    entry.service_id,
                    entry.level,
                    entry.message
                ])
                .context("Failed to execute batch insert")?;
            }

            Ok(())
        })
        .await
        .context("Failed to execute insert_logs_batch task")?
    }

    fn row_to_log_entry(row: &Row) -> rusqlite::Result<LogEntry> {
        let timestamp_str: String = row.get(0)?;
        let timestamp = DateTime::parse_from_rfc3339(&timestamp_str)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());
        
        Ok(LogEntry {
            timestamp,
            service_id: row.get(1)?,
            level: row.get(2)?,
            message: row.get(3)?,
        })
    }

    pub async fn get_logs(&self, filters: LogFilters) -> Result<Vec<LogEntry>> {
        let conn = self.connection.clone();
        let filters_clone = filters.clone();

        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let mut conditions = Vec::new();
            let mut query_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

            // Build WHERE conditions
            if let Some(service_id) = &filters_clone.service_id {
                conditions.push("service_id = ?");
                query_params.push(Box::new(service_id.clone()));
            }

            if let Some(level) = &filters_clone.level {
                if level.to_lowercase() != "all" {
                    conditions.push("level = ?");
                    query_params.push(Box::new(level.to_lowercase()));
                }
            }

            if let Some(from) = &filters_clone.from {
                conditions.push("timestamp >= ?");
                query_params.push(Box::new(from.to_rfc3339()));
            }

            if let Some(to) = &filters_clone.to {
                conditions.push("timestamp <= ?");
                query_params.push(Box::new(to.to_rfc3339()));
            }

            if let Some(search) = &filters_clone.search {
                if !search.is_empty() {
                    conditions.push("message LIKE ?");
                    let search_pattern = format!("%{}%", search);
                    query_params.push(Box::new(search_pattern));
                }
            }

            let where_clause = if conditions.is_empty() {
                "".to_string()
            } else {
                format!("WHERE {}", conditions.join(" AND "))
            };

            let query = format!(
                "SELECT timestamp, service_id, level, message FROM logs {} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
                where_clause
            );

            // Execute query with params
            let mut stmt = conn.prepare(&query)
                .context("Failed to prepare query")?;

            // Build params array for query
            let limit_val = filters_clone.limit as i64;
            let offset_val = filters_clone.offset as i64;
            let mut params_array: Vec<&dyn rusqlite::ToSql> = Vec::new();
            for param in &query_params {
                params_array.push(param.as_ref());
            }
            params_array.push(&limit_val);
            params_array.push(&offset_val);

            let mut rows = stmt.query(params_array.as_slice())
                .context("Failed to execute query")?;

            let mut entries = Vec::new();
            while let Some(row) = rows.next()? {
                entries.push(Self::row_to_log_entry(row)?);
            }

            // Reverse to get chronological order (oldest first)
            entries.reverse();
            Ok(entries)
        })
        .await
        .context("Failed to execute get_logs task")?
    }

    pub async fn get_combined_logs(&self, filters: LogFilters) -> Result<Vec<LogEntry>> {
        // For combined logs, we just ignore service_id filter if it exists
        let mut combined_filters = filters;
        combined_filters.service_id = None;
        self.get_logs(combined_filters).await
    }

    pub async fn cleanup_old_logs(&self, days: u32) -> Result<usize> {
        let conn = self.connection.clone();
        let cutoff = Utc::now() - chrono::Duration::days(days as i64);
        let cutoff_str = cutoff.to_rfc3339();

        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let deleted = conn.execute(
                "DELETE FROM logs WHERE timestamp < ?",
                params![cutoff_str],
            )
            .context("Failed to delete old logs")?;
            Ok(deleted)
        })
        .await
        .context("Failed to execute cleanup_old_logs task")?
    }

    pub async fn get_log_count(&self, service_id: Option<&str>) -> Result<usize> {
        let conn = self.connection.clone();
        let service_id_opt = service_id.map(|s| s.to_string());

        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let count = if let Some(sid) = service_id_opt {
                conn.query_row(
                    "SELECT COUNT(*) FROM logs WHERE service_id = ?",
                    params![sid],
                    |row| Ok(row.get::<_, i64>(0)? as usize),
                )
                .context("Failed to count logs for service")?
            } else {
                conn.query_row(
                    "SELECT COUNT(*) FROM logs",
                    [],
                    |row| Ok(row.get::<_, i64>(0)? as usize),
                )
                .context("Failed to count all logs")?
            };
            Ok(count)
        })
        .await
        .context("Failed to execute get_log_count task")?
    }

    pub async fn get_log_stats(&self) -> Result<std::collections::HashMap<String, usize>> {
        let conn = self.connection.clone();

        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let mut stats = std::collections::HashMap::new();

            // Total logs
            let total: i64 = conn.query_row(
                "SELECT COUNT(*) FROM logs",
                [],
                |row| row.get(0),
            )?;
            stats.insert("total".to_string(), total as usize);

            // Logs by service
            let mut stmt = conn.prepare(
                "SELECT service_id, COUNT(*) FROM logs GROUP BY service_id"
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? as usize))
            })?;

            for row in rows {
                let (service_id, count) = row?;
                stats.insert(format!("service_{}", service_id), count);
            }

            // Logs by level
            let mut stmt = conn.prepare(
                "SELECT level, COUNT(*) FROM logs GROUP BY level"
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? as usize))
            })?;

            for row in rows {
                let (level, count) = row?;
                stats.insert(format!("level_{}", level), count);
            }

            Ok(stats)
        })
        .await
        .context("Failed to execute get_log_stats task")?
    }
}

