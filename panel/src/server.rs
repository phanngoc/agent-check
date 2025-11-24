use anyhow::{Context, Result};
use axum::{
    extract::{Path, Query, State, ws::{WebSocket, WebSocketUpgrade, Message}},
    http::StatusCode,
    response::{sse::Event, IntoResponse, Sse, Response},
    routing::{get, post, delete},
    Json, Router,
};
use crate::config::Config;
use crate::dev_server_manager::DevServerManager;
use crate::claude_service::ClaudeService;
use crate::docker_manager::DockerManager;
use crate::log_manager::LogManager;
use crate::metrics::MetricsCollector;
use crate::models::{ContainerInfo, CreateProjectRequest, FilteredLogsResponse, LogEntry, Project, Service, ServiceStatus};
use crate::process_manager::ProcessManager;
use crate::project_manager::ProjectManager;
use crate::project_repository::ProjectRepository;
use crate::project_scanner::ProjectScanner;
use crate::schema_manager::SchemaManager;
use crate::service_detector::ServiceDetector;
use std::collections::HashMap;
use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;
use tower_http::{
    cors::CorsLayer,
    services::ServeDir,
};
use axum::response::Html;
use std::fs;
use tracing::{info, error, debug, warn};
use futures::Stream;
use chrono::Utc;

#[derive(Clone)]
pub struct AppState {
    pub process_manager: Arc<ProcessManager>,
    pub docker_manager: Arc<DockerManager>,
    pub log_manager: Arc<LogManager>,
    pub metrics_collector: Arc<MetricsCollector>,
    pub services: Arc<RwLock<Vec<Service>>>,
    pub project_repository: Arc<ProjectRepository>,
    pub schema_manager: Arc<SchemaManager>,
    pub project_scanner: Arc<ProjectScanner>,
    pub project_manager: Arc<ProjectManager>,
    pub dev_server_manager: Arc<DevServerManager>,
    pub claude_service: Arc<ClaudeService>,
    #[allow(dead_code)]
    pub project_root: PathBuf,
}

