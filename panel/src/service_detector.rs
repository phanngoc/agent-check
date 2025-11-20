use anyhow::{Context, Result};
use crate::models::{Service, ServiceType};
use std::path::Path;
use std::fs;
use chrono::Utc;
use std::collections::HashMap;
use yaml_rust::YamlLoader;

pub struct ServiceDetector;

impl ServiceDetector {
    pub fn detect_services(project_root: &Path) -> Result<Vec<Service>> {
        let mut services = Vec::new();

        // Detect Backend (Go with Air)
        if let Some(backend_service) = Self::detect_backend(project_root)? {
            services.push(backend_service);
        }

        // Detect Dashboard (Next.js)
        if let Some(dashboard_service) = Self::detect_dashboard(project_root)? {
            services.push(dashboard_service);
        }

        // Detect Tracker (TypeScript)
        if let Some(tracker_service) = Self::detect_tracker(project_root)? {
            services.push(tracker_service);
        }

        // Detect Demo (Laravel)
        if let Some(demo_service) = Self::detect_demo(project_root)? {
            services.push(demo_service);
        }

        Ok(services)
    }

    fn detect_backend(project_root: &Path) -> Result<Option<Service>> {
        let backend_dir = project_root.join("backend");
        let go_mod = backend_dir.join("go.mod");
        let air_toml = backend_dir.join(".air.toml");

        if go_mod.exists() && air_toml.exists() {
            let service = Service {
                id: "backend".to_string(),
                name: "Backend (Go)".to_string(),
                service_type: ServiceType::Go,
                status: crate::models::ServiceStatus::Stopped,
                command: "air".to_string(),
                working_dir: backend_dir.to_string_lossy().to_string(),
                port: Some(8085), // From main.go default
                auto_restart: true,
                restart_count: 0,
                created_at: Utc::now(),
                updated_at: Utc::now(),
                environment: HashMap::new(),
            };
            return Ok(Some(service));
        }
        Ok(None)
    }

    fn detect_dashboard(project_root: &Path) -> Result<Option<Service>> {
        let dashboard_dir = project_root.join("dashboard");
        let package_json = dashboard_dir.join("package.json");

        if package_json.exists() {
            // Try to read port from package.json
            let port = Self::read_port_from_package_json(&package_json).unwrap_or(3009);
            
            let service = Service {
                id: "dashboard".to_string(),
                name: "Dashboard (Next.js)".to_string(),
                service_type: ServiceType::NodeJs,
                status: crate::models::ServiceStatus::Stopped,
                command: "npm run dev".to_string(),
                working_dir: dashboard_dir.to_string_lossy().to_string(),
                port: Some(port),
                auto_restart: true,
                restart_count: 0,
                created_at: Utc::now(),
                updated_at: Utc::now(),
                environment: HashMap::new(),
            };
            return Ok(Some(service));
        }
        Ok(None)
    }

    fn detect_tracker(project_root: &Path) -> Result<Option<Service>> {
        let tracker_dir = project_root.join("tracker");
        let package_json = tracker_dir.join("package.json");

        if package_json.exists() {
            let service = Service {
                id: "tracker".to_string(),
                name: "Tracker (TypeScript)".to_string(),
                service_type: ServiceType::TypeScript,
                status: crate::models::ServiceStatus::Stopped,
                command: "npm run dev".to_string(),
                working_dir: tracker_dir.to_string_lossy().to_string(),
                port: None, // Watch mode, no server
                auto_restart: true,
                restart_count: 0,
                created_at: Utc::now(),
                updated_at: Utc::now(),
                environment: HashMap::new(),
            };
            return Ok(Some(service));
        }
        Ok(None)
    }

    fn detect_demo(project_root: &Path) -> Result<Option<Service>> {
        let demo_dir = project_root.join("demo").join("blog");
        let artisan = demo_dir.join("artisan");

        if artisan.exists() {
            let service = Service {
                id: "demo".to_string(),
                name: "Demo (Laravel)".to_string(),
                service_type: ServiceType::Php,
                status: crate::models::ServiceStatus::Stopped,
                command: "php artisan serve".to_string(),
                working_dir: demo_dir.to_string_lossy().to_string(),
                port: Some(8000), // Laravel default
                auto_restart: true,
                restart_count: 0,
                created_at: Utc::now(),
                updated_at: Utc::now(),
                environment: HashMap::new(),
            };
            return Ok(Some(service));
        }
        Ok(None)
    }

    fn read_port_from_package_json(package_json: &Path) -> Result<u16> {
        let content = fs::read_to_string(package_json)?;
        let json: serde_json::Value = serde_json::from_str(&content)?;
        
        if let Some(scripts) = json.get("scripts") {
            if let Some(dev) = scripts.get("dev") {
                if let Some(dev_str) = dev.as_str() {
                    // Try to extract port from "next dev -p 3009"
                    if let Some(port_str) = dev_str.split("-p").nth(1) {
                        if let Ok(port) = port_str.trim().parse::<u16>() {
                            return Ok(port);
                        }
                    }
                }
            }
        }
        anyhow::bail!("Port not found in package.json");
    }

    #[allow(dead_code)]
    pub fn detect_docker_containers(project_root: &Path) -> Result<Vec<String>> {
        let docker_compose = project_root.join("docker-compose.yml");
        
        if !docker_compose.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&docker_compose)
            .context("Failed to read docker-compose.yml")?;
        
        let docs = YamlLoader::load_from_str(&content)
            .context("Failed to parse docker-compose.yml")?;
        
        if docs.is_empty() {
            return Ok(Vec::new());
        }

        let doc = &docs[0];
        let mut containers = Vec::new();

        if let Some(services) = doc["services"].as_hash() {
            for (name, _) in services {
                if let Some(name_str) = name.as_str() {
                    containers.push(name_str.to_string());
                }
            }
        }

        Ok(containers)
    }
}

