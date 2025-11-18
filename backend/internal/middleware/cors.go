package middleware

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

func CORS(origins string) fiber.Handler {
	// Configure CORS to allow all origins
	config := cors.Config{
		AllowOrigins:     "*",
		AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization",
		AllowCredentials: false, // Cannot use credentials with wildcard origin
		MaxAge:           86400,
	}

	return cors.New(config)
}
