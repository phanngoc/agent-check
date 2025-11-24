use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

pub struct ProjectManager {
    project_root: PathBuf,
}

impl ProjectManager {
    pub fn new(project_root: PathBuf) -> Self {
        Self { project_root }
    }

    /// Tạo folder cho project trong ./sites directory
    pub fn create_project_folder(&self, project_name: &str) -> Result<PathBuf> {
        let sites_dir = self.project_root.join("sites");
        
        // Tạo sites directory nếu chưa tồn tại
        if !sites_dir.exists() {
            std::fs::create_dir_all(&sites_dir)
                .context("Failed to create sites directory")?;
        }

        let project_path = sites_dir.join(project_name);
        
        // Kiểm tra xem folder đã tồn tại chưa
        if project_path.exists() {
            anyhow::bail!("Project folder already exists: {}", project_path.display());
        }

        // Tạo project folder
        std::fs::create_dir_all(&project_path)
            .context(format!("Failed to create project folder: {}", project_path.display()))?;

        Ok(project_path)
    }

    /// Lấy path của project trong ./sites directory
    pub fn get_project_path(&self, project_name: &str) -> PathBuf {
        self.project_root.join("sites").join(project_name)
    }

    /// Kiểm tra project folder có tồn tại không
    pub fn project_exists(&self, project_name: &str) -> bool {
        self.get_project_path(project_name).exists()
    }

    /// List tất cả files trong project (recursive)
    pub fn list_project_files(&self, project_name: &str) -> Result<Vec<String>> {
        let project_path = self.get_project_path(project_name);
        
        if !project_path.exists() {
            anyhow::bail!("Project folder does not exist: {}", project_path.display());
        }

        let mut files = Vec::new();
        self.collect_files(&project_path, &project_path, &mut files)?;
        
        Ok(files)
    }

    fn collect_files(&self, base_path: &Path, current_path: &Path, files: &mut Vec<String>) -> Result<()> {
        if current_path.is_dir() {
            let entries = std::fs::read_dir(current_path)
                .context(format!("Failed to read directory: {}", current_path.display()))?;

            for entry in entries {
                let entry = entry.context("Failed to read directory entry")?;
                let path = entry.path();
                
                // Skip hidden files và node_modules, target, etc.
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with('.') || 
                       name == "node_modules" || 
                       name == "target" ||
                       name == ".git" {
                        continue;
                    }
                }

                if path.is_dir() {
                    self.collect_files(base_path, &path, files)?;
                } else {
                    let relative_path = path.strip_prefix(base_path)
                        .context("Failed to get relative path")?;
                    files.push(relative_path.to_string_lossy().to_string());
                }
            }
        }

        Ok(())
    }

    /// Đọc nội dung file
    pub fn read_file(&self, project_name: &str, file_path: &str) -> Result<String> {
        let project_path = self.get_project_path(project_name);
        let full_path = project_path.join(file_path);
        
        // Security check: đảm bảo file_path không vượt ra ngoài project directory
        if !full_path.starts_with(&project_path) {
            anyhow::bail!("Invalid file path: {}", file_path);
        }

        std::fs::read_to_string(&full_path)
            .context(format!("Failed to read file: {}", full_path.display()))
    }

    /// Ghi nội dung vào file
    pub fn write_file(&self, project_name: &str, file_path: &str, content: &str) -> Result<()> {
        let project_path = self.get_project_path(project_name);
        let full_path = project_path.join(file_path);
        
        // Security check: đảm bảo file_path không vượt ra ngoài project directory
        if !full_path.starts_with(&project_path) {
            anyhow::bail!("Invalid file path: {}", file_path);
        }

        // Tạo parent directories nếu chưa tồn tại
        if let Some(parent) = full_path.parent() {
            std::fs::create_dir_all(parent)
                .context(format!("Failed to create parent directories: {}", parent.display()))?;
        }

        std::fs::write(&full_path, content)
            .context(format!("Failed to write file: {}", full_path.display()))
    }
}

