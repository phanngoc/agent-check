use anyhow::{Context, Result};
use crate::models::{ProcessInfo, Service, ServiceStatus};
use std::collections::HashMap;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{Duration, Instant};
use chrono::Utc;
use tracing::{info, warn, error};

pub struct ProcessManager {
    processes: Arc<RwLock<HashMap<String, ManagedProcess>>>,
    auto_restart: bool,
    max_restart_attempts: u32,
}

struct ManagedProcess {
    child: Option<Child>,
    service: Service,
    start_time: Option<Instant>,
    restart_count: u32,
    pid: Option<u32>,
}

impl ProcessManager {
    pub fn new(auto_restart: bool, max_restart_attempts: u32) -> Self {
        Self {
            processes: Arc::new(RwLock::new(HashMap::new())),
            auto_restart,
            max_restart_attempts,
        }
    }

    pub async fn start_service(&self, mut service: Service) -> Result<()> {
        let service_id = service.id.clone();
        
        info!("Starting service: {}", service_id);

        // Log file path - will be managed by log_manager
        // For process output, we'll use a simple approach
        let log_path = format!("logs/{}.log", service_id);
        
        // Create logs directory if it doesn't exist
        if let Some(parent) = std::path::Path::new(&log_path).parent() {
            std::fs::create_dir_all(parent)
                .context("Failed to create logs directory")?;
        }
        
        // Create log file
        let log_file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .context("Failed to create log file")?;

        // Parse command
        let parts: Vec<&str> = service.command.split_whitespace().collect();
        if parts.is_empty() {
            anyhow::bail!("Empty command");
        }

        let mut cmd = Command::new(parts[0]);
        
        // Add arguments
        for arg in parts.iter().skip(1) {
            cmd.arg(arg);
        }

        // Set working directory
        cmd.current_dir(&service.working_dir);

        // Set environment variables
        for (key, value) in &service.environment {
            cmd.env(key, value);
        }

        // Redirect output to log file
        cmd.stdout(Stdio::from(log_file.try_clone()?));
        cmd.stderr(Stdio::from(log_file));

        // Spawn process
        let child = cmd.spawn().context("Failed to spawn process")?;
        let pid = child.id();

        service.status = ServiceStatus::Running;
        service.updated_at = Utc::now();

        let managed = ManagedProcess {
            child: Some(child),
            service: service.clone(),
            start_time: Some(Instant::now()),
            restart_count: 0,
            pid: Some(pid),
        };

        self.processes.write().await.insert(service_id.clone(), managed);

        // Start monitoring task
        let processes_clone = self.processes.clone();
        let auto_restart = self.auto_restart;
        let max_attempts = self.max_restart_attempts;
        let service_clone = service.clone();

        tokio::spawn(async move {
            Self::monitor_process(
                service_id,
                processes_clone,
                auto_restart,
                max_attempts,
                service_clone,
            ).await;
        });

        Ok(())
    }

    pub async fn stop_service(&self, service_id: &str) -> Result<()> {
        info!("Stopping service: {}", service_id);

        let mut processes = self.processes.write().await;
        
        if let Some(mut managed) = processes.remove(service_id) {
            if let Some(mut child) = managed.child.take() {
                // Try graceful shutdown first
                let _ = child.kill();
                
                let _ = child.wait();
            }
        }

        Ok(())
    }

    pub async fn restart_service(&self, service_id: &str) -> Result<()> {
        self.stop_service(service_id).await?;
        tokio::time::sleep(Duration::from_secs(1)).await;
        
        let processes = self.processes.read().await;
        if let Some(managed) = processes.get(service_id) {
            let service = managed.service.clone();
            drop(processes);
            self.start_service(service).await?;
        }

        Ok(())
    }

    pub async fn get_service_status(&self, service_id: &str) -> Option<ServiceStatus> {
        let processes = self.processes.read().await;
        processes.get(service_id).map(|p| p.service.status.clone())
    }

    #[allow(dead_code)]
    pub async fn list_services(&self) -> Vec<Service> {
        let processes = self.processes.read().await;
        processes.values().map(|p| p.service.clone()).collect()
    }

