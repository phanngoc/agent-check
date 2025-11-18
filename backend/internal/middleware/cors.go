package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

func CORS(origins string) fiber.Handler {
	// Split and trim origins, filter out empty strings
	splitOrigins := strings.Split(origins, ",")
	allowedOrigins := make([]string, 0, len(splitOrigins))
	for _, origin := range splitOrigins {
		trimmed := strings.TrimSpace(origin)
		if trimmed != "" {
			allowedOrigins = append(allowedOrigins, trimmed)
		}
	}

	// Check if wildcard is requested
	allowAll := false
	for _, origin := range allowedOrigins {
		if origin == "*" {
			allowAll = true
			break
		}
	}

	// If wildcard is not used, add "null" to support file:// protocol
	if !allowAll {
		hasNull := false
		for _, origin := range allowedOrigins {
			if origin == "null" {
				hasNull = true
				break
			}
		}
		if !hasNull {
			allowedOrigins = append(allowedOrigins, "null")
		}
	}

	// Configure CORS
	config := cors.Config{
		AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization",
		MaxAge:           86400,
		AllowCredentials: true,
	}

	if allowAll {
		// When using wildcard, credentials cannot be allowed
		config.AllowOrigins = "*"
		config.AllowCredentials = false
	} else {
		// Use slice for multiple origins to ensure proper CORS handling
		config.AllowOrigins = strings.Join(allowedOrigins, ",")
		config.AllowCredentials = true
	}

	return cors.New(config)
}
