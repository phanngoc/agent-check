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
use crate::models::{ContainerInfo, Service, ServiceStatus};
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
use tracing::{info, error};
use futures::Stream;

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
    let process_manager = Arc::new(ProcessManager::new(
        config.auto_restart,
        config.max_restart_attempts,
    ));
    
    let docker_manager = Arc::new(
        DockerManager::new().await.context("Failed to initialize Docker manager")?
    );
    
    let logs_dir = config.logs_dir.clone();
    let log_manager = Arc::new(
        LogManager::new(logs_dir).context("Failed to initialize log manager")?
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
    let app = Router::new()
        .route("/api/services", get(list_services))
        .route("/api/services/:id/start", post(start_service))
        .route("/api/services/:id/stop", post(stop_service))
        .route("/api/services/:id/restart", post(restart_service))
        .route("/api/services/:id/status", get(get_service_status))
        .route("/api/services/:id/logs", get(get_service_logs))
        .route("/api/services/:id/logs/stream", get(stream_service_logs))
        .route("/api/services/:id/metrics", get(get_service_metrics))
        .route("/api/containers", get(list_containers))
        .route("/api/containers/:id/start", post(start_container))
        .route("/api/containers/:id/stop", post(stop_container))
        .route("/api/containers/:id/restart", post(restart_container))
        .route("/api/containers/:id/logs", get(get_container_logs))
        .route("/api/system/metrics", get(get_system_metrics))
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
    let services = state.services.read().await;
    Json(services.clone())
}

async fn start_service(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let services = state.services.read().await;
    let service = services.iter().find(|s| s.id == id)
        .ok_or(StatusCode::NOT_FOUND)?;
    
    let service_clone = service.clone();
    drop(services);

    state.process_manager.start_service(service_clone).await
        .map_err(|e| {
            error!("Failed to start service: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::OK)
}

async fn stop_service(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    state.process_manager.stop_service(&id).await
        .map_err(|e| {
            error!("Failed to stop service: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::OK)
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

async fn get_service_logs(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Vec<String>>, StatusCode> {
    let lines = params.get("lines")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(100);
    
    let logs = state.log_manager.get_logs(&id, Some(lines)).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    Ok(Json(logs))
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
    let process_info = state.process_manager.get_process_info(&id).await
        .ok_or(StatusCode::NOT_FOUND)?;
    
    Ok(Json(process_info))
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

