package models

import (
	"time"

	"github.com/google/uuid"
)

type Screenshot struct {
	ScreenshotID int64     `json:"screenshot_id" db:"screenshot_id"`
	SessionID    uuid.UUID `json:"session_id" db:"session_id"`
	PageURL      string    `json:"page_url" db:"page_url"`
	Timestamp    time.Time `json:"timestamp" db:"timestamp"`
	ImageData    []byte    `json:"-" db:"image_data"`
	ImageFormat  string    `json:"image_format" db:"image_format"`
	ImageWidth   *int      `json:"image_width,omitempty" db:"image_width"`
	ImageHeight  *int      `json:"image_height,omitempty" db:"image_height"`
	FileSize     *int      `json:"file_size,omitempty" db:"file_size"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
}

type ScreenshotResponse struct {
	ScreenshotID int64     `json:"screenshot_id"`
	SessionID    uuid.UUID `json:"session_id"`
	PageURL      string    `json:"page_url"`
	Timestamp    time.Time `json:"timestamp"`
	ImageFormat  string    `json:"image_format"`
	ImageWidth   *int      `json:"image_width,omitempty"`
	ImageHeight  *int      `json:"image_height,omitempty"`
	FileSize     *int      `json:"file_size,omitempty"`
	DataURL      string    `json:"data_url,omitempty"`
}

type UploadScreenshotRequest struct {
	SessionID string    `json:"session_id" validate:"required"`
	PageURL   string    `json:"page_url" validate:"required"`
	Timestamp time.Time `json:"timestamp" validate:"required"`
	ImageData string    `json:"image_data" validate:"required"`
	Width     *int      `json:"width,omitempty"`
	Height    *int      `json:"height,omitempty"`
}