pub async fn start_server(config: Config) -> Result<()> {
    info!("Starting HTTP server on {}:{}", config.host, config.port);

    // Initialize managers
    let logs_dir = config.logs_dir.clone();
    let state_file = config.state_file.clone();
    let process_manager = Arc::new(ProcessManager::new(
        config.auto_restart,
        config.max_restart_attempts,
        logs_dir.clone(),
        state_file,
    ));
    
    let docker_manager = Arc::new(
        DockerManager::new().await.context("Failed to initialize Docker manager")?
    );

    let log_manager = Arc::new(
        LogManager::new(
            logs_dir.clone(),
            Some(config.data_dir.clone()),
            Some(&config.timescale_db_url),
        )
        .await
        .context("Failed to initialize log manager")?
    );
    
    // Determine static files path
    let static_path = if std::path::Path::new("static").exists() {
        "static"
    } else {
        "panel/static"
    };
    
    let metrics_collector = Arc::new(MetricsCollector::new());

    // Detect services
    let detected_services = ServiceDetector::detect_services(&config.project_root)
        .context("Failed to detect services")?;
    
    info!("Detected {} services", detected_services.len());

    // Register services with log manager
    for service in &detected_services {
        let _ = log_manager.register_service(service.id.clone()).await;
    }

    // Background task: Cleanup old logs (run daily)
    // Note: TimescaleDB has its own retention policy, so we only cleanup SQLite if used
    let log_manager_cleanup = log_manager.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(86400)); // 24 hours
        interval.tick().await; // Skip first tick
        
        loop {
            interval.tick().await;
            // Only cleanup SQLite if TimescaleDB is not available
            if log_manager_cleanup.get_timescale_db().is_none() {
                if let Some(db) = log_manager_cleanup.get_database() {
                    match db.cleanup_old_logs(30).await {
                        Ok(deleted) => {
                            if deleted > 0 {
                                info!("Cleaned up {} old log entries from SQLite (older than 30 days)", deleted);
                            }
                        }
                        Err(e) => {
                            warn!("Failed to cleanup old logs: {}", e);
                        }
                    }
                }
            } else {
                // TimescaleDB has retention policy, no manual cleanup needed
                debug!("TimescaleDB retention policy handles cleanup automatically");
            }
        }
    });

    // Recover processes from state file
    info!("Recovering processes from previous session...");
    if let Err(e) = process_manager.recover_processes(detected_services.clone()).await {
        warn!("Failed to recover processes: {}", e);
    }

    let services = Arc::new(RwLock::new(detected_services));

    // Initialize project management
    let project_repository = Arc::new(
        ProjectRepository::new(&config.timescale_db_url)
            .await
            .context("Failed to initialize project repository")?
    );

    let schema_manager = Arc::new(
        SchemaManager::new(&config.timescale_db_url)
            .await
            .context("Failed to initialize schema manager")?
    );

    let project_scanner = Arc::new(
        ProjectScanner::new(
            config.project_root.clone(),
            project_repository.clone(),
            schema_manager.clone(),
        )
    );

    let project_manager = Arc::new(
        ProjectManager::new(config.project_root.clone())
    );

    let dev_server_manager = Arc::new(
        DevServerManager::new(config.project_root.clone())
    );

    let claude_service = Arc::new(
        ClaudeService::new(config.project_root.clone())
    );

    let app_state = AppState {
        process_manager,
        docker_manager,
        log_manager,
        metrics_collector,
        services,
        project_repository,
        schema_manager,
        project_scanner,
        project_manager,
        dev_server_manager,
        claude_service,
        project_root: config.project_root,
    };

    // Build router
    // Note: More specific routes must come before generic routes
    let app = Router::new()
        .route("/api/services", get(list_services))
        .route("/api/services/:id/start", post(start_service))
        .route("/api/services/:id/stop", post(stop_service))
        .route("/api/services/:id/restart", post(restart_service))
        .route("/api/services/:id/status", get(get_service_status))
        .route("/api/services/:id/logs/stream", get(stream_service_logs))
        .route("/api/services/:id/logs", get(get_service_logs))
        .route("/api/services/:id/metrics", get(get_service_metrics))
        .route("/api/services/:id", get(get_service_detail))
        .route("/api/logs/combined/stream", get(stream_combined_logs))
        .route("/api/logs/combined", get(get_combined_logs))
        .route("/api/containers", get(list_containers))
        .route("/api/containers/:id/start", post(start_container))
        .route("/api/containers/:id/stop", post(stop_container))
        .route("/api/containers/:id/restart", post(restart_container))
        .route("/api/containers/:id/logs", get(get_container_logs))
        .route("/api/system/metrics", get(get_system_metrics))
        .route("/api/logs/cleanup", post(cleanup_logs))
        .route("/api/logs/stats", get(get_log_stats))
        .route("/api/projects", get(list_projects).post(create_project))
        .route("/api/projects/:id", get(get_project))
        // TODO: Fix update_project handler - axum routing issue with Path + Json extractors
        // Temporarily disabled - need to investigate axum handler trait requirements
        // .route("/api/projects/:id/update", post(update_project_handler))
        .route("/api/projects/:id", delete(delete_project))
        .route("/api/projects/:id/metadata", get(get_project_metadata))
        .route("/api/projects/scan", post(scan_all_projects))
        .route("/api/projects/:name/scan", post(scan_project))
        .route("/api/projects/:id/files", get(list_project_files))
        .route("/api/projects/:id/files/*path", get(get_project_file).put(save_project_file))
        .route("/api/projects/:id/dev-server/start", post(start_dev_server))
        .route("/api/projects/:id/dev-server/stop", post(stop_dev_server))
        .route("/api/projects/:id/dev-server/status", get(get_dev_server_status))
        .route("/ws/projects/:id/chat", get(handle_chat_websocket))
        .nest_service("/assets", ServeDir::new(format!("{}/assets", static_path)))
        .fallback(serve_spa_handler)
        .layer(CorsLayer::permissive())
        .with_state(app_state);

    let addr = format!("{}:{}", config.host, config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await
        .context("Failed to bind to address")?;
    
    info!("Server listening on http://{}", addr);
    
    axum::serve(listener, app).await
        .context("Server error")?;

    Ok(())
}

