use anyhow::{Context, Result};
use crate::database::LogDatabase;
use crate::models::{FilteredLogsResponse, LogEntry};
use crate::timescale_db::{TimescaleDatabase, LogFilters};
use chrono::{DateTime, Utc};
use reqwest::Client as HttpClient;
use serde_json::json;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::sync::RwLock;
use uuid::Uuid;

pub struct LogManager {
    log_files: Arc<RwLock<HashMap<String, PathBuf>>>,
    log_senders: Arc<RwLock<HashMap<String, broadcast::Sender<LogEntry>>>>,
    log_positions: Arc<RwLock<HashMap<String, u64>>>, // Track file read positions
    logs_dir: PathBuf,
    database: Option<Arc<LogDatabase>>, // Keep for fallback
    timescale_db: Option<Arc<TimescaleDatabase>>,
    http_client: Arc<HttpClient>,
    backend_api_url: String,
    panel_session_id: Uuid,
    log_batch: Arc<RwLock<Vec<LogEntry>>>, // Batch logs before sending
}

impl LogManager {
    pub async fn new(
        logs_dir: PathBuf,
        data_dir: Option<PathBuf>,
        timescale_db_url: Option<&str>,
        backend_api_url: &str,
        panel_session_id: Uuid,
    ) -> Result<Self> {
        // Create logs directory if it doesn't exist
        std::fs::create_dir_all(&logs_dir)
            .context("Failed to create logs directory")?;

        // Initialize TimescaleDB if URL is provided
        let timescale_db = if let Some(db_url) = timescale_db_url {
            match TimescaleDatabase::new(db_url).await {
                Ok(db) => {
                    tracing::info!("TimescaleDB initialized successfully");
                    Some(Arc::new(db))
                }
                Err(e) => {
                    tracing::warn!("Failed to initialize TimescaleDB: {}. Will use SQLite fallback.", e);
                    None
                }
            }
        } else {
            None
        };

        // Initialize SQLite as fallback if TimescaleDB is not available
        let database = if timescale_db.is_none() {
            if let Some(data_dir) = data_dir {
                match LogDatabase::new(data_dir) {
                    Ok(db) => {
                        tracing::info!("SQLite database initialized as fallback");
                        Some(Arc::new(db))
                    }
                    Err(e) => {
                        tracing::warn!("Failed to initialize SQLite database: {}. Logs will only be stored in files.", e);
                        None
                    }
                }
            } else {
                None
            }
        } else {
            None // Don't use SQLite if TimescaleDB is available
        };

        let http_client = Arc::new(HttpClient::new());
        let log_batch = Arc::new(RwLock::new(Vec::new()));

        // Start batch flush task
        let batch_clone = log_batch.clone();
        let client_clone = http_client.clone();
        let api_url = backend_api_url.to_string();
        let session_id = panel_session_id;
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
            loop {
                interval.tick().await;
                let mut batch = batch_clone.write().await;
                if !batch.is_empty() {
                    let events: Vec<_> = batch.drain(..).collect();
                    drop(batch);
                    if let Err(e) = Self::send_logs_to_api(&client_clone, &api_url, session_id, &events).await {
                        tracing::warn!("Failed to send log batch to API: {}", e);
                        // Re-add events to batch on failure (optional, might cause duplicates)
                    }
                }
            }
        });

        Ok(Self {
            log_files: Arc::new(RwLock::new(HashMap::new())),
            log_senders: Arc::new(RwLock::new(HashMap::new())),
            log_positions: Arc::new(RwLock::new(HashMap::new())),
            logs_dir,
            database,
            timescale_db,
            http_client,
            backend_api_url: backend_api_url.to_string(),
            panel_session_id,
            log_batch,
        })
    }

    async fn send_logs_to_api(
        client: &HttpClient,
        api_url: &str,
        session_id: Uuid,
        entries: &[LogEntry],
    ) -> Result<()> {
        let events: Vec<serde_json::Value> = entries
            .iter()
            .map(|entry| {
                json!({
                    "timestamp": entry.timestamp.to_rfc3339(),
                    "event_type": "log",
                    "page_url": entry.service_id,
                    "event_data": {
                        "service_id": entry.service_id,
                        "level": entry.level,
                        "message": entry.message
                    }
                })
            })
            .collect();

        let payload = json!({
            "session_id": session_id.to_string(),
            "events": events
        });

        let response = client
            .post(&format!("{}/track", api_url))
            .json(&payload)
            .send()
            .await
            .context("Failed to send request to backend API")?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!(
                "Backend API returned error: {} - {}",
                status,
                text
            ));
        }

        Ok(())
    }

    pub async fn register_service(&self, service_id: String) -> Result<()> {
        let log_path = self.logs_dir.join(format!("{}.log", service_id));
        
        // Create log file if it doesn't exist
        File::create(&log_path)
            .context("Failed to create log file")?;

        // Create broadcast channel for this service
        let (tx, _) = broadcast::channel(1000);
        
        let service_id_clone = service_id.clone();
        self.log_files.write().await.insert(service_id_clone.clone(), log_path.clone());
        self.log_senders.write().await.insert(service_id_clone.clone(), tx);
        self.log_positions.write().await.insert(service_id_clone.clone(), 0);

        // Start log watcher for this service
        self.start_log_watcher(service_id_clone, log_path).await;

        Ok(())
    }

    async fn start_log_watcher(&self, service_id: String, log_path: PathBuf) {
        let log_senders = self.log_senders.clone();
        let log_positions = self.log_positions.clone();
        let log_batch = self.log_batch.clone();

        tokio::spawn(async move {
            let mut last_position = 0u64;

            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

                // Check if service still exists
                let senders = log_senders.read().await;
                let sender = match senders.get(&service_id) {
                    Some(s) => s.clone(),
                    None => break, // Service removed, stop watching
                };
                drop(senders);

                // Read new lines from file
                match std::fs::OpenOptions::new()
                    .read(true)
                    .open(&log_path)
                {
                    Ok(mut file) => {
                        // Get current file size
                        let current_size = match file.metadata() {
                            Ok(meta) => meta.len(),
                            Err(_) => {
                                continue;
                            }
                        };

                        // If file grew, read new content
                        if current_size > last_position {
                            // Seek to last position
                            if file.seek(SeekFrom::Start(last_position)).is_err() {
                                // If seek fails, reset to beginning
                                if file.seek(SeekFrom::Start(0)).is_err() {
                                    continue;
                                }
                                // Position will be updated to current_size below
                            }

                            let reader = BufReader::new(&mut file);
                            let mut new_lines = Vec::new();

                            for line in reader.lines() {
                                if let Ok(line) = line {
                                    if !line.trim().is_empty() {
                                        new_lines.push(line);
                                    }
                                }
                            }

                            // Update position
                            last_position = current_size;
                            log_positions.write().await.insert(service_id.clone(), last_position);

                            // Process new lines: broadcast and add to batch for API
                            for line in new_lines {
                                let (level, timestamp) = Self::parse_log_line(&line);
                                let entry = LogEntry {
                                    timestamp,
                                    service_id: service_id.clone(),
                                    level,
                                    message: line.clone(),
                                };
                                
                                // Broadcast for realtime streaming
                                let _ = sender.send(entry.clone());

                                // Add to batch for sending to backend API
                                let mut batch = log_batch.write().await;
                                batch.push(entry);
                            }
                        }
                    }
                    Err(e) => {
                        // File doesn't exist yet or can't be opened, continue
                        // Only log error occasionally to avoid spam
                        if last_position == 0 {
                            tracing::debug!("Log file not yet available for {}: {}", service_id, e);
                        }
                        continue;
                    }
                }
            }
        });
    }


    pub async fn get_logs(&self, service_id: &str, lines: Option<usize>) -> Result<Vec<String>> {
        let log_files = self.log_files.read().await;
        let log_path = log_files.get(service_id)
            .context("Service log file not found")?;

        let file = File::open(log_path)
            .context("Failed to open log file")?;

        let reader = BufReader::new(file);
        let mut log_lines: Vec<String> = reader
            .lines()
            .filter_map(|l| l.ok())
            .collect();

        // Get last N lines if specified
        if let Some(n) = lines {
            let start = log_lines.len().saturating_sub(n);
            log_lines = log_lines[start..].to_vec();
        }

        Ok(log_lines)
    }


    pub async fn get_log_receiver(&self, service_id: &str) -> Option<broadcast::Receiver<LogEntry>> {
        let senders = self.log_senders.read().await;
        senders.get(service_id).map(|tx| tx.subscribe())
    }

    /// Parse log line to extract level and timestamp (static method)
    pub fn parse_log_line(line: &str) -> (String, DateTime<Utc>) {
        let line_upper = line.to_uppercase();
        
        // Extract level from keywords (case-insensitive)
        let level = if line_upper.contains("ERROR") || line_upper.contains("ERR") {
            "error".to_string()
        } else if line_upper.contains("WARN") || line_upper.contains("WARNING") {
            "warn".to_string()
        } else if line_upper.contains("DEBUG") {
            "debug".to_string()
        } else if line_upper.contains("INFO") {
            "info".to_string()
        } else {
            "info".to_string() // default
        };
        
        // Try to parse timestamp from various formats
        let timestamp = Self::parse_timestamp_from_line(line).unwrap_or_else(|| Utc::now());
        
        (level, timestamp)
    }
    
    /// Try to parse timestamp from log line
    fn parse_timestamp_from_line(line: &str) -> Option<DateTime<Utc>> {
        // Try ISO8601 format: 2024-01-01T00:00:00Z or 2024-01-01T00:00:00+00:00
        if let Ok(dt) = DateTime::parse_from_rfc3339(line) {
            return Some(dt.with_timezone(&Utc));
        }
        
        // Try RFC3339 format
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(line) {
            return Some(dt.with_timezone(&Utc));
        }
        
        // Try common log formats
        // Format: 2024-01-01 00:00:00
        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(line, "%Y-%m-%d %H:%M:%S") {
            return Some(dt.and_utc());
        }
        
        // Try format: 2024-01-01T00:00:00
        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(line, "%Y-%m-%dT%H:%M:%S") {
            return Some(dt.and_utc());
        }
        
        // Try to find timestamp pattern in the line (first 19-30 chars usually contain timestamp)
        let patterns = [
            r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}",
            r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}",
            r"\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}",
        ];
        
        for pattern in &patterns {
            if let Some(captures) = regex::Regex::new(pattern).ok().and_then(|re| re.find(line)) {
                let ts_str = captures.as_str();
                // Try parsing the matched timestamp
                if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(ts_str, "%Y-%m-%dT%H:%M:%S") {
                    return Some(dt.and_utc());
                }
                if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(ts_str, "%Y-%m-%d %H:%M:%S") {
                    return Some(dt.and_utc());
                }
            }
        }
        
        None
    }

    /// Get filtered logs based on criteria
    pub async fn get_filtered_logs(
        &self,
        service_id: &str,
        level_filter: Option<&str>,
        from: Option<DateTime<Utc>>,
        to: Option<DateTime<Utc>>,
        search: Option<&str>,
        use_or_operator: bool,
        limit: usize,
    ) -> Result<FilteredLogsResponse> {
        // Try to use TimescaleDB first, fallback to SQLite, then file
        if let Some(timescale_db) = &self.timescale_db {
            let filters = LogFilters {
                service_id: Some(service_id.to_string()),
                level: level_filter.map(|s| s.to_string()),
                from,
                to,
                search: search.map(|s| s.to_string()),
                limit,
                offset: 0,
            };

            let entries = timescale_db.get_logs(filters).await?;
            let total = timescale_db.get_log_count(Some(service_id)).await.unwrap_or(0);
            let filtered = entries.len();

            Ok(FilteredLogsResponse {
                logs: entries,
                total,
                filtered,
            })
        } else if let Some(db) = &self.database {
            let filters = crate::database::LogFilters {
                service_id: Some(service_id.to_string()),
                level: level_filter.map(|s| s.to_string()),
                from,
                to,
                search: search.map(|s| s.to_string()),
                limit,
                offset: 0,
            };

            let entries = db.get_logs(filters).await?;
            let total = db.get_log_count(Some(service_id)).await.unwrap_or(0);
            let filtered = entries.len();

            Ok(FilteredLogsResponse {
                logs: entries,
                total,
                filtered,
            })
        } else {
            // Fallback to file-based filtering
            let log_path = {
                let log_files = self.log_files.read().await;
                log_files.get(service_id)
                    .context("Service log file not found")?
                    .clone()
            };

            let file = File::open(&log_path)
                .context("Failed to open log file")?;

            let reader = BufReader::new(file);
            let all_lines: Vec<String> = reader
                .lines()
                .filter_map(|l| l.ok())
                .collect();

            let total = all_lines.len();

            // Parse all lines to LogEntry
            let entries: Vec<LogEntry> = all_lines.into_iter().map(|line| {
                let (level, timestamp) = Self::parse_log_line(&line);
                LogEntry {
                    timestamp,
                    service_id: service_id.to_string(),
                    level,
                    message: line,
                }
            }).collect();

            // Apply filters
            let filtered_entries: Vec<LogEntry> = entries.into_iter().filter(|entry| {
                let mut matches = Vec::new();

                // Level filter
                if let Some(level) = level_filter {
                    if level.to_lowercase() != "all" {
                        matches.push(entry.level.to_lowercase() == level.to_lowercase());
                    }
                }

                // Timestamp range filter
                if let Some(from_dt) = from {
                    matches.push(entry.timestamp >= from_dt);
                }
                if let Some(to_dt) = to {
                    matches.push(entry.timestamp <= to_dt);
                }

                // Message search filter
                if let Some(search_str) = search {
                    if !search_str.is_empty() {
                        matches.push(entry.message.to_lowercase().contains(&search_str.to_lowercase()));
                    }
                }

                // Apply operator logic
                if matches.is_empty() {
                    true // No filters, include all
                } else if use_or_operator {
                    matches.iter().any(|&m| m) // OR: at least one must match
                } else {
                    matches.iter().all(|&m| m) // AND: all must match
                }
            }).take(limit).collect();

            let filtered = filtered_entries.len();

            Ok(FilteredLogsResponse {
                logs: filtered_entries,
                total,
                filtered,
            })
        }
    }

    /// Get all registered service IDs
    pub async fn get_service_ids(&self) -> Vec<String> {
        let log_files = self.log_files.read().await;
        log_files.keys().cloned().collect()
    }

    /// Get combined logs from all services (realtime mode - from files only)
    /// This method reads directly from log files without querying database
    pub async fn get_combined_logs_realtime(
        &self,
        lines: Option<usize>,
    ) -> Result<FilteredLogsResponse> {
        let service_ids = self.get_service_ids().await;
        let mut all_entries: Vec<LogEntry> = Vec::new();

        // Collect logs from all services
        for service_id in service_ids {
            if let Ok(log_lines) = self.get_logs(&service_id, lines).await {
                for line in log_lines {
                    let (level, timestamp) = Self::parse_log_line(&line);
                    all_entries.push(LogEntry {
                        timestamp,
                        service_id: service_id.clone(),
                        level,
                        message: line,
                    });
                }
            }
        }

        let total = all_entries.len();

        // Sort by timestamp (newest first)
        all_entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

        // Get first N lines if specified (newest first)
        let logs = if let Some(n) = lines {
            let end = n.min(all_entries.len());
            all_entries[..end].to_vec()
        } else {
            all_entries
        };

        let filtered_count = logs.len();

        Ok(FilteredLogsResponse {
            logs,
            total,
            filtered: filtered_count,
        })
    }

    /// Get combined logs from all services (filtered mode - from TimescaleDB)
    /// This method queries TimescaleDB with filters, no file fallback
    pub async fn get_combined_logs_filtered(
        &self,
        level_filter: Option<&str>,
        search: Option<&str>,
        lines: Option<usize>,
    ) -> Result<FilteredLogsResponse> {
        let limit = lines.unwrap_or(1000);
        
        // Only use TimescaleDB for filtered queries
        if let Some(timescale_db) = &self.timescale_db {
            let filters = LogFilters {
                service_id: None, // None means all services
                level: level_filter.map(|s| s.to_string()),
                from: None,
                to: None,
                search: search.map(|s| s.to_string()),
                limit,
                offset: 0,
            };

            let entries = timescale_db.get_combined_logs(filters).await?;
            let total = timescale_db.get_log_count(None).await.unwrap_or(0);
            let filtered = entries.len();

            Ok(FilteredLogsResponse {
                logs: entries,
                total,
                filtered,
            })
        } else {
            // If TimescaleDB is not available, return error for filtered queries
            Err(anyhow::anyhow!("TimescaleDB is required for filtered log queries"))
        }
    }

    /// Get combined logs from all services
    pub async fn get_combined_logs(
        &self,
        level_filter: Option<&str>,
        search: Option<&str>,
        lines: Option<usize>,
    ) -> Result<FilteredLogsResponse> {
        // Try to use TimescaleDB first, fallback to SQLite, then file
        if let Some(timescale_db) = &self.timescale_db {
            let limit = lines.unwrap_or(1000);
            let filters = LogFilters {
                service_id: None, // None means all services
                level: level_filter.map(|s| s.to_string()),
                from: None,
                to: None,
                search: search.map(|s| s.to_string()),
                limit,
                offset: 0,
            };

            let entries = timescale_db.get_combined_logs(filters).await?;
            let total = timescale_db.get_log_count(None).await.unwrap_or(0);
            let filtered = entries.len();

            Ok(FilteredLogsResponse {
                logs: entries,
                total,
                filtered,
            })
        } else if let Some(db) = &self.database {
            let limit = lines.unwrap_or(1000);
            let filters = crate::database::LogFilters {
                service_id: None, // None means all services
                level: level_filter.map(|s| s.to_string()),
                from: None,
                to: None,
                search: search.map(|s| s.to_string()),
                limit,
                offset: 0,
            };

            let entries = db.get_combined_logs(filters).await?;
            let total = db.get_log_count(None).await.unwrap_or(0);
            let filtered = entries.len();

            Ok(FilteredLogsResponse {
                logs: entries,
                total,
                filtered,
            })
        } else {
            // Fallback to file-based approach
            let service_ids = self.get_service_ids().await;
            let mut all_entries: Vec<LogEntry> = Vec::new();

            // Collect logs from all services
            for service_id in service_ids {
                if let Ok(log_lines) = self.get_logs(&service_id, lines).await {
                    for line in log_lines {
                        let (level, timestamp) = Self::parse_log_line(&line);
                        all_entries.push(LogEntry {
                            timestamp,
                            service_id: service_id.clone(),
                            level,
                            message: line,
                        });
                    }
                }
            }

            let total = all_entries.len();

            // Sort by timestamp (newest first)
            all_entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

            // Apply filters
            let filtered_entries: Vec<LogEntry> = all_entries.into_iter().filter(|entry| {
                let mut matches = true;

                // Level filter
                if let Some(level) = level_filter {
                    if level.to_lowercase() != "all" {
                        matches = matches && entry.level.to_lowercase() == level.to_lowercase();
                    }
                }

                // Message search filter
                if let Some(search_str) = search {
                    if !search_str.is_empty() {
                        matches = matches && entry.message.to_lowercase().contains(&search_str.to_lowercase());
                    }
                }

                matches
            }).collect();

            // Get first N lines if specified (newest first)
            let logs = if let Some(n) = lines {
                let end = n.min(filtered_entries.len());
                filtered_entries[..end].to_vec()
            } else {
                filtered_entries
            };

            let filtered_count = logs.len();

            Ok(FilteredLogsResponse {
                logs,
                total,
                filtered: filtered_count,
            })
        }
    }

    /// Get all log receivers for combined streaming
    pub async fn get_combined_log_receivers(&self) -> Vec<(String, broadcast::Receiver<LogEntry>)> {
        let senders = self.log_senders.read().await;
        senders
            .iter()
            .map(|(service_id, sender)| (service_id.clone(), sender.subscribe()))
            .collect()
    }

    /// Get database reference (if available) - for backward compatibility
    pub fn get_database(&self) -> Option<Arc<LogDatabase>> {
        self.database.clone()
    }

    /// Get TimescaleDB reference (if available)
    pub fn get_timescale_db(&self) -> Option<Arc<TimescaleDatabase>> {
        self.timescale_db.clone()
    }

    /// Migrate logs from file to TimescaleDB via API for a specific service
    pub async fn migrate_file_logs_to_timescale(&self, service_id: &str) -> Result<usize> {
        let log_path = {
            let log_files = self.log_files.read().await;
            log_files.get(service_id)
                .context("Service log file not found")?
                .clone()
        };

        // Read all lines from file
        let file = File::open(&log_path)
            .context("Failed to open log file")?;

        let reader = BufReader::new(file);
        let lines: Vec<String> = reader
            .lines()
            .filter_map(|l| l.ok())
            .filter(|l| !l.trim().is_empty())
            .collect();

        if lines.is_empty() {
            return Ok(0);
        }

        // Parse lines to LogEntry
        let entries: Vec<LogEntry> = lines.into_iter().map(|line| {
            let (level, timestamp) = Self::parse_log_line(&line);
            LogEntry {
                timestamp,
                service_id: service_id.to_string(),
                level,
                message: line,
            }
        }).collect();

        // Send to backend API in batches
        let batch_size = 100;
        for chunk in entries.chunks(batch_size) {
            Self::send_logs_to_api(&self.http_client, &self.backend_api_url, self.panel_session_id, chunk).await?;
        }

        Ok(entries.len())
    }

    /// Migrate logs from all registered services to TimescaleDB
    pub async fn migrate_all_file_logs_to_timescale(&self) -> Result<usize> {
        let service_ids = self.get_service_ids().await;
        let mut total_migrated = 0;

        for service_id in service_ids {
            match self.migrate_file_logs_to_timescale(&service_id).await {
                Ok(count) => {
                    tracing::info!("Migrated {} logs from {} to TimescaleDB", count, service_id);
                    total_migrated += count;
                }
                Err(e) => {
                    tracing::warn!("Failed to migrate logs for {}: {}", service_id, e);
                }
            }
        }

        Ok(total_migrated)
    }

}

