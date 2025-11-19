package middleware

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

func CORS(origins string) fiber.Handler {
	// Configure CORS - default to allow all origins
	allowOrigins := "*"

	// If specific origins are provided and not "*", use them
	if origins != "" && origins != "*" {
		allowOrigins = origins
	}

	config := cors.Config{
		AllowOrigins:     allowOrigins,
		AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization",
		AllowCredentials: false,
		MaxAge:           86400,
	}

	return cors.New(config)
}
