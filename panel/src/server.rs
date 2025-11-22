use anyhow::{Context, Result};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{sse::Event, IntoResponse, Sse},
    routing::{get, post},
    Json, Router,
};
use crate::config::Config;
use crate::docker_manager::DockerManager;
use crate::log_manager::LogManager;
use crate::metrics::MetricsCollector;
use crate::models::{ContainerInfo, FilteredLogsResponse, LogEntry, Service, ServiceStatus};
use crate::process_manager::ProcessManager;
use crate::service_detector::ServiceDetector;
use std::collections::HashMap;
use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::{
    cors::CorsLayer,
    services::ServeDir,
};
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
        LogManager::new(logs_dir.clone(), Some(config.data_dir.clone())).context("Failed to initialize log manager")?
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

    // Background task: Migrate existing logs to database (non-blocking)
    let log_manager_clone = log_manager.clone();
    tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await; // Wait 5 seconds after startup
        match log_manager_clone.migrate_all_file_logs_to_db().await {
            Ok(count) => {
                if count > 0 {
                    info!("Migrated {} log entries from files to database", count);
                }
            }
            Err(e) => {
                warn!("Failed to migrate logs to database: {}", e);
            }
        }
    });

    // Background task: Cleanup old logs (run daily)
    let log_manager_cleanup = log_manager.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(86400)); // 24 hours
        interval.tick().await; // Skip first tick
        
        loop {
            interval.tick().await;
            if let Some(db) = log_manager_cleanup.get_database() {
                match db.cleanup_old_logs(30).await {
                    Ok(deleted) => {
                        if deleted > 0 {
                            info!("Cleaned up {} old log entries (older than 30 days)", deleted);
                        }
                    }
                    Err(e) => {
                        warn!("Failed to cleanup old logs: {}", e);
                    }
                }
            }
        }
    });

    // Recover processes from state file
    info!("Recovering processes from previous session...");
    if let Err(e) = process_manager.recover_processes(detected_services.clone()).await {
        warn!("Failed to recover processes: {}", e);
    }

    let services = Arc::new(RwLock::new(detected_services));

    let app_state = AppState {
        process_manager,
        docker_manager,
        log_manager,
        metrics_collector,
        services,
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
        .nest_service("/", ServeDir::new(static_path))
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
    
    let result = state.log_manager.get_combined_logs(level, search, Some(lines)).await
        .map_err(|e| {
            error!("Failed to get combined logs: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    
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
    let database = match state.log_manager.get_database() {
        Some(db) => db,
        None => {
            return Err(StatusCode::SERVICE_UNAVAILABLE);
        }
    };

    let stats = database.get_log_stats().await
        .map_err(|e| {
            error!("Failed to get log stats: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(stats))
}

