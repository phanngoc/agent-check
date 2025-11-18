package main

import (
	"flag"
	"log"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
	"github.com/ngocp/user-tracker/internal/migration"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	// Get database URL from environment
	databaseURL := getEnv("DATABASE_URL", "postgres://tracker:tracker@localhost:5432/tracker?sslmode=disable")

	// Get migrations path (relative to project root)
	projectRoot := getProjectRoot()
	migrationsPath := filepath.Join(projectRoot, "database", "migrations")

	// Parse command line flags
	command := flag.String("command", "up", "Migration command: up, down, version, or to")
	version := flag.Uint("version", 0, "Target version for 'to' command")
	flag.Parse()

	switch *command {
	case "up":
		log.Println("Running migrations up...")
		if err := migration.RunMigrations(databaseURL, migrationsPath); err != nil {
			log.Fatalf("Migration failed: %v", err)
		}
		log.Println("Migrations completed successfully")

	case "down":
		log.Println("Rolling back last migration...")
		if err := migration.MigrateDown(databaseURL, migrationsPath); err != nil {
			log.Fatalf("Rollback failed: %v", err)
		}
		log.Println("Rollback completed successfully")

	case "version":
		log.Println("Checking migration version...")
		v, dirty, err := migration.GetMigrationVersion(databaseURL, migrationsPath)
		if err != nil {
			log.Fatalf("Failed to get version: %v", err)
		}
		if dirty {
			log.Printf("Current version: %d (DIRTY - migration failed)", v)
		} else {
			log.Printf("Current version: %d", v)
		}

	case "to":
		if *version == 0 {
			log.Fatal("Version is required for 'to' command. Use -version flag")
		}
		log.Printf("Migrating to version %d...", *version)
		if err := migration.MigrateToVersion(databaseURL, migrationsPath, *version); err != nil {
			log.Fatalf("Migration failed: %v", err)
		}
		log.Printf("Migrated to version %d successfully", *version)

	case "force":
		if *version == 0 {
			log.Fatal("Version is required for 'force' command. Use -version flag")
		}
		log.Printf("Forcing version to %d...", *version)
		if err := migration.ForceVersion(databaseURL, migrationsPath, *version); err != nil {
			log.Fatalf("Force version failed: %v", err)
		}
		log.Printf("Forced version to %d successfully", *version)

	default:
		log.Fatalf("Unknown command: %s. Use: up, down, version, to, or force", *command)
	}
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

func getProjectRoot() string {
	// Get current working directory
	wd, err := os.Getwd()
	if err != nil {
		log.Fatal("Failed to determine project root")
	}

	// If we're in cmd/migrate, go up to backend, then to project root
	if filepath.Base(wd) == "migrate" {
		return filepath.Join(wd, "..", "..", "..")
	}
	// If we're in backend, go up one level to project root
	if filepath.Base(wd) == "backend" {
		return filepath.Join(wd, "..")
	}
	// If we're in cmd, go up to backend, then to project root
	if filepath.Base(wd) == "cmd" {
		return filepath.Join(wd, "..", "..")
	}
	// Otherwise assume we're at project root
	return wd
}
