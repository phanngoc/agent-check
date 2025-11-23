package models

import (
	"time"

	"github.com/google/uuid"
)

type Issue struct {
	IssueID      int64     `json:"issue_id" db:"issue_id"`
	SessionID    uuid.UUID `json:"session_id" db:"session_id"`
	PageURL      string    `json:"page_url" db:"page_url"`
	Title        string    `json:"title" db:"title"`
	Description  string    `json:"description" db:"description"`
	ScreenshotID *int64    `json:"screenshot_id,omitempty" db:"screenshot_id"`
	Status       string    `json:"status" db:"status"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

type IssueResponse struct {
	IssueID      int64     `json:"issue_id"`
	SessionID    uuid.UUID `json:"session_id"`
	PageURL      string    `json:"page_url"`
	Title        string    `json:"title"`
	Description  string    `json:"description"`
	ScreenshotID *int64    `json:"screenshot_id,omitempty"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type CreateIssueRequest struct {
	SessionID    string  `json:"session_id" validate:"required"`
	PageURL      string  `json:"page_url" validate:"required"`
	Title        string  `json:"title" validate:"required"`
	Description  string  `json:"description" validate:"required"`
	ScreenshotID *int64  `json:"screenshot_id,omitempty"`
}

type UpdateIssueStatusRequest struct {
	Status string `json:"status" validate:"required,oneof=new open in-progress resolved closed"`
}

