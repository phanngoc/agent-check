package main

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/joho/godotenv"
	"github.com/ngocp/user-tracker/internal/handlers"
	"github.com/ngocp/user-tracker/internal/middleware"
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
	corsOrigins := getEnv("CORS_ORIGINS", "http://localhost:3000")

	// Initialize database
	db, err := repository.NewDatabase(databaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	log.Println("Successfully connected to database")

	// Initialize repositories
	sessionRepo := repository.NewSessionRepository(db)
	eventRepo := repository.NewEventRepository(db)
	screenshotRepo := repository.NewScreenshotRepository(db)

	// Initialize handlers
	sessionHandler := handlers.NewSessionHandler(sessionRepo, eventRepo)
	trackHandler := handlers.NewTrackHandler(eventRepo, screenshotRepo)

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
	app.Use(middleware.RateLimiter(100, 60*time.Second))

	// Health check
	app.Get("/health", func(c *fiber.Ctx) error {
		if err := db.Health(c.Context()); err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"status": "unhealthy",
				"error":  "Database connection failed",
			})
		}
		return c.JSON(fiber.Map{
			"status": "healthy",
		})
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

	// Start server
	addr := fmt.Sprintf("%s:%s", host, port)
	log.Printf("Server starting on %s", addr)

	if err := app.Listen(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}
