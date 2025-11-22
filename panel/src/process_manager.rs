use anyhow::{Context, Result};
use crate::models::{ProcessInfo, Service, ServiceStatus};
use crate::state_persistence::{StatePersistence, ServiceState};
use std::collections::HashMap;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{Duration, Instant};
use tokio::process::Command as TokioCommand;
use chrono::Utc;
use tracing::{info, warn, error, debug};

pub struct ProcessManager {
    processes: Arc<RwLock<HashMap<String, ManagedProcess>>>,
    auto_restart: bool,
    max_restart_attempts: u32,
    logs_dir: std::path::PathBuf,
    state_persistence: StatePersistence,
}

struct ManagedProcess {
    child: Option<Child>,
    service: Service,
    start_time: Option<Instant>,
    restart_count: u32,
    pid: Option<u32>,
}

impl ProcessManager {
    pub fn new(
        auto_restart: bool,
        max_restart_attempts: u32,
        logs_dir: std::path::PathBuf,
        state_file: std::path::PathBuf,
    ) -> Self {
        Self {
            processes: Arc::new(RwLock::new(HashMap::new())),
            auto_restart,
            max_restart_attempts,
            logs_dir,
            state_persistence: StatePersistence::new(state_file),
        }
    }

    pub async fn start_service(&self, mut service: Service) -> Result<()> {
        let service_id = service.id.clone();
        
        info!("Starting service: {}", service_id);
        debug!("[DEBUG] start_service called for service_id: {}", service_id);

        // Kiểm tra và kill process đang sử dụng port nếu có
        if let Some(port) = service.port {
            info!("Checking if port {} is in use...", port);
            if let Err(e) = Self::kill_process_by_port(port).await {
                warn!("Failed to kill process on port {}: {}. Continuing anyway...", port, e);
            }
        }

        // Log file path - use absolute path from logs_dir
        let log_path = self.logs_dir.join(format!("{}.log", service_id));
        debug!("[DEBUG] Log file path: {:?}", log_path);
        
        // Create logs directory if it doesn't exist
        if let Some(parent) = log_path.parent() {
            debug!("[DEBUG] Creating logs directory: {:?}", parent);
            std::fs::create_dir_all(parent)
                .context("Failed to create logs directory")?;
        }
        
        // Create log file with explicit flush
        debug!("[DEBUG] Opening log file: {:?}", log_path);
        let log_file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .context(format!("Failed to create log file at {:?}", log_path))?;
        
        info!("Log file created at: {:?}", log_path);
        debug!("[DEBUG] Log file opened successfully");

        // Parse command
        debug!("[DEBUG] Parsing command: '{}'", service.command);
        let parts: Vec<&str> = service.command.split_whitespace().collect();
        debug!("[DEBUG] Command parts: {:?} (count: {})", parts, parts.len());
        
        if parts.is_empty() {
            debug!("[DEBUG] ERROR: Empty command");
            anyhow::bail!("Empty command");
        }

        let executable = parts[0];
        debug!("[DEBUG] Executable: '{}'", executable);
        
        let mut cmd = Command::new(executable);
        
        // Add arguments
        let args: Vec<&str> = parts.iter().skip(1).copied().collect();
        debug!("[DEBUG] Command arguments: {:?}", args);
        for arg in args.iter() {
            cmd.arg(arg);
        }

        // Set working directory
        let working_dir = std::path::Path::new(&service.working_dir);
        debug!("[DEBUG] Working directory (raw): '{}'", service.working_dir);
        debug!("[DEBUG] Working directory exists: {}", working_dir.exists());
        
        if !working_dir.exists() {
            debug!("[DEBUG] ERROR: Working directory does not exist: {}", service.working_dir);
            anyhow::bail!("Working directory does not exist: {}", service.working_dir);
        }
        
        let working_dir_abs = working_dir.canonicalize()
            .unwrap_or_else(|_| working_dir.to_path_buf());
        debug!("[DEBUG] Working directory (absolute): {:?}", working_dir_abs);
        
        cmd.current_dir(working_dir);
        info!("Setting working directory to: {:?}", working_dir);

        // Set environment variables
        debug!("[DEBUG] Setting environment variables (count: {})", service.environment.len());
        for (key, value) in &service.environment {
            debug!("[DEBUG]   {} = {}", key, value);
            cmd.env(key, value);
        }
        
        // Preserve PATH and other important env vars
        let path_env = std::env::var("PATH").unwrap_or_default();
        debug!("[DEBUG] PATH environment variable: {}", path_env);
        cmd.env("PATH", path_env);

        // Redirect output to log file
        debug!("[DEBUG] Redirecting stdout and stderr to log file");
        cmd.stdout(Stdio::from(log_file.try_clone()?));
        cmd.stderr(Stdio::from(log_file));
        
        info!("Spawning process: command='{}', working_dir='{:?}', log_path='{:?}'", 
            service.command, working_dir, log_path);
        debug!("[DEBUG] About to spawn process - executable: '{}', args: {:?}, working_dir: {:?}", 
            executable, args, working_dir_abs);

        // Spawn process
        debug!("[DEBUG] Calling cmd.spawn()...");
        let spawn_result = cmd.spawn();
        
        let mut child = match spawn_result {
            Ok(child) => {
                let pid = child.id();
                debug!("[DEBUG] Process spawned successfully - PID: {}", pid);
                child
            }
            Err(e) => {
                debug!("[DEBUG] ERROR: Failed to spawn process - error: {:?}", e);
                debug!("[DEBUG] ERROR: Executable path: '{}'", executable);
                debug!("[DEBUG] ERROR: Working directory: {:?}", working_dir_abs);
                debug!("[DEBUG] ERROR: Command: '{}'", service.command);
                return Err(anyhow::anyhow!("Failed to spawn process '{}' in directory '{}'. Make sure the command is in PATH. Error: {}", 
                    service.command, service.working_dir, e))
                    .context(format!("Failed to spawn process '{}' in directory '{}'. Make sure the command is in PATH.", 
                        service.command, service.working_dir));
            }
        };
        
        let pid = child.id();
        info!("Process spawned successfully: PID={}, service={}", pid, service_id);
        debug!("[DEBUG] Process PID: {}, waiting 500ms before checking status", pid);
        
        // Give process a moment to start and potentially write to log
        tokio::time::sleep(Duration::from_millis(500)).await;
        
        // Check if process is still running
        debug!("[DEBUG] Checking process status for PID: {}", pid);
        match child.try_wait() {
            Ok(Some(status)) => {
                warn!("Process {} exited immediately with status: {:?}", service_id, status);
                debug!("[DEBUG] Process exited immediately - status: {:?}", status);
                debug!("[DEBUG] Reading log file for error output: {:?}", log_path);
                // Try to read error from log file
                if let Ok(content) = std::fs::read_to_string(&log_path) {
                    if !content.is_empty() {
                        error!("Process {} error output: {}", service_id, content);
                        debug!("[DEBUG] Log file content (first 500 chars): {}", 
                            content.chars().take(500).collect::<String>());
                    } else {
                        debug!("[DEBUG] Log file is empty");
                    }
                } else {
                    debug!("[DEBUG] Failed to read log file");
                }
                anyhow::bail!("Process exited immediately after start");
            }
            Ok(None) => {
                // Process is still running, good
                info!("Process {} is running (PID={})", service_id, pid);
                debug!("[DEBUG] Process is still running - PID: {}", pid);
            }
            Err(e) => {
                warn!("Error checking process status: {}", e);
                debug!("[DEBUG] ERROR checking process status: {:?}", e);
            }
        }

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

        // Save state to file
        let service_state = ServiceState {
            service_id: service_id.clone(),
            pid,
            started_at: Utc::now(),
            command: service.command.clone(),
            working_dir: service.working_dir.clone(),
            environment: service.environment.clone(),
        };
        if let Err(e) = self.state_persistence.add_or_update_service(service_state).await {
            warn!("Failed to save state for service {}: {}", service_id, e);
        }

        // Start monitoring task
        let processes_clone = self.processes.clone();
        let auto_restart = self.auto_restart;
        let max_attempts = self.max_restart_attempts;
        let logs_dir = self.logs_dir.clone();
        let service_clone = service.clone();

        tokio::spawn(async move {
            Self::monitor_process(
                service_id,
                processes_clone,
                auto_restart,
                max_attempts,
                logs_dir,
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

        // Remove from state file
        if let Err(e) = self.state_persistence.remove_service(service_id).await {
            warn!("Failed to remove service {} from state: {}", service_id, e);
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
        let managed = processes.get(service_id)?;
        
        // If process has no Child handle (recovered process), check if it's still alive
        if managed.child.is_none() {
            if let Some(pid) = managed.pid {
                let mut system = sysinfo::System::new();
                system.refresh_processes();
                if system.process(sysinfo::Pid::from(pid as usize)).is_none() {
                    // Process is dead, update status
                    drop(processes);
                    let mut processes = self.processes.write().await;
                    if let Some(managed) = processes.get_mut(service_id) {
                        managed.service.status = ServiceStatus::Stopped;
                        managed.service.updated_at = Utc::now();
                    }
                    // Remove from state
                    let _ = self.state_persistence.remove_service(service_id).await;
                    return Some(ServiceStatus::Stopped);
                }
            }
        }
        
        Some(managed.service.status.clone())
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
        // sysinfo requires at least 2 refreshes with a delay between them to calculate CPU usage accurately
        let mut system = sysinfo::System::new();
        system.refresh_processes();
        
        // Wait a short time before second refresh to allow CPU usage calculation
        tokio::time::sleep(Duration::from_millis(100)).await;
        system.refresh_processes();
        
        let cpu_usage = 0.0;
        let memory_usage = 0;

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
        logs_dir: std::path::PathBuf,
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
                            
                            // Recreate command - use logs_dir
                            let log_path = logs_dir.join(format!("{}.log", service_id));
                            let log_file = match std::fs::OpenOptions::new()
                                .create(true)
                                .append(true)
                                .open(&log_path)
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

    pub async fn recover_processes(&self, services: Vec<Service>) -> Result<()> {
        info!("Recovering processes from state file...");
        
        let saved_states = self.state_persistence.load_state().await?;
        
        if saved_states.is_empty() {
            info!("No saved processes to recover");
            return Ok(());
        }

        info!("Found {} saved processes to check", saved_states.len());

        // Create a map of service_id -> Service for quick lookup
        let services_map: HashMap<String, Service> = services
            .into_iter()
            .map(|s| (s.id.clone(), s))
            .collect();

        // Check each saved process
        let mut system = sysinfo::System::new();
        system.refresh_processes();

        for saved_state in saved_states {
            let service_id = saved_state.service_id.clone();
            let pid = saved_state.pid;

            // Check if process is still alive
            let is_alive = system.process(sysinfo::Pid::from(pid as usize)).is_some();

            if is_alive {
                info!("Process {} (PID: {}) is still running, recovering...", service_id, pid);
                
                // Find the service in the detected services
                if let Some(mut service) = services_map.get(&service_id).cloned() {
                    service.status = ServiceStatus::Running;
                    service.updated_at = Utc::now();

                    // We can't actually "attach" to an existing process in Rust
                    // Instead, we'll create a ManagedProcess entry without a Child handle
                    // The process will continue running, but we won't be able to monitor it directly
                    // We'll track it by PID only
                    let managed = ManagedProcess {
                        child: None, // Can't attach to existing process
                        service: service.clone(),
                        start_time: Some(Instant::now()), // Approximate
                        restart_count: 0,
                        pid: Some(pid),
                    };

                    self.processes.write().await.insert(service_id.clone(), managed);

                    // Update state file with current timestamp
                    let updated_state = ServiceState {
                        service_id: service_id.clone(),
                        pid,
                        started_at: saved_state.started_at, // Keep original start time
                        command: saved_state.command.clone(),
                        working_dir: saved_state.working_dir.clone(),
                        environment: saved_state.environment.clone(),
                    };
                    
                    if let Err(e) = self.state_persistence.add_or_update_service(updated_state).await {
                        warn!("Failed to update state for recovered service {}: {}", service_id, e);
                    }

                    // Start monitoring task for recovered process (monitor by PID since no Child handle)
                    let processes_clone = self.processes.clone();
                    let state_persistence_clone = self.state_persistence.clone();
                    let service_id_clone = service_id.clone();
                    
                    tokio::spawn(async move {
                        Self::monitor_recovered_process(
                            service_id_clone,
                            pid,
                            processes_clone,
                            state_persistence_clone,
                        ).await;
                    });

                    info!("Successfully recovered process {} (PID: {})", service_id, pid);
                } else {
                    warn!("Service {} not found in detected services, marking as stopped", service_id);
                    // Remove from state since service is no longer detected
                    let _ = self.state_persistence.remove_service(&service_id).await;
                }
            } else {
                warn!("Process {} (PID: {}) is no longer running, marking as stopped", service_id, pid);
                // Remove from state since process is dead
                let _ = self.state_persistence.remove_service(&service_id).await;
            }
        }

        info!("Process recovery completed");
        Ok(())
    }

    async fn monitor_recovered_process(
        service_id: String,
        pid: u32,
        processes: Arc<RwLock<HashMap<String, ManagedProcess>>>,
        state_persistence: StatePersistence,
    ) {
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;

            let mut processes_guard = processes.write().await;
            let managed = match processes_guard.get_mut(&service_id) {
                Some(m) => m,
                None => break, // Service was stopped
            };

            // Check if process is still alive by PID
            let mut system = sysinfo::System::new();
            system.refresh_processes();
            
            if system.process(sysinfo::Pid::from(pid as usize)).is_none() {
                // Process is dead
                warn!("Recovered process {} (PID: {}) is no longer running", service_id, pid);
                managed.service.status = ServiceStatus::Stopped;
                managed.service.updated_at = Utc::now();
                drop(processes_guard);
                
                // Remove from state
                let _ = state_persistence.remove_service(&service_id).await;
                break;
            }
        }
    }

    // Helper function để kiểm tra port có đang được sử dụng không
    async fn check_port_in_use(port: u16) -> Result<Option<u32>> {
        // Sử dụng lsof để tìm PID
        let output = TokioCommand::new("lsof")
            .arg("-ti")
            .arg(format!(":{}", port))
            .output()
            .await;
        
        match output {
            Ok(output) if output.status.success() => {
                let pid_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !pid_str.is_empty() {
                    // lsof có thể trả về nhiều PIDs, lấy PID đầu tiên
                    if let Some(first_pid) = pid_str.lines().next() {
                        if let Ok(pid) = first_pid.trim().parse::<u32>() {
                            return Ok(Some(pid));
                        }
                    }
                }
                Ok(None)
            }
            _ => Ok(None)
        }
    }

    // Kill process đang sử dụng port
    async fn kill_process_by_port(port: u16) -> Result<()> {
        if let Some(pid) = Self::check_port_in_use(port).await? {
            info!("Port {} is in use by process PID: {}", port, pid);
            
            // Thử graceful kill trước
            info!("Attempting graceful kill (SIGTERM) for PID: {}", pid);
            let _ = TokioCommand::new("kill")
                .arg("-TERM")
                .arg(pid.to_string())
                .output()
                .await;
            
            // Đợi 2 giây
            tokio::time::sleep(Duration::from_secs(2)).await;
            
            // Kiểm tra xem process còn sống không
            if Self::check_port_in_use(port).await?.is_some() {
                warn!("Process {} still alive after SIGTERM, force killing...", pid);
                // Force kill
                let output = TokioCommand::new("kill")
                    .arg("-9")
                    .arg(pid.to_string())
                    .output()
                    .await
                    .context("Failed to force kill process")?;
                
                if !output.status.success() {
                    warn!("Failed to force kill process {}: {:?}", pid, output);
                } else {
                    info!("Successfully force killed process {}", pid);
                }
            } else {
                info!("Process {} terminated gracefully", pid);
            }
            
            // Đợi thêm một chút để port được giải phóng
            tokio::time::sleep(Duration::from_millis(500)).await;
        } else {
            debug!("Port {} is not in use", port);
        }
        
        Ok(())
    }
}

