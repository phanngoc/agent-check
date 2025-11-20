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
	log.Printf("[DEBUG] Backend process started - main() function entry point")
	log.Printf("[DEBUG] PID: %d", os.Getpid())

	// Get current working directory for debugging
	wd, _ := os.Getwd()
	log.Printf("[DEBUG] Current working directory: %s", wd)

	// Load environment variables
	log.Printf("[DEBUG] Loading .env file...")
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
		log.Printf("[DEBUG] .env file not found, error: %v", err)
	} else {
		log.Printf("[DEBUG] .env file loaded successfully")
	}

	// Get configuration from environment
	log.Printf("[DEBUG] Reading configuration from environment...")
	port := getEnv("PORT", "8085")
	host := getEnv("HOST", "0.0.0.0")
	databaseURL := getEnv("DATABASE_URL", "postgres://tracker:tracker@localhost:5432/tracker?sslmode=disable")
	// Default CORS_ORIGINS includes common development origins
	// The CORS middleware will automatically add "null" if not present, but including it here for clarity
	corsOrigins := getEnv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3009,http://127.0.0.1:8000,http://localhost:8000")
	autoMigrate := getEnv("AUTO_MIGRATE", "false") == "true"

	log.Printf("[DEBUG] Configuration - PORT: %s, HOST: %s", port, host)
	log.Printf("[DEBUG] Configuration - DATABASE_URL: %s", databaseURL)
	log.Printf("[DEBUG] Configuration - CORS_ORIGINS: %s", corsOrigins)
	log.Printf("[DEBUG] Configuration - AUTO_MIGRATE: %v", autoMigrate)

	// Run migrations if AUTO_MIGRATE is enabled
	if autoMigrate {
		log.Println("AUTO_MIGRATE is enabled, running migrations...")
		log.Printf("[DEBUG] Getting project root for migrations...")
		projectRoot := getProjectRoot()
		log.Printf("[DEBUG] Project root: %s", projectRoot)
		migrationsPath := filepath.Join(projectRoot, "database", "migrations")
		log.Printf("[DEBUG] Migrations path: %s", migrationsPath)
		if err := migration.RunMigrations(databaseURL, migrationsPath); err != nil {
			log.Printf("Warning: Migration failed (server will continue): %v", err)
			log.Printf("[DEBUG] Migration error details: %v", err)
		} else {
			log.Printf("[DEBUG] Migrations completed successfully")
		}
	}

	// Initialize database
	log.Printf("[DEBUG] Initializing database connection...")
	log.Printf("[DEBUG] Database URL: %s", databaseURL)
	db, err := repository.NewDatabase(databaseURL)
	if err != nil {
		log.Printf("[DEBUG] Database connection failed: %v", err)
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	log.Println("Successfully connected to database")
	log.Printf("[DEBUG] Database connection established")

	// Initialize Redis
	log.Printf("[DEBUG] Initializing Redis connection...")
	redisURL := getEnv("REDIS_URL", "redis://localhost:6379/0")
	redisMaxRetries := getEnvAsInt("REDIS_MAX_RETRIES", 3)
	redisPoolSize := getEnvAsInt("REDIS_POOL_SIZE", 10)
	redisMinIdleConn := getEnvAsInt("REDIS_MIN_IDLE_CONN", 5)

	log.Printf("[DEBUG] Redis configuration - URL: %s, MaxRetries: %d, PoolSize: %d, MinIdleConn: %d",
		redisURL, redisMaxRetries, redisPoolSize, redisMinIdleConn)

	redisClient, err := queue.NewRedisClient(queue.RedisConfig{
		URL:         redisURL,
		MaxRetries:  redisMaxRetries,
		PoolSize:    redisPoolSize,
		MinIdleConn: redisMinIdleConn,
	})
	if err != nil {
		log.Printf("[DEBUG] Redis connection failed: %v", err)
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer redisClient.Close()

	log.Println("Successfully connected to Redis")
	log.Printf("[DEBUG] Redis connection established")

	// Initialize repositories
	log.Printf("[DEBUG] Initializing repositories...")
	sessionRepo := repository.NewSessionRepository(db)
	eventRepo := repository.NewEventRepository(db)
	screenshotRepo := repository.NewScreenshotRepository(db)
	log.Printf("[DEBUG] Repositories initialized")

	// Initialize event queue
	log.Printf("[DEBUG] Initializing event queue...")
	queueMaxRetries := getEnvAsInt("REDIS_MAX_RETRIES", 3)
	eventQueue := queue.NewEventQueue(redisClient, queueMaxRetries)
	log.Printf("[DEBUG] Event queue initialized with max retries: %d", queueMaxRetries)

	// Initialize event processor
	log.Printf("[DEBUG] Initializing event processor...")
	workerCount := getEnvAsInt("QUEUE_WORKER_COUNT", 5)
	batchSize := getEnvAsInt("QUEUE_BATCH_SIZE", 100)
	processInterval := getEnvAsDuration("QUEUE_PROCESS_INTERVAL", 1*time.Second)
	shutdownTimeout := getEnvAsDuration("QUEUE_SHUTDOWN_TIMEOUT", 30*time.Second)

	log.Printf("[DEBUG] Event processor config - WorkerCount: %d, BatchSize: %d, ProcessInterval: %v, ShutdownTimeout: %v",
		workerCount, batchSize, processInterval, shutdownTimeout)

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
	log.Printf("[DEBUG] Starting event processor...")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := processor.Start(ctx); err != nil {
		log.Printf("[DEBUG] Event processor start failed: %v", err)
		log.Fatalf("Failed to start event processor: %v", err)
	}

	log.Printf("Event processor started with %d workers", workerCount)
	log.Printf("[DEBUG] Event processor started successfully")

	// Initialize handlers
	log.Printf("[DEBUG] Initializing handlers...")
	sessionHandler := handlers.NewSessionHandler(sessionRepo, eventRepo)
	trackHandler := handlers.NewTrackHandler(eventQueue, screenshotRepo)
	log.Printf("[DEBUG] Handlers initialized")

	// Initialize Fiber app
	log.Printf("[DEBUG] Initializing Fiber app...")
	app := fiber.New(fiber.Config{
		AppName:      "User Tracker API",
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		BodyLimit:    10 * 1024 * 1024, // 10MB for screenshots
	})
	log.Printf("[DEBUG] Fiber app created")

	// Global middleware
	log.Printf("[DEBUG] Setting up global middleware...")
	app.Use(recover.New())
	app.Use(middleware.Logger())
	app.Use(middleware.CORS(corsOrigins))
	log.Printf("[DEBUG] Global middleware configured")

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
	log.Printf("[DEBUG] Server address: %s", addr)
	log.Printf("[DEBUG] Starting HTTP server in goroutine...")

	go func() {
		log.Printf("[DEBUG] HTTP server goroutine started, calling app.Listen(%s)...", addr)
		if err := app.Listen(addr); err != nil {
			log.Printf("[DEBUG] HTTP server error: %v", err)
			log.Printf("Server error: %v", err)
		}
	}()

	log.Printf("[DEBUG] HTTP server goroutine launched, waiting for server to start...")
	// Give server a moment to start
	time.Sleep(100 * time.Millisecond)
	log.Printf("[DEBUG] Server startup sequence completed")

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
