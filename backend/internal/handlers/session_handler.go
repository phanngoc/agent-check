package handlers

import (
	"log"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/ngocp/user-tracker/internal/models"
	"github.com/ngocp/user-tracker/internal/repository"
)

type SessionHandler struct {
	sessionRepo *repository.SessionRepository
	eventRepo   *repository.EventRepository
}

func NewSessionHandler(sessionRepo *repository.SessionRepository, eventRepo *repository.EventRepository) *SessionHandler {
	return &SessionHandler{
		sessionRepo: sessionRepo,
		eventRepo:   eventRepo,
	}
}

func (h *SessionHandler) CreateSession(c *fiber.Ctx) error {
	var req models.CreateSessionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if req.PageURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "page_url is required",
		})
	}

	session, err := h.sessionRepo.Create(c.Context(), &req)
	if err != nil {
		log.Printf("Failed to create session: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create session",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(session)
}

func (h *SessionHandler) GetSession(c *fiber.Ctx) error {
	sessionID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid session ID",
		})
	}

	session, err := h.sessionRepo.GetByID(c.Context(), sessionID)
	if err != nil {
		log.Printf("Failed to get session: %v", err)
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Session not found",
		})
	}

	return c.JSON(session)
}

func (h *SessionHandler) ListSessions(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", 50)
	offset := c.QueryInt("offset", 0)

	if limit > 100 {
		limit = 100
	}

	sessions, err := h.sessionRepo.List(c.Context(), limit, offset)
	if err != nil {
		log.Printf("Failed to list sessions: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to list sessions",
		})
	}

	total, err := h.sessionRepo.Count(c.Context())
	if err != nil {
		log.Printf("Failed to count sessions: %v", err)
		total = 0
	}

	return c.JSON(fiber.Map{
		"data":  sessions,
		"total": total,
		"limit": limit,
		"offset": offset,
	})
}

func (h *SessionHandler) GetSessionEvents(c *fiber.Ctx) error {
	sessionID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid session ID",
		})
	}

	limitStr := c.Query("limit", "1000")
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit > 10000 {
		limit = 1000
	}

	events, err := h.eventRepo.GetBySessionID(c.Context(), sessionID, limit)
	if err != nil {
		log.Printf("Failed to get events: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to get events",
		})
	}

	total, err := h.eventRepo.CountBySessionID(c.Context(), sessionID)
	if err != nil {
		log.Printf("Failed to count events: %v", err)
		total = 0
	}

	return c.JSON(fiber.Map{
		"data":  events,
		"total": total,
	})
}

func (h *SessionHandler) EndSession(c *fiber.Ctx) error {
	sessionID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid session ID",
		})
	}

	err = h.sessionRepo.UpdateEndTime(c.Context(), sessionID)
	if err != nil {
		log.Printf("Failed to end session: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to end session",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Session ended successfully",
	})
}
