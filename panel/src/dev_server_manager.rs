use anyhow::{Context, Result};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tokio::process::Command;
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct DevServerInfo {
    pub project_id: Uuid,
    pub port: u16,
    pub url: String,
    pub process_id: Option<u32>,
}

pub struct DevServerManager {
    servers: Arc<RwLock<HashMap<Uuid, DevServerInfo>>>,
    project_root: PathBuf,
}

impl DevServerManager {
    pub fn new(project_root: PathBuf) -> Self {
        Self {
            servers: Arc::new(RwLock::new(HashMap::new())),
            project_root,
        }
    }

    /// Start dev server for a project
    pub async fn start_server(&self, project_id: Uuid, project_path: PathBuf) -> Result<DevServerInfo> {
        // Check if server is already running
        let servers = self.servers.read().await;
        if let Some(existing) = servers.get(&project_id) {
            return Ok(existing.clone());
        }
        drop(servers);

        // Detect framework and determine command
        let (command, args, port) = self.detect_framework(&project_path)?;

        // Find available port
        let available_port = self.find_available_port(port).await?;

        // Start the dev server
        let mut cmd = Command::new(&command);
        cmd.args(&args);
        cmd.current_dir(&project_path);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        cmd.stdin(Stdio::null());

        let mut child = cmd.spawn()
            .context(format!("Failed to start dev server: {}", command))?;

        let pid = child.id();

        let url = format!("http://localhost:{}", available_port);

        let server_info = DevServerInfo {
            project_id,
            port: available_port,
            url: url.clone(),
            process_id: pid,
        };

        // Store server info
        let mut servers = self.servers.write().await;
        servers.insert(project_id, server_info.clone());
        drop(servers);

        // Spawn task to monitor process
        let servers_clone = self.servers.clone();
        let project_id_clone = project_id;
        tokio::spawn(async move {
            let _ = child.wait().await;
            // Remove from map when process exits
            let mut servers = servers_clone.write().await;
            servers.remove(&project_id_clone);
        });

        Ok(server_info)
    }

    /// Stop dev server for a project
    pub async fn stop_server(&self, project_id: Uuid) -> Result<()> {
        let mut servers = self.servers.write().await;
        
        if let Some(server_info) = servers.remove(&project_id) {
            if let Some(pid) = server_info.process_id {
                // Kill the process
                #[cfg(unix)]
                {
                    let _ = Command::new("kill")
                        .arg("-9")
                        .arg(pid.to_string())
                        .output()
                        .await;
                }
                #[cfg(windows)]
                {
                    let _ = Command::new("taskkill")
                        .args(&["/F", "/PID", &pid.to_string()])
                        .output()
                        .await;
                }
            }
        }

        Ok(())
    }

    /// Get dev server status
    pub async fn get_status(&self, project_id: Uuid) -> Option<DevServerInfo> {
        let servers = self.servers.read().await;
        servers.get(&project_id).cloned()
    }

    /// Detect framework from project directory
    fn detect_framework(&self, project_path: &PathBuf) -> Result<(String, Vec<String>, u16)> {
        // Check for package.json (Node.js projects)
        if project_path.join("package.json").exists() {
            // Check for Next.js
            if project_path.join("next.config.js").exists() 
                || project_path.join("next.config.ts").exists() {
                return Ok(("npm".to_string(), vec!["run".to_string(), "dev".to_string()], 3000));
            }
            // Check for React (Vite)
            if project_path.join("vite.config.js").exists()
                || project_path.join("vite.config.ts").exists() {
                return Ok(("npm".to_string(), vec!["run".to_string(), "dev".to_string()], 5173));
            }
            // Default Node.js
            return Ok(("npm".to_string(), vec!["start".to_string()], 3000));
        }

        // Check for Cargo.toml (Rust)
        if project_path.join("Cargo.toml").exists() {
            return Ok(("cargo".to_string(), vec!["run".to_string()], 8080));
        }

        // Check for go.mod (Go)
        if project_path.join("go.mod").exists() {
            return Ok(("go".to_string(), vec!["run".to_string(), "main.go".to_string()], 8080));
        }

        // Default: simple HTTP server
        Ok(("python3".to_string(), vec!["-m".to_string(), "http.server".to_string(), "8000".to_string()], 8000))
    }

    /// Find available port starting from preferred port
    async fn find_available_port(&self, preferred: u16) -> Result<u16> {
        // Simple implementation: try preferred port first
        if self.is_port_available(preferred).await {
            return Ok(preferred);
        }

        // Try next 100 ports
        for offset in 1..=100 {
            let port = match preferred.checked_add(offset) {
                Some(p) => p,
                None => break, // Overflow, stop searching
            };
            if self.is_port_available(port).await {
                return Ok(port);
            }
        }

        anyhow::bail!("No available port found");
    }

    async fn is_port_available(&self, port: u16) -> bool {
        use std::net::TcpListener;
        TcpListener::bind(format!("127.0.0.1:{}", port)).is_ok()
    }
}

