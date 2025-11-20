use anyhow::{Context, Result};
use crate::models::LogEntry;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::sync::RwLock;

pub struct LogManager {
    log_files: Arc<RwLock<HashMap<String, PathBuf>>>,
    log_senders: Arc<RwLock<HashMap<String, broadcast::Sender<LogEntry>>>>,
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
        
        self.log_files.write().await.insert(service_id.clone(), log_path);
        self.log_senders.write().await.insert(service_id, tx);

        Ok(())
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

