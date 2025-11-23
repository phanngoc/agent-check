package handlers

import (
	"encoding/base64"
	"log"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/ngocp/user-tracker/internal/models"
	"github.com/ngocp/user-tracker/internal/repository"
)

type IssueHandler struct {
	issueRepo      *repository.IssueRepository
	attachmentRepo *repository.AttachmentRepository
}

func NewIssueHandler(issueRepo *repository.IssueRepository, attachmentRepo *repository.AttachmentRepository) *IssueHandler {
	return &IssueHandler{
		issueRepo:      issueRepo,
		attachmentRepo: attachmentRepo,
	}
}

func (h *IssueHandler) CreateIssue(c *fiber.Ctx) error {
	var req models.CreateIssueRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid request body",
			"details": err.Error(),
		})
	}

	issue, err := h.issueRepo.Create(c.Context(), &req)
	if err != nil {
		log.Printf("Failed to create issue: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create issue",
		})
	}

	response := models.IssueResponse{
		IssueID:      issue.IssueID,
		SessionID:    issue.SessionID,
		PageURL:      issue.PageURL,
		Title:        issue.Title,
		Description:  issue.Description,
		ScreenshotID: issue.ScreenshotID,
		Status:       issue.Status,
		CreatedAt:    issue.CreatedAt,
		UpdatedAt:    issue.UpdatedAt,
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Issue created successfully",
		"data":    response,
	})
}

func (h *IssueHandler) GetIssue(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid issue ID",
		})
	}

	issue, err := h.issueRepo.GetByID(c.Context(), id)
	if err != nil {
		log.Printf("Failed to get issue: %v", err)
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Issue not found",
		})
	}

	response := models.IssueResponse{
		IssueID:      issue.IssueID,
		SessionID:    issue.SessionID,
		PageURL:      issue.PageURL,
		Title:        issue.Title,
		Description:  issue.Description,
		ScreenshotID: issue.ScreenshotID,
		Status:       issue.Status,
		CreatedAt:    issue.CreatedAt,
		UpdatedAt:    issue.UpdatedAt,
	}

	return c.JSON(fiber.Map{
		"data": response,
	})
}

func (h *IssueHandler) ListIssues(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", 50)
	offset := c.QueryInt("offset", 0)

	if limit > 100 {
		limit = 100
	}
	if limit < 1 {
		limit = 1
	}
	if offset < 0 {
		offset = 0
	}

	issues, total, err := h.issueRepo.List(c.Context(), limit, offset)
	if err != nil {
		log.Printf("Failed to list issues: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to list issues",
		})
	}

	return c.JSON(fiber.Map{
		"data":   issues,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *IssueHandler) GetIssuesBySession(c *fiber.Ctx) error {
	sessionID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid session ID",
		})
	}

	issues, err := h.issueRepo.GetBySessionID(c.Context(), sessionID)
	if err != nil {
		log.Printf("Failed to get issues: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to get issues",
		})
	}

	return c.JSON(fiber.Map{
		"data": issues,
	})
}

func (h *IssueHandler) UpdateIssueStatus(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid issue ID",
		})
	}

	var req models.UpdateIssueStatusRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid request body",
			"details": err.Error(),
		})
	}

	err = h.issueRepo.UpdateStatus(c.Context(), id, req.Status)
	if err != nil {
		log.Printf("Failed to update issue status: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update issue status",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Issue status updated successfully",
	})
}

func (h *IssueHandler) GetIssueAttachments(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid issue ID",
		})
	}

	includeData := c.QueryBool("include_data", false)

	if includeData {
		attachments, err := h.attachmentRepo.GetByIssueIDWithData(c.Context(), id)
		if err != nil {
			log.Printf("Failed to get attachments: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to get attachments",
			})
		}

		// Convert to response format with data URLs
		responses := make([]models.AttachmentResponse, len(attachments))
		for i, att := range attachments {
			dataURL := "data:" + att.FileType + ";base64," + base64.StdEncoding.EncodeToString(att.FileData)
			responses[i] = models.AttachmentResponse{
				AttachmentID: att.AttachmentID,
				IssueID:      att.IssueID,
				FileName:     att.FileName,
				FileType:     att.FileType,
				FileSize:     att.FileSize,
				CreatedAt:    att.CreatedAt,
				DataURL:      dataURL,
			}
		}

		return c.JSON(fiber.Map{
			"data": responses,
		})
	}

	attachments, err := h.attachmentRepo.GetByIssueID(c.Context(), id)
	if err != nil {
		log.Printf("Failed to get attachments: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to get attachments",
		})
	}

	return c.JSON(fiber.Map{
		"data": attachments,
	})
}

