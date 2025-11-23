use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub port: u16,
    pub host: String,
    pub project_root: PathBuf,
    pub logs_dir: PathBuf,
    pub data_dir: PathBuf,
    pub state_file: PathBuf,
    pub auto_restart: bool,
    pub max_restart_attempts: u32,
    pub backend_api_url: String,
    pub timescale_db_url: String,
    pub panel_session_id: Option<Uuid>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            port: 9000,
            host: "0.0.0.0".to_string(),
            project_root: PathBuf::from("."),
            logs_dir: PathBuf::from("logs"),
            data_dir: PathBuf::from("data"),
            state_file: PathBuf::from("panel/state.json"),
            auto_restart: true,
            max_restart_attempts: 5,
            backend_api_url: "http://localhost:8080/api/v1".to_string(),
            timescale_db_url: "postgres://tracker:tracker@localhost:5432/tracker".to_string(),
            panel_session_id: None,
        }
    }
}

impl Config {
    pub fn new() -> anyhow::Result<Self> {
        // Try to detect project root (go up from panel/ to project root)
        let current_dir = std::env::current_dir()?;
        let project_root = if current_dir.ends_with("panel") {
            current_dir.parent()
                .map(|p| p.to_path_buf())
                .unwrap_or(current_dir)
        } else {
            current_dir
        };
        
        let logs_dir = project_root.join("panel").join("logs");
        let data_dir = project_root.join("panel").join("data");
        let state_file = project_root.join("panel").join("state.json");
        
        Ok(Self {
            project_root,
            logs_dir,
            data_dir,
            state_file,
            ..Default::default()
        })
    }
}

