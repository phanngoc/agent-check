package handlers

import (
	"encoding/base64"
	"fmt"
	"log"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/ngocp/user-tracker/internal/models"
	"github.com/ngocp/user-tracker/internal/repository"
)

type TrackHandler struct {
	eventRepo      *repository.EventRepository
	screenshotRepo *repository.ScreenshotRepository
}

func NewTrackHandler(eventRepo *repository.EventRepository, screenshotRepo *repository.ScreenshotRepository) *TrackHandler {
	return &TrackHandler{
		eventRepo:      eventRepo,
		screenshotRepo: screenshotRepo,
	}
}

func (h *TrackHandler) TrackEvents(c *fiber.Ctx) error {
	var req models.TrackEventRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if req.SessionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "session_id is required",
		})
	}

	if len(req.Events) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "events array cannot be empty",
		})
	}

	sessionID, err := uuid.Parse(req.SessionID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid session ID format",
		})
	}

	err = h.eventRepo.CreateBatch(c.Context(), sessionID, req.Events)
	if err != nil {
		log.Printf("Failed to create events: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to save events",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Events tracked successfully",
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