// SPA fallback handler - serve index.html for all non-API routes
async fn serve_spa_handler() -> Result<Html<String>, StatusCode> {
    let static_path = if std::path::Path::new("static").exists() {
        "static"
    } else {
        "panel/static"
    };
    
    let index_path = format!("{}/index.html", static_path);
    
    match fs::read_to_string(&index_path) {
        Ok(content) => Ok(Html(content)),
        Err(_) => Err(StatusCode::NOT_FOUND),
    }
}

async fn list_services(State(state): State<AppState>) -> Json<Vec<Service>> {
    debug!("[DEBUG] list_services called - syncing status from process_manager");
    
    let mut services = state.services.read().await.clone();
    
    // Merge status from process_manager into services
    for service in &mut services {
        if let Some(actual_status) = state.process_manager.get_service_status(&service.id).await {
            debug!("[DEBUG] Syncing status for service {}: {:?} -> {:?}", 
                service.id, service.status, actual_status);
            service.status = actual_status;
            
            // Also sync other fields from process_manager if available
            if let Some(_process_info) = state.process_manager.get_process_info(&service.id).await {
                // Update restart_count if available in the managed process
                // Note: We can't directly access restart_count from process_info,
                // but we can keep the status sync which is the main issue
            }
        } else {
            debug!("[DEBUG] No process_manager status for service {}, keeping original status: {:?}", 
                service.id, service.status);
        }
    }
    
    debug!("[DEBUG] list_services returning {} services", services.len());
    Json(services)
}

async fn start_service(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    debug!("Received start request for service: {}", id);
    
    let services = state.services.read().await;
    let service = services.iter().find(|s| s.id == id)
        .ok_or_else(|| {
            debug!("Service not found: {}", id);
            StatusCode::NOT_FOUND
        })?;
    
    debug!("Service found - id: {}, name: {}, command: '{}', working_dir: '{}', env vars: {:?}", 
        service.id, service.name, service.command, service.working_dir, service.environment);
    
    let service_clone = service.clone();
    drop(services);

    debug!("Calling process_manager.start_service for: {}", id);
    let result = state.process_manager.start_service(service_clone).await;
    
    match &result {
        Ok(_) => {
            debug!("Successfully started service: {}", id);
            debug!("[DEBUG] Updating state.services status for service: {}", id);
            
            // Get status from process_manager first (before acquiring write lock)
            let actual_status = state.process_manager.get_service_status(&id).await;
            
            // Update status in state.services
            let mut services = state.services.write().await;
            if let Some(service) = services.iter_mut().find(|s| s.id == id) {
                if let Some(status) = actual_status {
                    debug!("[DEBUG] Updating service {} status from {:?} to {:?}", 
                        id, service.status, status);
                    service.status = status;
                    service.updated_at = Utc::now();
                } else {
                    debug!("[DEBUG] Could not get status from process_manager for service: {}", id);
                    // Set to Running as fallback since start was successful
                    service.status = crate::models::ServiceStatus::Running;
                    service.updated_at = Utc::now();
                }
            } else {
                debug!("[DEBUG] Service {} not found in state.services to update", id);
            }
        }
        Err(e) => {
            error!("Failed to start service: {}", e);
            debug!("Error details for service {}: {:?}", id, e);
        }
    }

    result
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
        .map(|_| StatusCode::OK)
}

