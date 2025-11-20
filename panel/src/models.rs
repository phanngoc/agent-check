use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ServiceType {
    #[serde(rename = "go")]
    Go,
    #[serde(rename = "nodejs")]
    NodeJs,
    #[serde(rename = "typescript")]
    TypeScript,
    #[serde(rename = "php")]
    Php,
    #[serde(rename = "docker")]
    Docker,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ServiceStatus {
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "stopped")]
    Stopped,
    #[serde(rename = "error")]
    Error,
    #[serde(rename = "starting")]
    Starting,
    #[serde(rename = "stopping")]
    Stopping,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Service {
    pub id: String,
    pub name: String,
    pub service_type: ServiceType,
    pub status: ServiceStatus,
    pub command: String,
    pub working_dir: String,
    pub port: Option<u16>,
    pub auto_restart: bool,
    pub restart_count: u32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub environment: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: Option<u32>,
    pub cpu_usage: f32,
    pub memory_usage: u64, // bytes
    pub uptime: u64,       // seconds
    pub status: ServiceStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerInfo {
    pub id: String,
    pub name: String,
    pub status: String,
    pub image: String,
    pub ports: Vec<String>,
    pub cpu_usage: f32,
    pub memory_usage: u64,
    pub created: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: DateTime<Utc>,
    pub service_id: String,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct Metrics {
    pub service_id: String,
    pub cpu_usage: f32,
    pub memory_usage: u64,
    pub uptime: u64,
    pub timestamp: DateTime<Utc>,
}

