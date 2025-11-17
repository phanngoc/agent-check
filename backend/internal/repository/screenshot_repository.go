package repository

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/ngocp/user-tracker/internal/models"
)

type ScreenshotRepository struct {
	db *Database
}

func NewScreenshotRepository(db *Database) *ScreenshotRepository {
	return &ScreenshotRepository{db: db}
}

func (r *ScreenshotRepository) Create(ctx context.Context, req *models.UploadScreenshotRequest) (*models.Screenshot, error) {
	sessionID, err := uuid.Parse(req.SessionID)
	if err != nil {
		return nil, fmt.Errorf("invalid session ID: %w", err)
	}

	// Decode base64 image data
	imageData, format, err := decodeImageData(req.ImageData)
	if err != nil {
		return nil, fmt.Errorf("failed to decode image data: %w", err)
	}

	fileSize := len(imageData)

	query := `
		INSERT INTO screenshots (session_id, page_url, timestamp, image_data, image_format, image_width, image_height, file_size)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING screenshot_id, created_at
	`

	screenshot := &models.Screenshot{
		SessionID:   sessionID,
		PageURL:     req.PageURL,
		Timestamp:   req.Timestamp,
		ImageData:   imageData,
		ImageFormat: format,
		ImageWidth:  req.Width,
		ImageHeight: req.Height,
		FileSize:    &fileSize,
	}

	err = r.db.Pool.QueryRow(ctx, query,
		sessionID, req.PageURL, req.Timestamp, imageData, format,
		req.Width, req.Height, fileSize,
	).Scan(&screenshot.ScreenshotID, &screenshot.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create screenshot: %w", err)
	}

	return screenshot, nil
}

func (r *ScreenshotRepository) GetByID(ctx context.Context, screenshotID int64) (*models.Screenshot, error) {
	query := `
		SELECT screenshot_id, session_id, page_url, timestamp, image_data,
			image_format, image_width, image_height, file_size, created_at
		FROM screenshots
		WHERE screenshot_id = $1
	`

	screenshot := &models.Screenshot{}
	err := r.db.Pool.QueryRow(ctx, query, screenshotID).Scan(
		&screenshot.ScreenshotID, &screenshot.SessionID, &screenshot.PageURL,
		&screenshot.Timestamp, &screenshot.ImageData, &screenshot.ImageFormat,
		&screenshot.ImageWidth, &screenshot.ImageHeight, &screenshot.FileSize,
		&screenshot.CreatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get screenshot: %w", err)
	}

	return screenshot, nil
}

func (r *ScreenshotRepository) GetBySessionID(ctx context.Context, sessionID uuid.UUID) ([]*models.ScreenshotResponse, error) {
	query := `
		SELECT screenshot_id, session_id, page_url, timestamp,
			image_format, image_width, image_height, file_size
		FROM screenshots
		WHERE session_id = $1
		ORDER BY timestamp ASC
	`

	rows, err := r.db.Pool.Query(ctx, query, sessionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get screenshots: %w", err)
	}
	defer rows.Close()

	var screenshots []*models.ScreenshotResponse
	for rows.Next() {
		screenshot := &models.ScreenshotResponse{}
		err := rows.Scan(
			&screenshot.ScreenshotID, &screenshot.SessionID, &screenshot.PageURL,
			&screenshot.Timestamp, &screenshot.ImageFormat,
			&screenshot.ImageWidth, &screenshot.ImageHeight, &screenshot.FileSize,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan screenshot: %w", err)
		}
		screenshots = append(screenshots, screenshot)
	}

	return screenshots, nil
}

func (r *ScreenshotRepository) GetBySessionIDWithData(ctx context.Context, sessionID uuid.UUID) ([]*models.Screenshot, error) {
	query := `
		SELECT screenshot_id, session_id, page_url, timestamp, image_data,
			image_format, image_width, image_height, file_size, created_at
		FROM screenshots
		WHERE session_id = $1
		ORDER BY timestamp ASC
	`

	rows, err := r.db.Pool.Query(ctx, query, sessionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get screenshots: %w", err)
	}
	defer rows.Close()

	var screenshots []*models.Screenshot
	for rows.Next() {
		screenshot := &models.Screenshot{}
		err := rows.Scan(
			&screenshot.ScreenshotID, &screenshot.SessionID, &screenshot.PageURL,
			&screenshot.Timestamp, &screenshot.ImageData, &screenshot.ImageFormat,
			&screenshot.ImageWidth, &screenshot.ImageHeight, &screenshot.FileSize,
			&screenshot.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan screenshot: %w", err)
		}
		screenshots = append(screenshots, screenshot)
	}

	return screenshots, nil
}

// decodeImageData decodes base64 image data and returns the raw bytes and format
func decodeImageData(dataURL string) ([]byte, string, error) {
	// Handle data URL format: data:image/png;base64,xxxxx
	if strings.HasPrefix(dataURL, "data:") {
		parts := strings.SplitN(dataURL, ",", 2)
		if len(parts) != 2 {
			return nil, "", fmt.Errorf("invalid data URL format")
		}

		// Extract format from data URL
		format := "jpeg"
		if strings.Contains(parts[0], "image/png") {
			format = "png"
		} else if strings.Contains(parts[0], "image/jpeg") || strings.Contains(parts[0], "image/jpg") {
			format = "jpeg"
		}

		data, err := base64.StdEncoding.DecodeString(parts[1])
		if err != nil {
			return nil, "", fmt.Errorf("failed to decode base64: %w", err)
		}

		return data, format, nil
	}

	// Handle plain base64 without data URL prefix
	data, err := base64.StdEncoding.DecodeString(dataURL)
	if err != nil {
		return nil, "", fmt.Errorf("failed to decode base64: %w", err)
	}

	return data, "jpeg", nil
}
