use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tracing::{info, debug};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceState {
    pub service_id: String,
    pub pid: u32,
    pub started_at: DateTime<Utc>,
    pub command: String,
    pub working_dir: String,
    pub environment: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StateFile {
    services: Vec<ServiceState>,
    updated_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct StatePersistence {
    state_file: PathBuf,
}

impl StatePersistence {
    pub fn new(state_file: PathBuf) -> Self {
        Self { state_file }
    }

    pub async fn save_state(&self, services: Vec<ServiceState>) -> Result<()> {
        let state = StateFile {
            services,
            updated_at: Utc::now(),
        };

        // Create parent directory if it doesn't exist
        if let Some(parent) = self.state_file.parent() {
            std::fs::create_dir_all(parent)
                .context("Failed to create state file directory")?;
        }

        let json = serde_json::to_string_pretty(&state)
            .context("Failed to serialize state to JSON")?;

        tokio::fs::write(&self.state_file, json)
            .await
            .context(format!("Failed to write state file to {:?}", self.state_file))?;

        debug!("State saved to {:?}", self.state_file);
        Ok(())
    }

    pub async fn load_state(&self) -> Result<Vec<ServiceState>> {
        if !self.state_file.exists() {
            debug!("State file does not exist, returning empty state");
            return Ok(Vec::new());
        }

        let content = tokio::fs::read_to_string(&self.state_file)
            .await
            .context(format!("Failed to read state file from {:?}", self.state_file))?;

        if content.trim().is_empty() {
            debug!("State file is empty, returning empty state");
            return Ok(Vec::new());
        }

        let state: StateFile = serde_json::from_str(&content)
            .context("Failed to parse state file JSON")?;

        info!("Loaded {} services from state file", state.services.len());
        Ok(state.services)
    }

    pub async fn remove_service(&self, service_id: &str) -> Result<()> {
        let mut services = self.load_state().await?;
        services.retain(|s| s.service_id != service_id);
        self.save_state(services).await?;
        debug!("Removed service {} from state file", service_id);
        Ok(())
    }

    pub async fn add_or_update_service(&self, service_state: ServiceState) -> Result<()> {
        let mut services = self.load_state().await?;
        
        // Remove existing entry if present
        services.retain(|s| s.service_id != service_state.service_id);
        
        // Add new entry
        services.push(service_state);
        
        self.save_state(services).await?;
        Ok(())
    }
}

