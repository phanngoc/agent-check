use anyhow::Result;
use crate::models::ProcessInfo;
use std::collections::HashMap;
use std::sync::Arc;
use sysinfo::{System, Pid};
use tokio::sync::RwLock;
use tokio::time::Instant;
use chrono::Utc;

pub struct MetricsCollector {
    system: Arc<RwLock<System>>,
    #[allow(dead_code)]
    process_start_times: Arc<RwLock<HashMap<u32, Instant>>>,
}

impl MetricsCollector {
    pub fn new() -> Self {
        let mut system = System::new_all();
        system.refresh_all();

        Self {
            system: Arc::new(RwLock::new(system)),
            process_start_times: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    #[allow(dead_code)]
    pub async fn collect_process_metrics(&self, pid: u32) -> Result<ProcessInfo> {
        let mut system = self.system.write().await;
        system.refresh_processes();
        
        let pid_sysinfo = Pid::from(pid as usize);
        let process = system.process(pid_sysinfo);
        
        let cpu_usage = process.map(|p| p.cpu_usage() as f32).unwrap_or(0.0);
        let memory_usage = process.map(|p| p.memory()).unwrap_or(0);

        // Calculate uptime
        let start_times = self.process_start_times.read().await;
        let uptime = start_times
            .get(&pid)
            .map(|start| start.elapsed().as_secs())
            .unwrap_or(0);

        Ok(ProcessInfo {
            pid: Some(pid),
            cpu_usage,
            memory_usage,
            uptime,
            status: crate::models::ServiceStatus::Running,
        })
    }

    #[allow(dead_code)]
    pub fn register_process(&self, pid: u32) {
        let mut start_times = self.process_start_times.blocking_write();
        start_times.insert(pid, Instant::now());
    }

    #[allow(dead_code)]
    pub fn unregister_process(&self, pid: u32) {
        let mut start_times = self.process_start_times.blocking_write();
        start_times.remove(&pid);
    }

    pub async fn get_system_metrics(&self) -> Result<HashMap<String, f64>> {
        let mut system = self.system.write().await;
        system.refresh_all();

        let mut metrics = HashMap::new();
        
        // CPU usage
        let cpu_usage = system.global_cpu_info().cpu_usage();
        metrics.insert("cpu_usage".to_string(), cpu_usage as f64);

        // Memory usage
        let total_memory = system.total_memory();
        let used_memory = system.used_memory();
        let memory_percent = if total_memory > 0 {
            (used_memory as f64 / total_memory as f64) * 100.0
        } else {
            0.0
        };
        metrics.insert("memory_usage_percent".to_string(), memory_percent);
        metrics.insert("memory_total".to_string(), total_memory as f64);
        metrics.insert("memory_used".to_string(), used_memory as f64);

        // Process count
        let process_count = system.processes().len();
        metrics.insert("process_count".to_string(), process_count as f64);

        Ok(metrics)
    }

    #[allow(dead_code)]
    pub async fn collect_all_process_metrics(&self, pids: Vec<u32>) -> Result<Vec<crate::models::Metrics>> {
        let mut results = Vec::new();

        for pid in pids {
            match self.collect_process_metrics(pid).await {
                Ok(info) => {
                    results.push(crate::models::Metrics {
                        service_id: format!("pid_{}", pid),
                        cpu_usage: info.cpu_usage,
                        memory_usage: info.memory_usage,
                        uptime: info.uptime,
                        timestamp: Utc::now(),
                    });
                }
                Err(e) => {
                    tracing::warn!("Failed to collect metrics for PID {}: {}", pid, e);
                }
            }
        }

        Ok(results)
    }
}