    pub async fn get_process_info(&self, service_id: &str) -> Option<ProcessInfo> {
        let processes = self.processes.read().await;
        let managed = processes.get(service_id)?;

        let pid = managed.pid;
        let uptime = managed.start_time.map(|t| t.elapsed().as_secs()).unwrap_or(0);
        
        // Get CPU and memory usage using sysinfo
        let mut system = sysinfo::System::new();
        system.refresh_processes();
        
        let cpu_usage = 0.0; // Will be calculated in metrics module
        let memory_usage = 0; // Will be calculated in metrics module

        if let Some(pid) = pid {
            if let Some(process) = system.process(sysinfo::Pid::from(pid as usize)) {
                let cpu = process.cpu_usage();
                let memory = process.memory();
                return Some(ProcessInfo {
                    pid: Some(pid),
                    cpu_usage: cpu as f32,
                    memory_usage: memory,
                    uptime,
                    status: managed.service.status.clone(),
                });
            }
        }

        Some(ProcessInfo {
            pid,
            cpu_usage,
            memory_usage,
            uptime,
            status: managed.service.status.clone(),
        })
    }

    async fn monitor_process(
        service_id: String,
        processes: Arc<RwLock<HashMap<String, ManagedProcess>>>,
        auto_restart: bool,
        max_attempts: u32,
        service: Service,
    ) {
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;

            let mut processes_guard = processes.write().await;
            let managed = match processes_guard.get_mut(&service_id) {
                Some(m) => m,
                None => break, // Service was stopped
            };

            if let Some(ref mut child) = managed.child {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        // Process exited
                        warn!("Process {} exited with status: {:?}", service_id, status);
                        
                        managed.child = None;
                        managed.service.status = ServiceStatus::Error;
                        managed.service.updated_at = Utc::now();

                        // Auto-restart if enabled
                        if auto_restart && managed.restart_count < max_attempts {
                            managed.restart_count += 1;
                            managed.service.restart_count = managed.restart_count;
                            
                            info!("Auto-restarting {} (attempt {}/{})", service_id, managed.restart_count, max_attempts);
                            
                            drop(processes_guard);
                            
                            // Restart after a delay
                            tokio::time::sleep(Duration::from_secs(2)).await;
                            
                            // Recreate command
                            let log_file = match std::fs::OpenOptions::new()
                                .create(true)
                                .append(true)
                                .open(format!("logs/{}.log", service_id))
                            {
                                Ok(f) => f,
                                Err(e) => {
                                    error!("Failed to open log file: {}", e);
                                    break;
                                }
                            };

                            let parts: Vec<&str> = service.command.split_whitespace().collect();
                            if parts.is_empty() {
                                break;
                            }

                            let mut cmd = Command::new(parts[0]);
                            for arg in parts.iter().skip(1) {
                                cmd.arg(arg);
                            }
                            cmd.current_dir(&service.working_dir);
                            for (key, value) in &service.environment {
                                cmd.env(key, value);
                            }
                            cmd.stdout(Stdio::from(log_file.try_clone().unwrap()));
                            cmd.stderr(Stdio::from(log_file));

                            match cmd.spawn() {
                                Ok(new_child) => {
                                    let pid = new_child.id();
                                    let mut processes_guard = processes.write().await;
                                    if let Some(managed) = processes_guard.get_mut(&service_id) {
                                        managed.child = Some(new_child);
                                        managed.pid = Some(pid);
                                        managed.start_time = Some(Instant::now());
                                        managed.service.status = ServiceStatus::Running;
                                        managed.service.updated_at = Utc::now();
                                    }
                                }
                                Err(e) => {
                                    error!("Failed to restart process: {}", e);
                                    break;
                                }
                            }
                        } else {
                            break;
                        }
                    }
                    Ok(None) => {
                        // Process still running
                    }
                    Err(e) => {
                        error!("Error checking process status: {}", e);
                        break;
                    }
                }
            } else {
                break;
            }
        }
    }
}

