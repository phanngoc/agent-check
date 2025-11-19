package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/joho/godotenv"
	"github.com/ngocp/user-tracker/internal/handlers"
	"github.com/ngocp/user-tracker/internal/middleware"
	"github.com/ngocp/user-tracker/internal/migration"
	"github.com/ngocp/user-tracker/internal/queue"
	"github.com/ngocp/user-tracker/internal/repository"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	// Get configuration from environment
	port := getEnv("PORT", "8085")
	host := getEnv("HOST", "0.0.0.0")
	databaseURL := getEnv("DATABASE_URL", "postgres://tracker:tracker@localhost:5432/tracker?sslmode=disable")
	// Default CORS_ORIGINS includes common development origins
	// The CORS middleware will automatically add "null" if not present, but including it here for clarity
	corsOrigins := getEnv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3009,http://127.0.0.1:8000,http://localhost:8000")
	autoMigrate := getEnv("AUTO_MIGRATE", "false") == "true"

	// Run migrations if AUTO_MIGRATE is enabled
	if autoMigrate {
		log.Println("AUTO_MIGRATE is enabled, running migrations...")
		projectRoot := getProjectRoot()
		migrationsPath := filepath.Join(projectRoot, "database", "migrations")
		if err := migration.RunMigrations(databaseURL, migrationsPath); err != nil {
			log.Printf("Warning: Migration failed (server will continue): %v", err)
		}
	}

	// Initialize database
	db, err := repository.NewDatabase(databaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	log.Println("Successfully connected to database")

	// Initialize Redis
	redisURL := getEnv("REDIS_URL", "redis://localhost:6379/0")
	redisMaxRetries := getEnvAsInt("REDIS_MAX_RETRIES", 3)
	redisPoolSize := getEnvAsInt("REDIS_POOL_SIZE", 10)
	redisMinIdleConn := getEnvAsInt("REDIS_MIN_IDLE_CONN", 5)

	redisClient, err := queue.NewRedisClient(queue.RedisConfig{
		URL:         redisURL,
		MaxRetries:  redisMaxRetries,
		PoolSize:    redisPoolSize,
		MinIdleConn: redisMinIdleConn,
	})
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer redisClient.Close()

	log.Println("Successfully connected to Redis")

	// Initialize repositories
	sessionRepo := repository.NewSessionRepository(db)
	eventRepo := repository.NewEventRepository(db)
	screenshotRepo := repository.NewScreenshotRepository(db)

	// Initialize event queue
	queueMaxRetries := getEnvAsInt("REDIS_MAX_RETRIES", 3)
	eventQueue := queue.NewEventQueue(redisClient, queueMaxRetries)

	// Initialize event processor
	workerCount := getEnvAsInt("QUEUE_WORKER_COUNT", 5)
	batchSize := getEnvAsInt("QUEUE_BATCH_SIZE", 100)
	processInterval := getEnvAsDuration("QUEUE_PROCESS_INTERVAL", 1*time.Second)
	shutdownTimeout := getEnvAsDuration("QUEUE_SHUTDOWN_TIMEOUT", 30*time.Second)

	processor := queue.NewEventProcessor(
		eventQueue,
		eventRepo,
		queue.ProcessorConfig{
			WorkerCount:     workerCount,
			BatchSize:       int64(batchSize),
			ProcessInterval: processInterval,
			ShutdownTimeout: shutdownTimeout,
			MaxRetries:      queueMaxRetries,
			RetryDelay:      1 * time.Second,
		},
	)

	// Start background processor
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := processor.Start(ctx); err != nil {
		log.Fatalf("Failed to start event processor: %v", err)
	}

	log.Printf("Event processor started with %d workers", workerCount)

	// Initialize handlers
	sessionHandler := handlers.NewSessionHandler(sessionRepo, eventRepo)
	trackHandler := handlers.NewTrackHandler(eventQueue, screenshotRepo)

	// Initialize Fiber app
	app := fiber.New(fiber.Config{
		AppName:      "User Tracker API",
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		BodyLimit:    10 * 1024 * 1024, // 10MB for screenshots
	})

	// Global middleware
	app.Use(recover.New())
	app.Use(middleware.Logger())
	app.Use(middleware.CORS(corsOrigins))

	// Health check
	app.Get("/health", func(c *fiber.Ctx) error {
		health := fiber.Map{
			"status": "healthy",
		}

		// Check database
		if err := db.Health(c.Context()); err != nil {
			health["database"] = "unhealthy"
			health["status"] = "degraded"
		} else {
			health["database"] = "healthy"
		}

		// Check Redis
		if err := redisClient.HealthCheck(c.Context()); err != nil {
			health["redis"] = "unhealthy"
			health["status"] = "degraded"
		} else {
			health["redis"] = "healthy"
		}

		// Get queue metrics
		queueDepth, _ := eventQueue.GetQueueDepth(c.Context())
		pendingCount, _ := eventQueue.GetPendingCount(c.Context())
		health["queue_depth"] = queueDepth
		health["queue_pending"] = pendingCount

		if health["status"] == "degraded" {
			return c.Status(fiber.StatusServiceUnavailable).JSON(health)
		}

		return c.JSON(health)
	})

	// API v1 routes
	v1 := app.Group("/api/v1")

	// Session routes
	sessions := v1.Group("/sessions")
	sessions.Post("/", sessionHandler.CreateSession)
	sessions.Get("/", sessionHandler.ListSessions)
	sessions.Get("/:id", sessionHandler.GetSession)
	sessions.Get("/:id/events", sessionHandler.GetSessionEvents)
	sessions.Post("/:id/end", sessionHandler.EndSession)
	sessions.Get("/:id/screenshots", trackHandler.GetSessionScreenshots)

	// Tracking routes
	track := v1.Group("/track")
	track.Post("/", trackHandler.TrackEvents)
	track.Post("/screenshot", trackHandler.UploadScreenshot)
	track.Get("/screenshot/:id", trackHandler.GetScreenshot)

	// Start server in goroutine
	addr := fmt.Sprintf("%s:%s", host, port)
	log.Printf("Server starting on %s", addr)

	go func() {
		if err := app.Listen(addr); err != nil {
			log.Printf("Server error: %v", err)
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Shutdown processor first
	if err := processor.Stop(ctx); err != nil {
		log.Printf("Error stopping processor: %v", err)
	}

	// Then shutdown HTTP server
	if err := app.Shutdown(); err != nil {
		log.Printf("Error shutting down server: %v", err)
	}

	log.Println("Server shutdown complete")
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

func getEnvAsInt(key string, defaultValue int) int {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.Atoi(valueStr)
	if err != nil {
		log.Printf("Warning: Invalid value for %s, using default %d", key, defaultValue)
		return defaultValue
	}
	return value
}

func getEnvAsDuration(key string, defaultValue time.Duration) time.Duration {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	value, err := time.ParseDuration(valueStr)
	if err != nil {
		log.Printf("Warning: Invalid duration for %s, using default %v", key, defaultValue)
		return defaultValue
	}
	return value
}

func getProjectRoot() string {
	// Try to get current working directory
	wd, err := os.Getwd()
	if err != nil {
		log.Fatal("Failed to determine project root")
	}

	// If we're in cmd/server, go up to backend, then to project root
	if filepath.Base(wd) == "server" {
		return filepath.Join(wd, "..", "..", "..")
	}
	// If we're in backend, go up one level
	if filepath.Base(wd) == "backend" {
		return filepath.Join(wd, "..")
	}
	// Otherwise assume we're at project root
	return wd
}
