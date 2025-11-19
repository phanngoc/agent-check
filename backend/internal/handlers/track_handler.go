package handlers

import (
	"encoding/base64"
	"fmt"
	"log"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/ngocp/user-tracker/internal/models"
	"github.com/ngocp/user-tracker/internal/queue"
	"github.com/ngocp/user-tracker/internal/repository"
)

type TrackHandler struct {
	eventQueue     *queue.EventQueue
	screenshotRepo *repository.ScreenshotRepository
}

func NewTrackHandler(eventQueue *queue.EventQueue, screenshotRepo *repository.ScreenshotRepository) *TrackHandler {
	return &TrackHandler{
		eventQueue:     eventQueue,
		screenshotRepo: screenshotRepo,
	}
}

func (h *TrackHandler) TrackEvents(c *fiber.Ctx) error {
	// Log raw request body for debugging (read before parsing)
	rawBody := string(c.Body())
	if len(rawBody) > 0 {
		bodyPreview := rawBody
		if len(bodyPreview) > 500 {
			bodyPreview = bodyPreview[:500] + "..."
		}
		log.Printf("[TrackEvents] Raw request body: %s", bodyPreview)
	} else {
		log.Printf("[TrackEvents] Warning: Request body is empty")
	}

	var req models.TrackEventRequest
	if err := c.BodyParser(&req); err != nil {
		log.Printf("[TrackEvents] BodyParser error: %v", err)
		log.Printf("[TrackEvents] Full raw body: %s", rawBody)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid request body",
			"details": err.Error(),
		})
	}

	log.Printf("[TrackEvents] Parsed request - SessionID: %s, Events count: %d", req.SessionID, len(req.Events))
	if len(req.Events) > 0 {
		firstEvent := req.Events[0]
		log.Printf("[TrackEvents] First event - Type: %s, PageURL: %s, Timestamp: %v (Zero: %v)", 
			firstEvent.EventType, firstEvent.PageURL, firstEvent.Timestamp, firstEvent.Timestamp.IsZero())
		
		// Validate timestamp - check if it's zero (not parsed correctly)
		if firstEvent.Timestamp.IsZero() {
			log.Printf("[TrackEvents] Warning: First event has zero timestamp - may indicate parsing issue")
		}
		
		// Validate required fields
		if firstEvent.PageURL == "" {
			log.Printf("[TrackEvents] Warning: First event has empty page_url")
		}
		if firstEvent.EventType == "" {
			log.Printf("[TrackEvents] Warning: First event has empty event_type")
		}
	}

	if req.SessionID == "" {
		log.Printf("[TrackEvents] Validation error: session_id is empty")
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "session_id is required",
			"details": "The session_id field cannot be empty",
		})
	}

	if len(req.Events) == 0 {
		log.Printf("[TrackEvents] Validation error: events array is empty")
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "events array cannot be empty",
			"details": "At least one event must be provided",
		})
	}

	// Validate each event
	for i, event := range req.Events {
		if event.Timestamp.IsZero() {
			log.Printf("[TrackEvents] Validation error: event[%d] has invalid timestamp (zero value)", i)
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error":   "Invalid event timestamp",
				"details": fmt.Sprintf("Event at index %d has invalid or missing timestamp", i),
			})
		}
		if event.EventType == "" {
			log.Printf("[TrackEvents] Validation error: event[%d] has empty event_type", i)
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error":   "Invalid event type",
				"details": fmt.Sprintf("Event at index %d has empty event_type", i),
			})
		}
		if event.PageURL == "" {
			log.Printf("[TrackEvents] Validation error: event[%d] has empty page_url", i)
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error":   "Invalid page URL",
				"details": fmt.Sprintf("Event at index %d has empty page_url", i),
			})
		}
	}

	sessionID, err := uuid.Parse(req.SessionID)
	if err != nil {
		log.Printf("[TrackEvents] UUID parse error: %v, SessionID: %s", err, req.SessionID)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid session ID format",
			"details": fmt.Sprintf("Expected UUID format, got: %s", req.SessionID),
		})
	}

	// Enqueue events to Redis for async processing
	err = h.eventQueue.Enqueue(c.Context(), sessionID, req.Events)
	if err != nil {
		log.Printf("[TrackEvents] Failed to queue events: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to queue events",
		})
	}

	log.Printf("[TrackEvents] Successfully queued %d events for session %s", len(req.Events), sessionID)
	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"message": "Events queued successfully",
		"count":   len(req.Events),
	})
}

func (h *TrackHandler) UploadScreenshot(c *fiber.Ctx) error {
	var req models.UploadScreenshotRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if req.SessionID == "" || req.PageURL == "" || req.ImageData == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "session_id, page_url, and image_data are required",
		})
	}

	screenshot, err := h.screenshotRepo.Create(c.Context(), &req)
	if err != nil {
		log.Printf("Failed to save screenshot: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to save screenshot",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message":       "Screenshot uploaded successfully",
		"screenshot_id": screenshot.ScreenshotID,
	})
}

func (h *TrackHandler) GetScreenshot(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid screenshot ID",
		})
	}

	screenshot, err := h.screenshotRepo.GetByID(c.Context(), id)
	if err != nil {
		log.Printf("Failed to get screenshot: %v", err)
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Screenshot not found",
		})
	}

	// Return image data as base64 or raw bytes
	c.Set("Content-Type", "image/"+screenshot.ImageFormat)
	return c.Send(screenshot.ImageData)
}

func (h *TrackHandler) GetSessionScreenshots(c *fiber.Ctx) error {
	sessionID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid session ID",
		})
	}

	includeData := c.QueryBool("include_data", false)

	if includeData {
		screenshots, err := h.screenshotRepo.GetBySessionIDWithData(c.Context(), sessionID)
		if err != nil {
			log.Printf("Failed to get screenshots: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to get screenshots",
			})
		}

		// Convert to response format with data URLs
		responses := make([]models.ScreenshotResponse, len(screenshots))
		for i, ss := range screenshots {
			responses[i] = models.ScreenshotResponse{
				ScreenshotID: ss.ScreenshotID,
				SessionID:    ss.SessionID,
				PageURL:      ss.PageURL,
				Timestamp:    ss.Timestamp,
				ImageFormat:  ss.ImageFormat,
				ImageWidth:   ss.ImageWidth,
				ImageHeight:  ss.ImageHeight,
				FileSize:     ss.FileSize,
				DataURL:      fmt.Sprintf("data:image/%s;base64,%s", ss.ImageFormat, base64.StdEncoding.EncodeToString(ss.ImageData)),
			}
		}

		return c.JSON(fiber.Map{
			"data": responses,
		})
	}

	screenshots, err := h.screenshotRepo.GetBySessionID(c.Context(), sessionID)
	if err != nil {
		log.Printf("Failed to get screenshots: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to get screenshots",
		})
	}

	return c.JSON(fiber.Map{
		"data": screenshots,
	})
}
