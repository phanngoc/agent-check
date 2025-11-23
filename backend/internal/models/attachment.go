package models

import (
	"time"
)

type Attachment struct {
	AttachmentID int64     `json:"attachment_id" db:"attachment_id"`
	IssueID      int64     `json:"issue_id" db:"issue_id"`
	FileData     []byte    `json:"-" db:"file_data"`
	FileName     string    `json:"file_name" db:"file_name"`
	FileType     string    `json:"file_type" db:"file_type"`
	FileSize     int       `json:"file_size" db:"file_size"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
}

type AttachmentResponse struct {
	AttachmentID int64     `json:"attachment_id"`
	IssueID      int64     `json:"issue_id"`
	FileName     string    `json:"file_name"`
	FileType     string    `json:"file_type"`
	FileSize     int       `json:"file_size"`
	CreatedAt    time.Time `json:"created_at"`
	DataURL      string   `json:"data_url,omitempty"`
}

type UploadAttachmentRequest struct {
	IssueID  int64  `json:"issue_id" validate:"required"`
	FileData string `json:"file_data" validate:"required"` // base64 encoded
	FileName string `json:"file_name" validate:"required"`
	FileType string `json:"file_type" validate:"required"`
}

