use anyhow::{Context, Result};
use crate::models::{
    ApiInfo, ColumnInfo, ModelInfo, Project, ProjectMetadata, ProjectStatus, ProjectType,
    RouteInfo, TableInfo,
};
use crate::project_repository::ProjectRepository;
use crate::schema_manager::SchemaManager;
use chrono::Utc;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio_postgres::NoTls;
use uuid::Uuid;

pub struct ProjectScanner {
    project_root: PathBuf,
    repository: Arc<ProjectRepository>,
    schema_manager: Arc<SchemaManager>,
}

impl ProjectScanner {
    pub fn new(
        project_root: PathBuf,
        repository: Arc<ProjectRepository>,
        schema_manager: Arc<SchemaManager>,
    ) -> Self {
        Self {
            project_root,
            repository,
            schema_manager,
        }
    }

    /// Scan all projects in ./sites directory
    pub async fn scan_all_projects_in_sites(&self) -> Result<Vec<Uuid>> {
        let sites_dir = self.project_root.join("sites");
        
        if !sites_dir.exists() {
            tracing::warn!("Sites directory does not exist: {:?}", sites_dir);
            return Ok(Vec::new());
        }

        let mut project_ids = Vec::new();

        let mut entries = tokio::fs::read_dir(&sites_dir)
            .await
            .context("Failed to read sites directory")?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    // Skip hidden directories
                    if !name.starts_with('.') {
                        match self.scan_project(&path, name).await {
                            Ok(Some(project_id)) => project_ids.push(project_id),
                            Ok(None) => tracing::info!("Project {} already exists, skipped", name),
                            Err(e) => tracing::error!("Failed to scan project {}: {}", name, e),
                        }
                    }
                }
            }
        }

        Ok(project_ids)
    }

    /// Scan a single project and save to database
    pub async fn scan_project(&self, project_path: &Path, project_name: &str) -> Result<Option<Uuid>> {
        tracing::info!("Scanning project: {} at {:?}", project_name, project_path);

        // Check if project already exists
        if let Some(existing) = self.repository.get_by_name(project_name).await? {
            tracing::info!("Project {} already exists, updating metadata", project_name);
            let metadata = self.scan_project_metadata(project_path, project_name).await?;
            self.repository.update_metadata(existing.project_id, &metadata).await?;
            return Ok(Some(existing.project_id));
        }

        // Detect project type
        let project_type = self.detect_project_type(project_path).await?;
        let framework = match project_type {
            ProjectType::Laravel => Some("laravel".to_string()),
            ProjectType::NestJS => Some("nestjs".to_string()),
            ProjectType::NextJS => Some("nextjs".to_string()),
            ProjectType::Unknown => None,
        };

        // Scan metadata
        let metadata = self.scan_project_metadata(project_path, project_name).await?;

        // Determine database info
        let (database_type, database_url) = self.detect_database_info(project_path, &project_type).await?;

        // Generate schema name
        let schema_name = SchemaManager::generate_schema_name(project_name);

        // Create schema if needed
        if let Err(e) = self.schema_manager.create_schema(&schema_name).await {
            tracing::warn!("Failed to create schema {}: {}", schema_name, e);
        }

        // Create project
        let project = Project {
            project_id: Uuid::new_v4(),
            name: project_name.to_string(),
            directory_path: project_path.to_string_lossy().to_string(),
            schema_name: schema_name.clone(),
            database_type,
            database_url,
            framework,
            metadata,
            last_scan_at: Some(Utc::now()),
            status: ProjectStatus::Active,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let project_id = self.repository.create(&project).await?;
        tracing::info!("Created project {} with ID {}", project_name, project_id);

        Ok(Some(project_id))
    }

    /// Detect project type based on files in directory
    async fn detect_project_type(&self, project_path: &Path) -> Result<ProjectType> {
        let composer_json = project_path.join("composer.json");
        if composer_json.exists() {
            return Ok(ProjectType::Laravel);
        }

        let package_json = project_path.join("package.json");
        if package_json.exists() {
            let content = tokio::fs::read_to_string(&package_json).await?;
            let json: serde_json::Value = serde_json::from_str(&content)?;
            
            // Check for Prisma (NestJS)
            let prisma_schema = project_path.join("backend").join("prisma").join("schema.prisma");
            if prisma_schema.exists() {
                return Ok(ProjectType::NestJS);
            }

            // Check for Next.js
            if let Some(deps) = json.get("dependencies").and_then(|d| d.as_object()) {
                if deps.contains_key("next") {
                    return Ok(ProjectType::NextJS);
                }
            }
        }

        Ok(ProjectType::Unknown)
    }

    /// Detect database information from project
    async fn detect_database_info(
        &self,
        project_path: &Path,
        project_type: &ProjectType,
    ) -> Result<(Option<String>, Option<String>)> {
        match project_type {
            ProjectType::Laravel => {
                // Try to read from .env or config
                let env_file = project_path.join(".env");
                if env_file.exists() {
                    let content = tokio::fs::read_to_string(&env_file).await?;
                    for line in content.lines() {
                        if line.starts_with("DB_CONNECTION=") {
                            let db_type = line.split('=').nth(1).unwrap_or("").trim();
                            if db_type == "mysql" {
                                return Ok((Some("mysql".to_string()), None));
                            }
                        }
                        if line.starts_with("DATABASE_URL=") {
                            let url = line.split('=').nth(1).unwrap_or("").trim();
                            return Ok((Some("mysql".to_string()), Some(url.to_string())));
                        }
                    }
                }
                Ok((Some("mysql".to_string()), None))
            }
            ProjectType::NestJS => {
                // Check Prisma schema
                let prisma_schema = project_path.join("backend").join("prisma").join("schema.prisma");
                if prisma_schema.exists() {
                    let content = tokio::fs::read_to_string(&prisma_schema).await?;
                    if content.contains("provider = \"mysql\"") {
                        return Ok((Some("mysql".to_string()), None));
                    } else if content.contains("provider = \"postgresql\"") {
                        return Ok((Some("postgresql".to_string()), None));
                    }
                }
                Ok((Some("mysql".to_string()), None))
            }
            _ => Ok((None, None)),
        }
    }

    /// Scan project metadata (tables, models, routes, APIs, dependencies)
    async fn scan_project_metadata(
        &self,
        project_path: &Path,
        _project_name: &str,
    ) -> Result<ProjectMetadata> {
        let project_type = self.detect_project_type(project_path).await?;

        let mut metadata = ProjectMetadata::default();

        // Scan database tables
        if let Ok((Some(db_type), db_url)) = self.detect_database_info(project_path, &project_type).await {
            if let Some(url) = db_url {
                metadata.tables = self.scan_database_tables(&url, &db_type).await.unwrap_or_default();
            }
        }

        // Scan based on project type
        match project_type {
            ProjectType::Laravel => {
                metadata.models = self.scan_laravel_models(project_path).await?;
                metadata.routes = self.scan_laravel_routes(project_path).await?;
                metadata.dependencies = self.scan_composer_json(project_path).await?;
            }
            ProjectType::NestJS => {
                metadata.models = self.scan_prisma_schema(project_path).await?;
                metadata.apis = self.scan_nestjs_apis(project_path).await?;
                metadata.dependencies = self.scan_package_json(project_path).await?;
            }
            ProjectType::NextJS => {
                metadata.dependencies = self.scan_package_json(project_path).await?;
            }
            ProjectType::Unknown => {
                metadata.dependencies = self.scan_package_json(project_path).await.unwrap_or_default();
            }
        }

        Ok(metadata)
    }

    /// Scan database tables
    async fn scan_database_tables(&self, db_url: &str, db_type: &str) -> Result<Vec<TableInfo>> {
        match db_type {
            "postgresql" => self.scan_postgresql_tables(db_url).await,
            "mysql" => self.scan_mysql_tables(db_url).await,
            _ => Ok(Vec::new()),
        }
    }

    async fn scan_postgresql_tables(&self, db_url: &str) -> Result<Vec<TableInfo>> {
        let (client, connection) = tokio_postgres::connect(db_url, NoTls)
            .await
            .context("Failed to connect to PostgreSQL")?;

        tokio::spawn(async move {
            if let Err(e) = connection.await {
                tracing::error!("PostgreSQL connection error: {}", e);
            }
        });

        let rows = client
            .query(
                "SELECT table_name FROM information_schema.tables 
                 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
                &[],
            )
            .await
            .context("Failed to query tables")?;

        let mut tables = Vec::new();
        for row in rows {
            let table_name: String = row.get(0);

            // Get columns for this table
            let column_rows = client
                .query(
                    "SELECT column_name, data_type, is_nullable, 
                            CASE WHEN column_name IN (
                                SELECT column_name FROM information_schema.table_constraints tc
                                JOIN information_schema.key_column_usage kcu
                                ON tc.constraint_name = kcu.constraint_name
                                WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
                            ) THEN true ELSE false END as is_primary_key
                     FROM information_schema.columns
                     WHERE table_name = $1
                     ORDER BY ordinal_position",
                    &[&table_name],
                )
                .await
                .context("Failed to query columns")?;

            let mut columns = Vec::new();
            for col_row in column_rows {
                let col_name: String = col_row.get(0);
                let data_type: String = col_row.get(1);
                let is_nullable: String = col_row.get(2);
                let is_primary_key: bool = col_row.get(3);

                columns.push(ColumnInfo {
                    name: col_name,
                    data_type,
                    is_nullable: is_nullable == "YES",
                    is_primary_key,
                });
            }

            tables.push(TableInfo {
                name: table_name,
                columns,
            });
        }

        Ok(tables)
    }

    async fn scan_mysql_tables(&self, db_url: &str) -> Result<Vec<TableInfo>> {
        use mysql_async::prelude::*;

        let pool = mysql_async::Pool::new(db_url);
        let mut conn = pool.get_conn().await?;

        let tables: Vec<String> = conn
            .query("SHOW TABLES")
            .await?;

        let mut result = Vec::new();
        for table_name in tables {
            let columns: Vec<(String, String, String, String)> = conn
                .query(format!(
                    "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY 
                     FROM INFORMATION_SCHEMA.COLUMNS 
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{}' 
                     ORDER BY ORDINAL_POSITION",
                    table_name
                ))
                .await?;

            let mut cols = Vec::new();
            for (col_name, data_type, is_nullable, column_key) in columns {
                cols.push(ColumnInfo {
                    name: col_name,
                    data_type,
                    is_nullable: is_nullable == "YES",
                    is_primary_key: column_key == "PRI",
                });
            }

            result.push(TableInfo {
                name: table_name,
                columns: cols,
            });
        }

        Ok(result)
    }

    /// Scan Laravel models
    async fn scan_laravel_models(&self, project_path: &Path) -> Result<Vec<ModelInfo>> {
        let models_dir = project_path.join("app").join("Models");
        let mut models = Vec::new();

        if !models_dir.exists() {
            return Ok(models);
        }

        let mut entries = tokio::fs::read_dir(&models_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("php") {
                if let Some(name) = path.file_stem().and_then(|n| n.to_str()) {
                    let content = tokio::fs::read_to_string(&path).await?;
                    let fields = self.extract_php_model_fields(&content);
                    
                    models.push(ModelInfo {
                        name: name.to_string(),
                        file_path: path.to_string_lossy().to_string(),
                        fields,
                    });
                }
            }
        }

        Ok(models)
    }

    fn extract_php_model_fields(&self, content: &str) -> Vec<String> {
        let mut fields = Vec::new();
        // Simple regex to find $fillable or protected $fillable
        let re = regex::Regex::new(r#"(?:protected|public)\s+\$fillable\s*=\s*\[(.*?)\]"#).unwrap();
        if let Some(caps) = re.captures(content) {
            let fillable_content = &caps[1];
            for field in fillable_content.split(',') {
                let field = field.trim().trim_matches('"').trim_matches('\'').to_string();
                if !field.is_empty() {
                    fields.push(field);
                }
            }
        }
        fields
    }

    /// Scan Laravel routes
    async fn scan_laravel_routes(&self, project_path: &Path) -> Result<Vec<RouteInfo>> {
        let routes_dir = project_path.join("routes");
        let mut routes = Vec::new();

        if !routes_dir.exists() {
            return Ok(routes);
        }

        let mut entries = tokio::fs::read_dir(&routes_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("php") {
                let content = tokio::fs::read_to_string(&path).await?;
                let file_routes = self.parse_laravel_routes(&content);
                routes.extend(file_routes);
            }
        }

        Ok(routes)
    }

    fn parse_laravel_routes(&self, content: &str) -> Vec<RouteInfo> {
        let mut routes = Vec::new();
        // Match Route::get/post/put/delete('path', [Controller::class, 'method'])
        let re = regex::Regex::new(
            r#"Route::(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"](?:,\s*\[([^\]]+)\])?\)"#,
        )
        .unwrap();

        for cap in re.captures_iter(content) {
            let method = cap.get(1).map(|m| m.as_str().to_uppercase()).unwrap_or_default();
            let path = cap.get(2).map(|p| p.as_str().to_string()).unwrap_or_default();
            let handler = cap.get(3).map(|h| h.as_str().to_string());

            routes.push(RouteInfo {
                method,
                path,
                handler,
            });
        }

        routes
    }

    /// Scan Prisma schema for models
    async fn scan_prisma_schema(&self, project_path: &Path) -> Result<Vec<ModelInfo>> {
        let prisma_schema = project_path.join("backend").join("prisma").join("schema.prisma");
        let mut models = Vec::new();

        if !prisma_schema.exists() {
            return Ok(models);
        }

        let content = tokio::fs::read_to_string(&prisma_schema).await?;
        let re = regex::Regex::new(r#"model\s+(\w+)\s*\{([^}]+)\}"#).unwrap();

        for cap in re.captures_iter(&content) {
            let model_name = cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
            let model_body = cap.get(2).map(|m| m.as_str()).unwrap_or_default();

            let mut fields = Vec::new();
            let field_re = regex::Regex::new(r#"(\w+)\s+(\w+)"#).unwrap();
            for field_cap in field_re.captures_iter(model_body) {
                if let Some(field_name) = field_cap.get(1) {
                    fields.push(field_name.as_str().to_string());
                }
            }

            models.push(ModelInfo {
                name: model_name,
                file_path: prisma_schema.to_string_lossy().to_string(),
                fields,
            });
        }

        Ok(models)
    }

    /// Scan NestJS APIs from controllers
    async fn scan_nestjs_apis(&self, project_path: &Path) -> Result<Vec<ApiInfo>> {
        let controllers_dir = project_path.join("backend").join("src");
        let mut apis = Vec::new();

        if !controllers_dir.exists() {
            return Ok(apis);
        }

        self.scan_typescript_controllers(&controllers_dir, &mut apis).await?;

        Ok(apis)
    }

    async fn scan_typescript_controllers(
        &self,
        dir: &Path,
        apis: &mut Vec<ApiInfo>,
    ) -> Result<()> {
        let mut entries = tokio::fs::read_dir(dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_dir() {
                Box::pin(self.scan_typescript_controllers(&path, apis)).await?;
            } else if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("ts") {
                let content = tokio::fs::read_to_string(&path).await?;
                let file_apis = self.parse_nestjs_decorators(&content, &path);
                apis.extend(file_apis);
            }
        }
        Ok(())
    }

    fn parse_nestjs_decorators(&self, content: &str, file_path: &Path) -> Vec<ApiInfo> {
        let mut apis = Vec::new();
        // Match @Get(), @Post(), @Put(), @Delete(), @Patch() decorators
        let re = regex::Regex::new(
            r#"@(Get|Post|Put|Delete|Patch)\(['"]([^'"]*)['"]?\)"#,
        )
        .unwrap();

        let controller_name = file_path
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        for cap in re.captures_iter(content) {
            let method = cap.get(1).map(|m| m.as_str().to_uppercase()).unwrap_or_default();
            let path = cap.get(2).map(|p| p.as_str().to_string()).unwrap_or_default();

            apis.push(ApiInfo {
                method,
                path,
                controller: Some(controller_name.clone()),
                description: None,
            });
        }

        apis
    }

    /// Scan package.json for dependencies
    async fn scan_package_json(&self, project_path: &Path) -> Result<HashMap<String, String>> {
        let package_json = project_path.join("package.json");
        if !package_json.exists() {
            return Ok(HashMap::new());
        }

        let content = tokio::fs::read_to_string(&package_json).await?;
        let json: serde_json::Value = serde_json::from_str(&content)?;

        let mut deps = HashMap::new();
        if let Some(dependencies) = json.get("dependencies").and_then(|d| d.as_object()) {
            for (key, value) in dependencies {
                if let Some(version) = value.as_str() {
                    deps.insert(key.clone(), version.to_string());
                }
            }
        }

        Ok(deps)
    }

    /// Scan composer.json for dependencies
    async fn scan_composer_json(&self, project_path: &Path) -> Result<HashMap<String, String>> {
        let composer_json = project_path.join("composer.json");
        if !composer_json.exists() {
            return Ok(HashMap::new());
        }

        let content = tokio::fs::read_to_string(&composer_json).await?;
        let json: serde_json::Value = serde_json::from_str(&content)?;

        let mut deps = HashMap::new();
        if let Some(require) = json.get("require").and_then(|r| r.as_object()) {
            for (key, value) in require {
                if let Some(version) = value.as_str() {
                    deps.insert(key.clone(), version.to_string());
                }
            }
        }

        Ok(deps)
    }
}

