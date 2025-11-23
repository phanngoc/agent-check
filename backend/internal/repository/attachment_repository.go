package repository

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/ngocp/user-tracker/internal/models"
)

type AttachmentRepository struct {
	db *Database
}

func NewAttachmentRepository(db *Database) *AttachmentRepository {
	return &AttachmentRepository{db: db}
}

func (r *AttachmentRepository) Create(ctx context.Context, req *models.UploadAttachmentRequest) (*models.Attachment, error) {
	// Decode base64 file data
	fileData, err := decodeFileData(req.FileData)
	if err != nil {
		return nil, fmt.Errorf("failed to decode file data: %w", err)
	}

	fileSize := len(fileData)

	query := `
		INSERT INTO attachments (issue_id, file_data, file_name, file_type, file_size)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING attachment_id, created_at
	`

	attachment := &models.Attachment{
		IssueID:  req.IssueID,
		FileData: fileData,
		FileName: req.FileName,
		FileType: req.FileType,
		FileSize: fileSize,
	}

	err = r.db.Pool.QueryRow(ctx, query,
		req.IssueID, fileData, req.FileName, req.FileType, fileSize,
	).Scan(&attachment.AttachmentID, &attachment.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create attachment: %w", err)
	}

	return attachment, nil
}

func (r *AttachmentRepository) GetByID(ctx context.Context, attachmentID int64) (*models.Attachment, error) {
	query := `
		SELECT attachment_id, issue_id, file_data, file_name, file_type, file_size, created_at
		FROM attachments
		WHERE attachment_id = $1
	`

	attachment := &models.Attachment{}
	err := r.db.Pool.QueryRow(ctx, query, attachmentID).Scan(
		&attachment.AttachmentID, &attachment.IssueID, &attachment.FileData,
		&attachment.FileName, &attachment.FileType, &attachment.FileSize,
		&attachment.CreatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get attachment: %w", err)
	}

	return attachment, nil
}

func (r *AttachmentRepository) GetByIssueID(ctx context.Context, issueID int64) ([]*models.AttachmentResponse, error) {
	query := `
		SELECT attachment_id, issue_id, file_name, file_type, file_size, created_at
		FROM attachments
		WHERE issue_id = $1
		ORDER BY created_at ASC
	`

	rows, err := r.db.Pool.Query(ctx, query, issueID)
	if err != nil {
		return nil, fmt.Errorf("failed to get attachments: %w", err)
	}
	defer rows.Close()

	var attachments []*models.AttachmentResponse
	for rows.Next() {
		attachment := &models.AttachmentResponse{}
		err := rows.Scan(
			&attachment.AttachmentID, &attachment.IssueID, &attachment.FileName,
			&attachment.FileType, &attachment.FileSize, &attachment.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan attachment: %w", err)
		}
		attachments = append(attachments, attachment)
	}

	return attachments, nil
}

func (r *AttachmentRepository) GetByIssueIDWithData(ctx context.Context, issueID int64) ([]*models.Attachment, error) {
	query := `
		SELECT attachment_id, issue_id, file_data, file_name, file_type, file_size, created_at
		FROM attachments
		WHERE issue_id = $1
		ORDER BY created_at ASC
	`

	rows, err := r.db.Pool.Query(ctx, query, issueID)
	if err != nil {
		return nil, fmt.Errorf("failed to get attachments: %w", err)
	}
	defer rows.Close()

	var attachments []*models.Attachment
	for rows.Next() {
		attachment := &models.Attachment{}
		err := rows.Scan(
			&attachment.AttachmentID, &attachment.IssueID, &attachment.FileData,
			&attachment.FileName, &attachment.FileType, &attachment.FileSize,
			&attachment.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan attachment: %w", err)
		}
		attachments = append(attachments, attachment)
	}

	return attachments, nil
}

// decodeFileData decodes base64 file data and returns the raw bytes
func decodeFileData(dataURL string) ([]byte, error) {
	// Handle data URL format: data:image/png;base64,xxxxx or data:text/plain;base64,xxxxx
	if strings.HasPrefix(dataURL, "data:") {
		parts := strings.SplitN(dataURL, ",", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid data URL format")
		}

		data, err := base64.StdEncoding.DecodeString(parts[1])
		if err != nil {
			return nil, fmt.Errorf("failed to decode base64: %w", err)
		}

		return data, nil
	}

	// Handle plain base64 without data URL prefix
	data, err := base64.StdEncoding.DecodeString(dataURL)
	if err != nil {
		return nil, fmt.Errorf("failed to decode base64: %w", err)
	}

	return data, nil
}

