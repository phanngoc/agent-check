use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilteredLogsResponse {
    pub logs: Vec<LogEntry>,
    pub total: usize,
    pub filtered: usize,
}

// Project Management Models

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProjectType {
    #[serde(rename = "laravel")]
    Laravel,
    #[serde(rename = "nestjs")]
    NestJS,
    #[serde(rename = "nextjs")]
    NextJS,
    #[serde(rename = "unknown")]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProjectStatus {
    #[serde(rename = "active")]
    Active,
    #[serde(rename = "inactive")]
    Inactive,
    #[serde(rename = "error")]
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub project_id: Uuid,
    pub name: String,
    pub directory_path: String,
    pub schema_name: String,
    pub database_type: Option<String>,
    pub database_url: Option<String>,
    pub framework: Option<String>,
    pub metadata: ProjectMetadata,
    pub last_scan_at: Option<DateTime<Utc>>,
    pub status: ProjectStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectMetadata {
    pub tables: Vec<TableInfo>,
    pub models: Vec<ModelInfo>,
    pub routes: Vec<RouteInfo>,
    pub apis: Vec<ApiInfo>,
    pub dependencies: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub name: String,
    pub columns: Vec<ColumnInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub is_primary_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    pub file_path: String,
    pub fields: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteInfo {
    pub method: String,
    pub path: String,
    pub handler: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiInfo {
    pub method: String,
    pub path: String,
    pub controller: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub directory_path: String,
    pub schema_name: Option<String>,
    pub database_type: Option<String>,
    pub database_url: Option<String>,
    pub framework: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProjectRequest {
    pub name: Option<String>,
    pub directory_path: Option<String>,
    pub database_type: Option<String>,
    pub database_url: Option<String>,
    pub framework: Option<String>,
    pub status: Option<ProjectStatus>,
}

