use anyhow::Result;
use std::path::PathBuf;
use crate::config::Config;
use crate::migration::MigrationManager;
use tracing::{info, error};

pub async fn run_migrate_command(args: &[String]) -> Result<()> {
    if args.is_empty() {
        print_usage();
        return Ok(());
    }

    let command = &args[0];
    let config = Config::new()?;

    let migrations_dir = get_migrations_dir(&config.project_root)?;

    match command.as_str() {
        "up" => {
            info!("Running migrations up...");
            let manager = MigrationManager::new(&config.timescale_db_url).await?;
            manager.run_all_migrations(&migrations_dir).await?;
            info!("All migrations completed successfully");
        }
        "down" => {
            if args.len() < 2 {
                error!("Usage: migrate down <version>");
                return Ok(());
            }
            let version = &args[1];
            info!("Rolling back migration: {}", version);
            let manager = MigrationManager::new(&config.timescale_db_url).await?;
            
            // Find the actual file
            let mut found_file: Option<PathBuf> = None;
            for entry in std::fs::read_dir(&migrations_dir)? {
                let entry = entry?;
                let path = entry.path();
                if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                    if file_name.starts_with(version) && file_name.ends_with(".down.sql") {
                        found_file = Some(path);
                        break;
                    }
                }
            }

            if let Some(file) = found_file {
                manager.rollback_migration(&file, version).await?;
                info!("Migration {} rolled back successfully", version);
            } else {
                anyhow::bail!("Migration file not found for version: {}", version);
            }
        }
        "status" => {
            info!("Checking migration status...");
            let manager = MigrationManager::new(&config.timescale_db_url).await?;
            let status = manager.get_status(&migrations_dir).await?;
            
            println!("\nMigration Status:");
            println!("{:-<50}", "");
            for (version, is_applied) in status {
                let status_str = if is_applied { "✓ Applied" } else { "✗ Pending" };
                println!("  {}: {}", version, status_str);
            }
            println!("{:-<50}", "");
        }
        _ => {
            error!("Unknown command: {}", command);
            print_usage();
        }
    }

    Ok(())
}

fn get_migrations_dir(project_root: &PathBuf) -> Result<PathBuf> {
    // Try panel/migrations first, then database/migrations
    let panel_migrations = project_root.join("panel").join("migrations");
    let db_migrations = project_root.join("database").join("migrations");

    if panel_migrations.exists() {
        Ok(panel_migrations)
    } else if db_migrations.exists() {
        Ok(db_migrations)
    } else {
        // Create panel/migrations if it doesn't exist
        std::fs::create_dir_all(&panel_migrations)?;
        Ok(panel_migrations)
    }
}

fn print_usage() {
    println!("Usage: migrate <command> [args]");
    println!("\nCommands:");
    println!("  up              Run all pending migrations");
    println!("  down <version>  Rollback a specific migration");
    println!("  status          Show migration status");
}

