use anyhow::{Context, Result};
use bollard::container::{ListContainersOptions, StartContainerOptions, StopContainerOptions, LogsOptions};
use bollard::Docker;
use crate::models::ContainerInfo;
use chrono::Utc;
use futures::StreamExt;
use tracing::{info, warn, error};

pub struct DockerManager {
    docker: Docker,
}

impl DockerManager {
    pub async fn new() -> Result<Self> {
        let docker = Docker::connect_with_local_defaults()
            .context("Failed to connect to Docker")?;

        Ok(Self {
            docker,
        })
    }

    pub async fn list_containers(&self) -> Result<Vec<ContainerInfo>> {
        let options = ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        };

        let containers = self.docker.list_containers(Some(options)).await
            .context("Failed to list containers")?;

        let mut result = Vec::new();

        for container in containers {
            let id = container.id.as_ref()
                .map(|s| s.chars().take(12).collect::<String>())
                .unwrap_or_default();
            
            let names = container.names.unwrap_or_default();
            let name = names.first()
                .map(|n| n.trim_start_matches('/').to_string())
                .unwrap_or_default();

            let image = container.image.unwrap_or_default();
            let status = container.status.unwrap_or_default();

            // Extract ports
            let ports = if let Some(port_bindings) = container.ports {
                port_bindings.iter()
                    .map(|p| {
                        if let Some(public_port) = p.public_port {
                            format!("{}:{}", public_port, p.private_port)
                        } else {
                            format!("{}", p.private_port)
                        }
                    })
                    .collect()
            } else {
                Vec::new()
            };

            let created = container.created
                .and_then(|ts| chrono::DateTime::from_timestamp(ts, 0))
                .unwrap_or_else(Utc::now);

            // Get stats for CPU and memory
            let (cpu_usage, memory_usage) = self.get_container_stats(&id).await.unwrap_or((0.0, 0));

            let info = ContainerInfo {
                id: id.to_string(),
                name: name.to_string(),
                status,
                image,
                ports,
                cpu_usage,
                memory_usage,
                created,
            };

            result.push(info);
        }

        Ok(result)
    }

    pub async fn start_container(&self, container_id: &str) -> Result<()> {
        info!("Starting container: {}", container_id);
        
        let options = StartContainerOptions::<String> {
            ..Default::default()
        };

        self.docker.start_container(container_id, Some(options)).await
            .context("Failed to start container")?;

        Ok(())
    }

    pub async fn stop_container(&self, container_id: &str) -> Result<()> {
        info!("Stopping container: {}", container_id);
        
        let options = StopContainerOptions {
            t: 10, // 10 second timeout
        };

        self.docker.stop_container(container_id, Some(options)).await
            .context("Failed to stop container")?;

        Ok(())
    }

    pub async fn restart_container(&self, container_id: &str) -> Result<()> {
        self.stop_container(container_id).await?;
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        self.start_container(container_id).await?;
        Ok(())
    }

    pub async fn get_container_logs(&self, container_id: &str, tail: Option<u64>) -> Result<Vec<String>> {
        let options = LogsOptions::<String> {
            stdout: true,
            stderr: true,
            tail: tail.map(|t| t.to_string()).unwrap_or_else(|| "100".to_string()),
            ..Default::default()
        };

        let mut logs = Vec::new();
        let mut stream = self.docker.logs(container_id, Some(options));

        while let Some(log_result) = stream.next().await {
            match log_result {
                Ok(log) => {
                    let log_str = String::from_utf8_lossy(&log.into_bytes()).to_string();
                    logs.push(log_str);
                }
                Err(e) => {
                    error!("Error reading log: {}", e);
                    break;
                }
            }
        }

        Ok(logs)
    }

    pub async fn get_container_stats(&self, container_id: &str) -> Result<(f32, u64)> {
        use bollard::container::StatsOptions;
        
        let options = StatsOptions {
            stream: false,
            ..Default::default()
        };

        let mut stats_stream = self.docker.stats(container_id, Some(options));
        
        if let Some(stats_result) = stats_stream.next().await {
            match stats_result {
                Ok(stats) => {
                    // Calculate CPU usage
                    let cpu_delta = stats.cpu_stats.cpu_usage.total_usage
                        .saturating_sub(stats.precpu_stats.cpu_usage.total_usage);
                    let system_delta = stats.cpu_stats.system_cpu_usage
                        .unwrap_or(0)
                        .saturating_sub(stats.precpu_stats.system_cpu_usage.unwrap_or(0));
                    
                    let cpu_usage = if system_delta > 0 {
                        (cpu_delta as f64 / system_delta as f64) * 100.0
                    } else {
                        0.0
                    };

                    // Get memory usage
                    let memory_usage = stats.memory_stats.usage.unwrap_or(0);

                    return Ok((cpu_usage as f32, memory_usage));
                }
                Err(e) => {
                    warn!("Failed to get stats: {}", e);
                }
            }
        }

        Ok((0.0, 0))
    }

}

