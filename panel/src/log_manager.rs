use anyhow::{Context, Result};
use crate::models::LogEntry;
use chrono::Utc;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::sync::RwLock;

pub struct LogManager {
    log_files: Arc<RwLock<HashMap<String, PathBuf>>>,
    log_senders: Arc<RwLock<HashMap<String, broadcast::Sender<LogEntry>>>>,
    log_positions: Arc<RwLock<HashMap<String, u64>>>, // Track file read positions
    logs_dir: PathBuf,
}

impl LogManager {
    pub fn new(logs_dir: PathBuf) -> Result<Self> {
        // Create logs directory if it doesn't exist
        std::fs::create_dir_all(&logs_dir)
            .context("Failed to create logs directory")?;

        Ok(Self {
            log_files: Arc::new(RwLock::new(HashMap::new())),
            log_senders: Arc::new(RwLock::new(HashMap::new())),
            log_positions: Arc::new(RwLock::new(HashMap::new())),
            logs_dir,
        })
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
                                last_position = 0;
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

                            // Broadcast new lines
                            for line in new_lines {
                                let entry = LogEntry {
                                    timestamp: Utc::now(),
                                    service_id: service_id.clone(),
                                    level: "info".to_string(),
                                    message: line,
                                };
                                let _ = sender.send(entry);
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

}

