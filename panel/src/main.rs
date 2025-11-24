mod config;
mod database;
mod dev_server_manager;
mod docker_manager;
mod claude_service;
mod log_manager;
mod metrics;
mod models;
mod process_manager;
mod project_manager;
mod project_repository;
mod project_scanner;
mod schema_manager;
mod server;
mod service_detector;
mod state_persistence;
mod timescale_db;
mod migration;
mod cmd;

use anyhow::Result;
use crate::config::Config;
use tracing::{info, error};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    // Parse command line arguments
    let args: Vec<String> = std::env::args().skip(1).collect();

    // Check if migrate command
    if !args.is_empty() && args[0] == "migrate" {
        let migrate_args: Vec<String> = args.into_iter().skip(1).collect();
        return cmd::migrate::run_migrate_command(&migrate_args).await;
    }

    info!("Starting Process Manager Panel...");

    // Load configuration
    let config = Config::new()?;
    info!("Configuration loaded: port={}, host={}", config.port, config.host);

    // Start the HTTP server
    if let Err(e) = server::start_server(config).await {
        error!("Server error: {}", e);
        return Err(e);
    }

    Ok(())
}