async fn stop_service(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    debug!("[DEBUG] Received stop request for service: {}", id);
    
    let result = state.process_manager.stop_service(&id).await;
    
    match &result {
        Ok(_) => {
            debug!("[DEBUG] Successfully stopped service: {}", id);
            debug!("[DEBUG] Updating state.services status for service: {}", id);
            
            // Update status in state.services
            let mut services = state.services.write().await;
            if let Some(service) = services.iter_mut().find(|s| s.id == id) {
                debug!("[DEBUG] Updating service {} status to Stopped", id);
                service.status = crate::models::ServiceStatus::Stopped;
                service.updated_at = Utc::now();
            } else {
                debug!("[DEBUG] Service {} not found in state.services to update", id);
            }
        }
        Err(e) => {
            error!("Failed to stop service: {}", e);
            debug!("[DEBUG] Error details for service {}: {:?}", id, e);
        }
    }
    
    result
        .map_err(|e| {
            error!("Failed to stop service: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(|_| StatusCode::OK)
}

async fn restart_service(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    state.process_manager.restart_service(&id).await
        .map_err(|e| {
            error!("Failed to restart service: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::OK)
}

async fn get_service_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ServiceStatus>, StatusCode> {
    let status = state.process_manager.get_service_status(&id).await
        .ok_or(StatusCode::NOT_FOUND)?;
    
    Ok(Json(status))
}

async fn get_service_detail(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Service>, StatusCode> {
    debug!("[DEBUG] get_service_detail called for service: {}", id);
    
    let services = state.services.read().await;
    debug!("[DEBUG] Total services available: {}", services.len());
    debug!("[DEBUG] Service IDs: {:?}", services.iter().map(|s| &s.id).collect::<Vec<_>>());
    
    let service = services.iter().find(|s| s.id == id)
        .ok_or_else(|| {
            debug!("[DEBUG] Service not found: {}", id);
            StatusCode::NOT_FOUND
        })?;
    
    debug!("[DEBUG] Service found: {} - {}", service.id, service.name);
    
    // Sync status from process_manager
    let mut service_clone = service.clone();
    if let Some(actual_status) = state.process_manager.get_service_status(&id).await {
        debug!("[DEBUG] Syncing status for {}: {:?} -> {:?}", id, service_clone.status, actual_status);
        service_clone.status = actual_status;
    }
    
    Ok(Json(service_clone))
}

async fn get_service_logs(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<FilteredLogsResponse>, StatusCode> {
    // Check if filtering is requested
    let has_filter = params.contains_key("level") 
        || params.contains_key("from") 
        || params.contains_key("to") 
        || params.contains_key("search");
    
    if has_filter {
        // Use filtered logs
        let level = params.get("level").map(|s| s.as_str());
        let from = params.get("from").and_then(|s| {
            chrono::DateTime::parse_from_rfc3339(s)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .ok()
                .or_else(|| s.parse::<chrono::DateTime<chrono::Utc>>().ok())
        });
        let to = params.get("to").and_then(|s| {
            chrono::DateTime::parse_from_rfc3339(s)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .ok()
                .or_else(|| s.parse::<chrono::DateTime<chrono::Utc>>().ok())
        });
        let search = params.get("search").map(|s| s.as_str());
        let operator = params.get("operator").map(|s| s.as_str()).unwrap_or("and");
        let limit = params.get("limit")
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(1000);
        
        let result = state.log_manager.get_filtered_logs(
            &id,
            level,
            from,
            to,
            search,
            operator == "or",
            limit,
        ).await
        .map_err(|e| {
            error!("Failed to get filtered logs: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
        
        Ok(Json(result))
    } else {
        // Use simple logs (backward compatibility)
        let lines = params.get("lines")
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(100);
        
        let log_lines = state.log_manager.get_logs(&id, Some(lines)).await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        
        // Convert to LogEntry format
        let logs: Vec<LogEntry> = log_lines.into_iter().map(|line| {
            let (level, timestamp) = crate::log_manager::LogManager::parse_log_line(&line);
            LogEntry {
                timestamp,
                service_id: id.clone(),
                level,
                message: line,
            }
        }).collect();
        
        let total = logs.len();
        Ok(Json(FilteredLogsResponse {
            logs,
            total,
            filtered: total,
        }))
    }
}

async fn stream_service_logs(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let receiver = state.log_manager.get_log_receiver(&id).await
        .unwrap_or_else(|| {
            // Create a dummy receiver if not found
            let (tx, rx) = tokio::sync::broadcast::channel(1);
            drop(tx);
            rx
        });

    let stream = async_stream::stream! {
        let mut receiver = receiver;
        loop {
            tokio::select! {
                result = receiver.recv() => {
                    match result {
                        Ok(entry) => {
                            let json = serde_json::to_string(&entry).unwrap_or_default();
                            yield Ok(Event::default().data(json));
                        }
                        Err(_) => {
                            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                        }
                    }
                }
            }
        }
    };

    Sse::new(stream)
}

async fn get_service_metrics(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<crate::models::ProcessInfo>, StatusCode> {
    debug!("[DEBUG] get_service_metrics called for service: {}", id);
    
    // First, check if service exists in the services list
    let services = state.services.read().await;
    let service_exists = services.iter().any(|s| s.id == id);
    drop(services);
    
    if !service_exists {
        debug!("[DEBUG] Service {} not found in services list", id);
        return Err(StatusCode::NOT_FOUND);
    }
    
    debug!("[DEBUG] Service {} exists, checking process info", id);
    
    // Try to get process info from process_manager
    if let Some(process_info) = state.process_manager.get_process_info(&id).await {
        debug!("[DEBUG] Found process info for service {}: pid={:?}, cpu={:.2}%, memory={} bytes", 
            id, process_info.pid, process_info.cpu_usage, process_info.memory_usage);
        return Ok(Json(process_info));
    }
    
    // Service exists but not started yet, return default metrics
    debug!("[DEBUG] Service {} exists but not started, returning default metrics", id);
    let default_metrics = crate::models::ProcessInfo {
        pid: None,
        cpu_usage: 0.0,
        memory_usage: 0,
        uptime: 0,
        status: crate::models::ServiceStatus::Stopped,
    };
    
    Ok(Json(default_metrics))
}

async fn list_containers(
    State(state): State<AppState>,
) -> Result<Json<Vec<ContainerInfo>>, StatusCode> {
    let containers = state.docker_manager.list_containers().await
        .map_err(|e| {
            error!("Failed to list containers: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    
    Ok(Json(containers))
}

async fn start_container(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    state.docker_manager.start_container(&id).await
        .map_err(|e| {
            error!("Failed to start container: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::OK)
}

async fn stop_container(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    state.docker_manager.stop_container(&id).await
        .map_err(|e| {
            error!("Failed to stop container: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::OK)
}

async fn restart_container(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    state.docker_manager.restart_container(&id).await
        .map_err(|e| {
            error!("Failed to restart container: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::OK)
}

async fn get_container_logs(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Vec<String>>, StatusCode> {
    let tail = params.get("tail")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(100);
    
    let logs = state.docker_manager.get_container_logs(&id, Some(tail)).await
        .map_err(|e| {
            error!("Failed to get container logs: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    
    Ok(Json(logs))
}

async fn get_system_metrics(
    State(state): State<AppState>,
) -> Result<Json<HashMap<String, f64>>, StatusCode> {
    let metrics = state.metrics_collector.get_system_metrics().await
        .map_err(|e| {
            error!("Failed to get system metrics: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    
    Ok(Json(metrics))
}

async fn get_combined_logs(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<FilteredLogsResponse>, StatusCode> {
    let level = params.get("level").map(|s| s.as_str());
    let search = params.get("search").map(|s| s.as_str());
    let lines = params.get("lines")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(100);
    
    // Check if we have filters: level != "all" or search is not empty
    let has_filter = level.map(|l| l.to_lowercase() != "all").unwrap_or(false)
        || search.map(|s| !s.is_empty()).unwrap_or(false);
    
    info!("[Server] get_combined_logs called - has_filter: {}, level: {:?}, search: {:?}, lines: {}", 
        has_filter, level, search, lines);
    
    let result = if has_filter {
        // Filtered mode: query from TimescaleDB
        debug!("[Server] Using filtered mode (TimescaleDB)");
        state.log_manager.get_combined_logs_filtered(level, search, Some(lines)).await
            .map_err(|e| {
                error!("[Server] Failed to get filtered combined logs: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?
    } else {
        // Realtime mode: get from files
        debug!("[Server] Using realtime mode (files)");
        state.log_manager.get_combined_logs_realtime(Some(lines)).await
            .map_err(|e| {
                error!("[Server] Failed to get realtime combined logs: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?
    };
    
    info!("[Server] get_combined_logs returning {} logs (total: {}, filtered: {})", 
        result.logs.len(), result.total, result.filtered);
    
    Ok(Json(result))
}

async fn stream_combined_logs(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let receivers = state.log_manager.get_combined_log_receivers().await;
    
    let stream = async_stream::stream! {
        // Create a vector to hold all receivers
        let mut receivers_vec: Vec<(String, tokio::sync::broadcast::Receiver<LogEntry>)> = receivers;
        
        loop {
            let mut any_received = false;
            
            // Check all receivers for new messages
            for (_service_id, receiver) in &mut receivers_vec {
                match receiver.try_recv() {
                    Ok(entry) => {
                        any_received = true;
                        let json = serde_json::to_string(&entry).unwrap_or_default();
                        yield Ok(Event::default().data(json));
                    }
                    Err(tokio::sync::broadcast::error::TryRecvError::Empty) => {
                        // No message available, continue
                    }
                    Err(tokio::sync::broadcast::error::TryRecvError::Lagged(_)) => {
                        // Lagged, continue
                    }
                    Err(tokio::sync::broadcast::error::TryRecvError::Closed) => {
                        // Channel closed, continue
                    }
                }
            }
            
            if !any_received {
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            }
        }
    };
    
    Sse::new(stream)
}

async fn cleanup_logs(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<HashMap<String, usize>>, StatusCode> {
    let days = params.get("days")
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(30);

    let database = match state.log_manager.get_database() {
        Some(db) => db,
        None => {
            return Err(StatusCode::SERVICE_UNAVAILABLE);
        }
    };

    let deleted = database.cleanup_old_logs(days).await
        .map_err(|e| {
            error!("Failed to cleanup logs: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let mut response = HashMap::new();
    response.insert("deleted".to_string(), deleted);
    response.insert("days".to_string(), days as usize);

    Ok(Json(response))
}

async fn get_log_stats(
    State(state): State<AppState>,
) -> Result<Json<HashMap<String, usize>>, StatusCode> {
    // Try TimescaleDB first, fallback to SQLite
    let stats = if let Some(timescale_db) = state.log_manager.get_timescale_db() {
        timescale_db.get_log_stats().await
            .map_err(|e| {
                error!("Failed to get log stats from TimescaleDB: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?
    } else if let Some(database) = state.log_manager.get_database() {
        database.get_log_stats().await
            .map_err(|e| {
                error!("Failed to get log stats from SQLite: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?
    } else {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    };

    Ok(Json(stats))
}

// Project Management Handlers

async fn list_projects(
    State(state): State<AppState>,
) -> Result<Json<Vec<Project>>, StatusCode> {
    let projects = state.project_repository.list().await
        .map_err(|e| {
            error!("Failed to list projects: {}", e);
            // Log the full error chain for debugging
            let mut error_chain = format!("{}", e);
            let mut source = e.source();
            while let Some(err) = source {
                error_chain.push_str(&format!(": {}", err));
                source = err.source();
            }
            error!("Error chain: {}", error_chain);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    Ok(Json(projects))
}

async fn get_project(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Project>, StatusCode> {
    let project_id = Uuid::parse_str(&id)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let project = state.project_repository.get_by_id(project_id).await
        .map_err(|e| {
            error!("Failed to get project: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(project))
}

async fn create_project(
    State(state): State<AppState>,
    Json(request): Json<CreateProjectRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    use crate::models::ProjectStatus;
    use crate::schema_manager::SchemaManager;

    let schema_name = request.schema_name
        .unwrap_or_else(|| SchemaManager::generate_schema_name(&request.name));

    // Tạo project folder trong ./sites
    let project_path = state.project_manager.create_project_folder(&request.name)
        .map_err(|e| {
            error!("Failed to create project folder: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Tạo schema trong database
    if let Err(e) = state.schema_manager.create_schema(&schema_name).await {
        error!("Failed to create schema: {}", e);
        // Cleanup: xóa folder nếu tạo schema thất bại
        let _ = std::fs::remove_dir_all(&project_path);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    // Tạo project record trong database
    let directory_path = project_path.to_string_lossy().to_string();
    let project = Project {
        project_id: Uuid::new_v4(),
        name: request.name,
        directory_path,
        schema_name,
        database_type: request.database_type,
        database_url: request.database_url,
        framework: request.framework,
        metadata: crate::models::ProjectMetadata::default(),
        last_scan_at: None,
        status: ProjectStatus::Active,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    let project_id = match state.project_repository.create(&project).await {
        Ok(id) => id,
        Err(e) => {
            error!("Failed to create project: {}", e);
            // Cleanup: xóa folder và schema nếu tạo DB record thất bại
            let _ = std::fs::remove_dir_all(&project_path);
            let schema_name_clone = project.schema_name.clone();
            let schema_manager_clone = state.schema_manager.clone();
            tokio::spawn(async move {
                let _ = schema_manager_clone.drop_schema(&schema_name_clone, true).await;
            });
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    Ok((StatusCode::CREATED, Json(serde_json::json!({
        "project_id": project_id,
        "message": "Project created successfully"
    }))))
}

// TODO: Fix update_project handler - axum routing issue with Path + Json extractors
// Temporarily disabled - need to investigate axum handler trait requirements
/*
async fn update_project_handler(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(request): Json<UpdateProjectRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let project_id = Uuid::parse_str(&id)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    state.project_repository.update(project_id, &request).await
        .map_err(|e| {
            error!("Failed to update project: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::OK)
}
*/

async fn delete_project(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let project_id = Uuid::parse_str(&id)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    state.project_repository.delete(project_id).await
        .map_err(|e| {
            error!("Failed to delete project: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

async fn get_project_metadata(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<crate::models::ProjectMetadata>, StatusCode> {
    let project_id = Uuid::parse_str(&id)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let project = state.project_repository.get_by_id(project_id).await
        .map_err(|e| {
            error!("Failed to get project: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(project.metadata))
}

async fn scan_all_projects(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let project_ids = state.project_scanner.scan_all_projects_in_sites().await
        .map_err(|e| {
            error!("Failed to scan projects: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(serde_json::json!({
        "message": "Scan completed",
        "projects_scanned": project_ids.len(),
        "project_ids": project_ids
    })))
}

async fn scan_project(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let sites_dir = state.project_root.join("sites").join(&name);
    
    if !sites_dir.exists() {
        return Err(StatusCode::NOT_FOUND);
    }

    let project_id = state.project_scanner.scan_project(&sites_dir, &name).await
        .map_err(|e| {
            error!("Failed to scan project: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(serde_json::json!({
        "message": "Project scanned successfully",
        "project_id": project_id
    })))
}

// Project Editor APIs
async fn list_project_files(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Vec<String>>, StatusCode> {
    let project_id = Uuid::parse_str(&id)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let project = state.project_repository.get_by_id(project_id).await
        .map_err(|e| {
            error!("Failed to get project: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    let files = state.project_manager.list_project_files(&project.name)
        .map_err(|e| {
            error!("Failed to list project files: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(files))
}

async fn get_project_file(
    State(state): State<AppState>,
    Path((id, path)): Path<(String, String)>,
) -> Result<String, StatusCode> {
    let project_id = Uuid::parse_str(&id)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let project = state.project_repository.get_by_id(project_id).await
        .map_err(|e| {
            error!("Failed to get project: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    let content = state.project_manager.read_file(&project.name, &path)
        .map_err(|e| {
            error!("Failed to read file: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(content)
}

async fn save_project_file(
    State(state): State<AppState>,
    Path((id, path)): Path<(String, String)>,
    body: String,
) -> Result<StatusCode, StatusCode> {
    let project_id = Uuid::parse_str(&id)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let project = state.project_repository.get_by_id(project_id).await
        .map_err(|e| {
            error!("Failed to get project: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    state.project_manager.write_file(&project.name, &path, &body)
        .map_err(|e| {
            error!("Failed to write file: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::OK)
}

async fn start_dev_server(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let project_id = Uuid::parse_str(&id)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let project = state.project_repository.get_by_id(project_id).await
        .map_err(|e| {
            error!("Failed to get project: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    let project_path = PathBuf::from(&project.directory_path);
    state.dev_server_manager.start_server(project_id, project_path).await
        .map_err(|e| {
            error!("Failed to start dev server: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::OK)
}

async fn stop_dev_server(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let project_id = Uuid::parse_str(&id)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    state.dev_server_manager.stop_server(project_id).await
        .map_err(|e| {
            error!("Failed to stop dev server: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::OK)
}

async fn get_dev_server_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let project_id = Uuid::parse_str(&id)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    if let Some(server_info) = state.dev_server_manager.get_status(project_id).await {
        Ok(Json(serde_json::json!({
            "running": true,
            "url": server_info.url,
            "port": server_info.port
        })))
    } else {
        Ok(Json(serde_json::json!({
            "running": false
        })))
    }
}

// WebSocket handler for chat
async fn handle_chat_websocket(
    State(state): State<AppState>,
    Path(id): Path<String>,
    ws: WebSocketUpgrade,
) -> Response {
    let project_id = match Uuid::parse_str(&id) {
        Ok(id) => id,
        Err(_) => {
            return StatusCode::BAD_REQUEST.into_response();
        }
    };

    // Get project
    let project = match state.project_repository.get_by_id(project_id).await {
        Ok(Some(p)) => p,
        Ok(None) => {
            return StatusCode::NOT_FOUND.into_response();
        }
        Err(_) => {
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let project_path = PathBuf::from(&project.directory_path);
    let claude_service = state.claude_service.clone();

    // Handle WebSocket connection
    ws.on_upgrade(move |socket| handle_socket(socket, claude_service, project_path))
}

async fn handle_socket(
    socket: WebSocket,
    claude_service: Arc<ClaudeService>,
    project_path: PathBuf,
) {
    let (mut sender, mut receiver) = socket.split();
    let mut message_id = 0u64;

    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                // Parse message
                let data: serde_json::Value = match serde_json::from_str(&text) {
                    Ok(d) => d,
                    Err(_) => continue,
                };

                if data["type"] == "message" {
                    let user_message = data["content"].as_str().unwrap_or("");
                    
                    // Send user message back
                    message_id += 1;
                    let user_msg = serde_json::json!({
                        "type": "message",
                        "id": message_id.to_string(),
                        "role": "user",
                        "content": user_message,
                        "timestamp": chrono::Utc::now()
                    });
                    let _ = sender.send(Message::Text(user_msg.to_string())).await;

                    // Execute Claude command
                    message_id += 1;
                    let assistant_id = message_id.to_string();
                    
                    match claude_service.execute_command(project_path.clone(), user_message.to_string()).await {
                        Ok(mut rx) => {
                            // Accumulate content for streaming
                            let mut accumulated_content = String::new();
                            let mut chunk_count = 0;
                            
                            debug!("Starting to receive chunks from Claude service");
                            
                            // Stream responses
                            while let Some(chunk) = rx.recv().await {
                                chunk_count += 1;
                                debug!("Received chunk #{}: {} (length: {})", chunk_count, chunk.chars().take(50).collect::<String>(), chunk.len());
                                
                                // Filter out "[DONE]" and other control signals
                                if chunk.trim() == "[DONE]" || chunk.trim().starts_with("[") {
                                    debug!("Filtered out control signal: {}", chunk);
                                    continue;
                                }
                                
                                // Accumulate content
                                accumulated_content.push_str(&chunk);
                                debug!("Accumulated content length: {}", accumulated_content.len());
                                
                                // Send accumulated content so far (for streaming effect)
                                let msg = serde_json::json!({
                                    "type": "message",
                                    "id": assistant_id,
                                    "role": "assistant",
                                    "content": accumulated_content.clone(),
                                    "timestamp": chrono::Utc::now()
                                });
                                
                                debug!("Sending message to client (content length: {})", accumulated_content.len());
                                let _ = sender.send(Message::Text(msg.to_string())).await;
                            }

                            debug!("Finished receiving chunks. Total chunks: {}, Final content length: {}", chunk_count, accumulated_content.len());
                            
                            // If we have content but no chunks were sent, send it now
                            if !accumulated_content.is_empty() && chunk_count == 0 {
                                debug!("Sending accumulated content as single message");
                                let msg = serde_json::json!({
                                    "type": "message",
                                    "id": assistant_id,
                                    "role": "assistant",
                                    "content": accumulated_content,
                                    "timestamp": chrono::Utc::now()
                                });
                                let _ = sender.send(Message::Text(msg.to_string())).await;
                            }

                            // Send done signal
                            let done_msg = serde_json::json!({
                                "type": "done"
                            });
                            debug!("Sending done signal");
                            let _ = sender.send(Message::Text(done_msg.to_string())).await;
                        }
                        Err(e) => {
                            let error_msg = serde_json::json!({
                                "type": "error",
                                "message": e.to_string()
                            });
                            let _ = sender.send(Message::Text(error_msg.to_string())).await;
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => {
                break;
            }
            _ => {}
        }
    }
}

// Fix missing import
use futures::{SinkExt, StreamExt};

