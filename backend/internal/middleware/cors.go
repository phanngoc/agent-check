package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

func CORS(origins string) fiber.Handler {
	// Configure CORS - default to allow all origins
	var allowOrigins interface{} = "*"

	// If specific origins are provided and not "*", process them
	if origins != "" && origins != "*" {
		// Split origins by comma and trim spaces
		originList := strings.Split(origins, ",")
		trimmedOrigins := make([]string, 0, len(originList))
		for _, origin := range originList {
			trimmed := strings.TrimSpace(origin)
			if trimmed != "" {
				trimmedOrigins = append(trimmedOrigins, trimmed)
			}
		}

		// If we have multiple origins, use slice; otherwise use single string
		if len(trimmedOrigins) > 1 {
			allowOrigins = trimmedOrigins
		} else if len(trimmedOrigins) == 1 {
			allowOrigins = trimmedOrigins[0]
		}
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
