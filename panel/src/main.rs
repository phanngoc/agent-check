mod config;
mod docker_manager;
mod log_manager;
mod metrics;
mod models;
mod process_manager;
mod server;
mod service_detector;
mod state_persistence;

use anyhow::Result;
use crate::config::Config;
use tracing::{info, error};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

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

